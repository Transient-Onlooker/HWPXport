import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai';
import { buildHwpx, generateHwpxFilename } from '@/lib/hwpx/builder';
import { ExamData } from '@/lib/types';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const MODEL_ROUTER = 'gemini-3.1-flash-lite-preview';
const MODEL_PARSER_COMPLEX = 'gemini-3-flash-preview';
const MODEL_PARSER_SIMPLE = 'gemini-3-flash-preview';

const EXAM_DATA_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    title: {
      type: SchemaType.STRING,
      description: 'Exam title',
    },
    questions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          number: {
            type: SchemaType.NUMBER,
            description: 'Question number',
          },
          text: {
            type: SchemaType.STRING,
            description: 'Question text with markdown emphasis and HWP-style formulas',
          },
          boxContext: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: 'Detached context block lines only when visually present in the source',
          },
          contextLabel: {
            type: SchemaType.STRING,
            description: 'Context kind: box, passage, condition, data, or example',
          },
          needsFigure: {
            type: SchemaType.BOOLEAN,
            description: 'Whether the question needs manual figure insertion later',
          },
          options: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: 'Answer choices without numbering prefixes',
          },
        },
        required: ['number', 'text', 'boxContext', 'needsFigure', 'options'],
      },
    },
  },
  required: ['title', 'questions'],
};

const ROUTER_PROMPT = `
Analyze this image and determine if it contains complex mathematical content.

Check for:
- Mathematical formulas (fractions, roots, summations, integrals, etc.)
- Complex tables with mathematical notation
- Graphs, charts with mathematical axes or functions

Respond ONLY with valid JSON in this exact format:
{"isComplex": boolean}

No explanations, no additional text.
`;

const PARSER_SHARED_RULES = `
Critical extraction rules:
1. Keep Korean text exactly as shown whenever it is visible.
2. Never replace visible source text with placeholders such as "...", "(본문 생략)", "(지문 생략)", "요약", or similar shortened text unless those exact words are literally printed in the source.
3. If a passage is long, still transcribe the visible text in full instead of abbreviating it.
4. Preserve underlined, bold, boxed, or otherwise emphasized phrases with markdown bold syntax like **this**.
5. If a question contains a graph, chart, diagram, table, chemical structure, or other important non-text figure that should later be inserted manually, set "needsFigure" to true. Otherwise set it to false.
6. If boxContext contains a detached block, classify it with contextLabel:
   - "passage" for long reading passages or shared stems
   - "condition" for answer conditions or constraints
   - "data" for data blocks, tables, or reference materials
   - "example" for 보기/example statement blocks
   - "box" for generic boxed content when the type is unclear
7. If a shared passage header exists, such as "[1-3] ..." or "다음 글을 읽고 ...", include that header inside boxContext and use contextLabel "passage" instead of merging it into the main question text.
8. Keep each visible passage line as a separate boxContext item when possible, especially for long reading passages.
9. For multiple-choice questions, return each option as plain option text only. Do not include leading numbering markers such as "①", "(1)", "1.", or similar prefixes.
10. boxContext is optional. If there is no clearly visible detached block in the source, use [].
11. Never invent quotations, summaries, omitted text, background explanations, or reconstructed passage lines that are not visibly present in the source.
12. When uncertain whether a detached block really exists, leave boxContext empty instead of guessing.
13. Return ONLY JSON matching the schema.
`;

const PARSER_PROMPT_COMPLEX = `
You are an expert HWP formula parser. Your task is to extract exam questions from Korean test images with perfect mathematical notation.

Math normalization rules:
1. Fractions: \`n over 2\`
2. Square root: \`sqrt{3}\`
3. Superscript: \`x^2\`
4. Subscript: \`x_i\`, \`a_n\`
5. Summation: \`sum from i=1 to n\`
6. Product: \`prod from i=1 to n\`
7. Integral: \`int from a to b\`

${PARSER_SHARED_RULES}
`;

const PARSER_PROMPT_SIMPLE = `
You are an exam text extraction specialist. Extract questions from Korean test images.

Basic math may use \`n over 2\`, \`x^2\`, \`sqrt{3}\`.

${PARSER_SHARED_RULES}
`;

async function processImageFile(file: File): Promise<{ data: string; mimeType: string }> {
  const arrayBuffer = await file.arrayBuffer();
  return {
    data: Buffer.from(arrayBuffer).toString('base64'),
    mimeType: file.type || 'image/png',
  };
}

function isJsonFile(file: File): boolean {
  return file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');
}

function extractJsonObject(rawText: string): string {
  const trimmed = rawText.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return trimmed;
}

function removeTrailingCommas(jsonText: string): string {
  return jsonText.replace(/,\s*([}\]])/g, '$1');
}

function stripOptionPrefix(option: string): string {
  return option.replace(/^\s*(?:\(?\d+\)?[.:]?|[①②③④⑤⑥⑦⑧⑨⑩])\s*/u, '').trim();
}

function isHallucinatedBoxContextLine(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return [
    '본문 생략',
    '지문 생략',
    '앞부분 줄거리',
    '줄거리',
    '요약',
    '생략',
    '본문 요약',
    '배경 설명',
  ].some((token) => normalized.includes(token));
}

function normalizeExamData(examData: ExamData): ExamData {
  return {
    title: examData.title.trim(),
    questions: examData.questions.map((question) => ({
      ...question,
      contextLabel: question.contextLabel ?? 'box',
      needsFigure: question.needsFigure === true,
      text: question.text.trim(),
      boxContext: question.boxContext
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .filter((value) => !isHallucinatedBoxContextLine(value)),
      options: question.options.map(stripOptionPrefix).filter((value) => value.length > 0),
    })),
  };
}

function parseUploadedExamData(rawText: string): ExamData {
  const extracted = extractJsonObject(rawText);
  const sanitized = removeTrailingCommas(extracted);

  try {
    const examData = normalizeExamData(JSON.parse(sanitized));
    validateExamData(examData);
    return examData;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Uploaded JSON is invalid. Remove comments/explanations and ensure commas and quotes are valid. ${error.message}`
      );
    }

    throw error;
  }
}

function validateExamData(data: unknown): asserts data is ExamData {
  if (!data || typeof data !== 'object') {
    throw new Error('JSON root must be an object.');
  }

  const candidate = data as Partial<ExamData>;
  if (typeof candidate.title !== 'string' || candidate.title.trim().length === 0) {
    throw new Error('ExamData.title must be a non-empty string.');
  }

  if (!Array.isArray(candidate.questions)) {
    throw new Error('ExamData.questions must be an array.');
  }

  candidate.questions.forEach((question, index) => {
    if (!question || typeof question !== 'object') {
      throw new Error(`Question ${index + 1} must be an object.`);
    }

    const item = question as ExamData['questions'][number];
    if (typeof item.number !== 'number') {
      throw new Error(`Question ${index + 1} needs a numeric number.`);
    }
    if (typeof item.text !== 'string') {
      throw new Error(`Question ${index + 1} needs a text string.`);
    }
    if (item.contextLabel !== undefined && typeof item.contextLabel !== 'string') {
      throw new Error(`Question ${index + 1} has an invalid contextLabel.`);
    }
    if (typeof item.needsFigure !== 'boolean') {
      throw new Error(`Question ${index + 1} needs a boolean needsFigure field.`);
    }
    if (!Array.isArray(item.boxContext) || !item.boxContext.every((value) => typeof value === 'string')) {
      throw new Error(`Question ${index + 1} has an invalid boxContext.`);
    }
    if (!Array.isArray(item.options) || !item.options.every((value) => typeof value === 'string')) {
      throw new Error(`Question ${index + 1} has an invalid options field.`);
    }
  });
}

async function runRouter(imageData: { data: string; mimeType: string }): Promise<boolean> {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: MODEL_ROUTER,
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const result = await model.generateContent([
    {
      inlineData: {
        data: imageData.data,
        mimeType: imageData.mimeType,
      },
    },
    ROUTER_PROMPT,
  ]);

  const response = JSON.parse(result.response.text());
  return response.isComplex === true;
}

async function runParser(
  imageData: { data: string; mimeType: string },
  isComplex: boolean
): Promise<ExamData> {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: isComplex ? MODEL_PARSER_COMPLEX : MODEL_PARSER_SIMPLE,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: EXAM_DATA_SCHEMA,
    },
  });

  const result = await model.generateContent([
    {
      inlineData: {
        data: imageData.data,
        mimeType: imageData.mimeType,
      },
    },
    isComplex ? PARSER_PROMPT_COMPLEX : PARSER_PROMPT_SIMPLE,
  ]);

  const examData = normalizeExamData(JSON.parse(result.response.text()));
  validateExamData(examData);
  return examData;
}

function buildHwpxResponse(examData: ExamData, hwpxBuffer: Uint8Array): NextResponse {
  const filename = generateHwpxFilename(examData.title);
  const encodedFilename = encodeURIComponent(filename).replace(/'/g, '%27');
  const jsonData = Buffer.from(JSON.stringify(examData, null, 2)).toString('base64');

  return new NextResponse(Buffer.from(hwpxBuffer), {
    headers: {
      'Content-Type': 'application/vnd.hanplus.hwpx',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}`,
      'X-Exam-Data': jsonData,
    },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'File was not provided.' }, { status: 400 });
    }

    if (isJsonFile(file)) {
      const examData = parseUploadedExamData(await file.text());
      return buildHwpxResponse(examData, await buildHwpx(examData));
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'GEMINI_API_KEY is not configured.' },
        { status: 500 }
      );
    }

    const imageData = await processImageFile(file);
    const isComplex = await runRouter(imageData);
    const examData = await runParser(imageData, isComplex);

    return buildHwpxResponse(examData, await buildHwpx(examData));
  } catch (error) {
    console.error('[process] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

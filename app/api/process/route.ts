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
            description: 'Boxed context lines',
          },
          options: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: 'Answer choices',
          },
        },
        required: ['number', 'text', 'boxContext', 'options'],
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

const PARSER_PROMPT_COMPLEX = `
You are an expert HWP formula parser. Your task is to extract exam questions from Korean test images with perfect mathematical notation.

Critical rules:
1. Fractions: \`n over 2\`
2. Square root: \`sqrt{3}\`
3. Superscript: \`x^2\`
4. Subscript: \`x_i\`, \`a_n\`
5. Summation: \`sum from i=1 to n\`
6. Product: \`prod from i=1 to n\`
7. Integral: \`int from a to b\`
8. Emphasis or underline: markdown \`**text**\`
9. Keep Korean text exactly as shown
10. Return ONLY JSON matching the schema
`;

const PARSER_PROMPT_SIMPLE = `
You are an exam text extraction specialist. Extract questions from Korean test images.

Rules:
1. Emphasis or underline: markdown \`**text**\`
2. Keep Korean text exactly as shown
3. Basic math may use \`n over 2\`, \`x^2\`, \`sqrt{3}\`
4. Return ONLY JSON matching the schema
`;

async function processImageFile(file: File): Promise<{ data: string; mimeType: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const base64Data = Buffer.from(arrayBuffer).toString('base64');
  const mimeType = file.type || 'image/png';
  return { data: base64Data, mimeType };
}

function isJsonFile(file: File): boolean {
  return file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');
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

  const prompt = isComplex ? PARSER_PROMPT_COMPLEX : PARSER_PROMPT_SIMPLE;
  const result = await model.generateContent([
    {
      inlineData: {
        data: imageData.data,
        mimeType: imageData.mimeType,
      },
    },
    prompt,
  ]);

  const examData: ExamData = JSON.parse(result.response.text());
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
      return NextResponse.json(
        { success: false, error: 'File was not provided.' },
        { status: 400 }
      );
    }

    if (isJsonFile(file)) {
      const rawText = await file.text();
      const examData = JSON.parse(rawText);
      validateExamData(examData);
      const hwpxBuffer = await buildHwpx(examData);
      return buildHwpxResponse(examData, hwpxBuffer);
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
    const hwpxBuffer = await buildHwpx(examData);

    return buildHwpxResponse(examData, hwpxBuffer);
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

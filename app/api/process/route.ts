import { NextRequest, NextResponse } from 'next/server';
import { ExamData, ProcessResult } from '@/lib/types';
import { buildHwpx, generateHwpxFilename } from '@/lib/hwpx/builder';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

/**
 * Gemini 듀얼 트랙 기반 HWPX 시험지 복원 API
 *
 * Track 1 (Lite): 이미지 복잡도 판별 → 비용 절감
 * Track 2 (Flash): 정밀 파싱 → 수식/구조 추출
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 모델 상수
const MODEL_ROUTER = 'gemini-3.1-flash-lite-preview';  // 복잡도 판별용 (저비용)
const MODEL_PARSER_COMPLEX = 'gemini-3-flash-preview';       // 정밀 파싱용 (복잡한 수식)
const MODEL_PARSER_SIMPLE = 'gemini-3-flash-preview';        // 빠른 파싱용 (텍스트 중심)

/**
 * Gemini response schema (ExamData 구조)
 */
const EXAM_DATA_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    title: {
      type: SchemaType.STRING,
      description: '시험지 제목 (예: "2024 학년도 3 월 모의고사 수학영역")',
    },
    questions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          number: {
            type: SchemaType.NUMBER,
            description: '문제 번호 (1, 2, 3...)',
          },
          text: {
            type: SchemaType.STRING,
            description: '발문. 강조는 **텍스트** 형식, 수식은 HWP 문법 (n over 2, sqrt{3}, sum from i=1 to n)',
          },
          boxContext: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: '보기박스 내용 (예: ["ㄱ. 참이다", "ㄴ. 거짓이다"])',
          },
          options: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: '선택지 목록 (객관식: ["1","2","3","4","5"], 단답형: [])',
          },
        },
        required: ['number', 'text', 'boxContext', 'options'],
      },
    },
  },
  required: ['title', 'questions'],
};

/**
 * Track 1: 복잡도 판별용 프롬프트
 */
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

/**
 * Track 2: 정밀 파싱용 프롬프트 (복잡한 경우)
 */
const PARSER_PROMPT_COMPLEX = `
You are an expert HWP formula parser. Your task is to extract exam questions from Korean test images with perfect mathematical notation.

**Critical Rules:**

1. **Mathematical Expressions (HWP Syntax):**
   - Fractions: \`n over 2\` (not n/2)
   - Square root: \`sqrt{3}\` (not √3)
   - Superscript: \`x^2\` (not x²)
   - Subscript: \`x_i\`, \`a_n\`
   - Summation: \`sum from i=1 to n\`
   - Product: \`prod from i=1 to n\`
   - Integral: \`int from a to b\`
   - Greek letters: \`alpha\`, \`beta\`, \`gamma\`, \`theta\`, \`pi\`
   - Special symbols: \`infty\`, \`leq\`, \`geq\`, \`neq\`, \`cdot\`

2. **Text Formatting:**
   - Emphasis/underline: Use markdown \`**text**\`
   - Keep Korean text exactly as shown

3. **Structure:**
   - Extract question number accurately
   - boxContext: Conditions inside boxes (e.g., "ㄱ. 참이다", "ㄴ. 거짓이다")
   - options: Answer choices (e.g., ["1", "2", "3", "4", "5"])

4. **Output:**
   - Return ONLY valid JSON matching the schema
   - No explanations, no markdown code blocks

Extract all questions with perfect HWP formula syntax.
`;

/**
 * Track 2: 빠른 파싱용 프롬프트 (단순한 경우)
 */
const PARSER_PROMPT_SIMPLE = `
You are an exam text extraction specialist. Extract questions from Korean test images.

**Rules:**

1. **Text Formatting:**
   - Emphasis/underline: Use markdown \`**text**\`
   - Keep Korean text exactly as shown

2. **Simple Math:**
   - Basic expressions: \`n over 2\`, \`x^2\`, \`sqrt{3}\`

3. **Structure:**
   - Extract question number accurately
   - boxContext: Conditions inside boxes (e.g., ["ㄱ. 참이다", "ㄴ. 거짓이다"])
   - options: Answer choices (e.g., ["1", "2", "3", "4", "5"])

4. **Output:**
   - Return ONLY valid JSON matching the schema
   - No explanations, no markdown code blocks

Focus on text structure and basic formatting.
`;

/**
 * Base64 인코딩된 이미지 데이터 처리
 */
async function processImageFile(file: File): Promise<{ data: string; mimeType: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const base64Data = Buffer.from(arrayBuffer).toString('base64');
  const mimeType = file.type || 'image/png';

  return { data: base64Data, mimeType };
}

/**
 * Track 1: 복잡도 판별 실행
 */
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

/**
 * Track 2: 정밀 파싱 실행
 */
async function runParser(
  imageData: { data: string; mimeType: string },
  isComplex: boolean
): Promise<ExamData> {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);

  // 복잡도에 따라 모델과 프롬프트 선택
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

  // 유효성 검사
  if (!examData.title || !Array.isArray(examData.questions)) {
    throw new Error('Invalid response structure from Gemini');
  }

  return examData;
}

/**
 * POST 핸들러: 이미지 → HWPX
 */
export async function POST(request: NextRequest): Promise<NextResponse<ProcessResult>> {
  try {
    // 1. API 키 확인
    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'GEMINI_API_KEY 가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // 2. 파일 추출
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: '파일이 제공되지 않았습니다.' },
        { status: 400 }
      );
    }

    // 3. 이미지 데이터 처리
    const imageData = await processImageFile(file);

    // 4. Track 1: 복잡도 판별
    const isComplex = await runRouter(imageData);
    console.log(`[Router] Image complexity: ${isComplex ? 'COMPLEX' : 'SIMPLE'}`);

    // 5. Track 2: 정밀 파싱
    const examData = await runParser(imageData, isComplex);
    console.log(`[Parser] Extracted ${examData.questions.length} questions`);

    // 6. HWPX 조립 (ZIP 형식)
    const hwpxBuffer = await buildHwpx(examData);

    // 7. HWPX 파일로 응답 (파일명 인코딩 - RFC 5987)
    const filename = generateHwpxFilename(examData.title);
    const encodedFilename = encodeURIComponent(filename).replace(/'/g, '%27');
    
    // JSON 데이터를 커스텀 헤더에 포함 (Base64 인코딩)
    const jsonData = Buffer.from(JSON.stringify(examData, null, 2)).toString('base64');

    return new NextResponse(hwpxBuffer, {
      headers: {
        'Content-Type': 'application/vnd.hanplus.hwpx',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}`,
        'X-Exam-Data': jsonData,
      },
    });
  } catch (error) {
    console.error('[process] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { ExamData, GeminiResponseSchema, ProcessResult } from '@/lib/types';
import { assembleHwpx } from '@/lib/hwpx/builder';
import { HWPX_BASE_TEMPLATE } from '@/lib/hwpx/templates';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Gemini API 를 사용하여 이미지/PDF 에서 시험지 데이터 추출
 * 
 * 요청: multipart/form-data (image 또는 pdf)
 * 응답: 조립된 HWPX 파일 (application/vnd.hanplus.hwpx)
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';

// Gemini response schema 정의
const RESPONSE_SCHEMA: GeminiResponseSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', description: '시험지 제목' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'number', description: '문제 번호' },
          text: { type: 'string', description: '발문 (마크다운 강조, HWP 수식 포함)' },
          boxContext: {
            type: 'array',
            items: { type: 'string' },
            description: '보기박스 내용 배열',
          },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: '선택지 배열',
          },
        },
        required: ['number', 'text', 'boxContext', 'options'],
      },
    },
  },
  required: ['title', 'questions'],
};

const SYSTEM_PROMPT = `
You are an expert at extracting exam questions from HWPX/Korean exam documents.

**Output Rules:**
1. Extract the exam title and all questions with their numbers.
2. For emphasis/underline in the question text, use markdown format: **text**
3. For mathematical expressions, use HWP formula syntax:
   - Fractions: "n over 2"
   - Square root: "sqrt{3}"
   - Summation: "sum from i=1 to n"
   - Superscript: "x^2"
4. boxContext contains any conditions/options inside a box (e.g., "ㄱ. 참이다", "ㄴ. 거짓이다")
5. options contains the actual answer choices (e.g., ["1", "2", "3", "4", "5"])
6. If a question has no box or options, return empty arrays []

Return ONLY valid JSON matching the schema. No explanations.
`;

export async function POST(request: NextRequest): Promise<NextResponse<ProcessResult>> {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'GEMINI_API_KEY is not configured' },
        { status: 500 }
      );
    }

    // 1. 요청에서 파일 추출
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // 2. Gemini API 초기화
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      },
    });

    // 3. 파일 처리 (이미지 또는 PDF)
    const fileData = await file.arrayBuffer();
    const mimeType = file.type || 'image/png';

    // 4. Gemini 에게 추출 요청
    const result = await model.generateContent([
      {
        inlineData: {
          data: Buffer.from(fileData).toString('base64'),
          mimeType,
        },
      },
      SYSTEM_PROMPT,
    ]);

    // 5. JSON 파싱 및 검증
    const examData: ExamData = JSON.parse(result.response.text());

    if (!examData.title || !Array.isArray(examData.questions)) {
      throw new Error('Invalid response structure from Gemini');
    }

    // 6. HWPX 조립
    const hwpxContent = assembleHwpx(HWPX_BASE_TEMPLATE, examData);

    // 7. HWPX 파일로 응답
    return new NextResponse(hwpxContent, {
      headers: {
        'Content-Type': 'application/vnd.hanplus.hwpx',
        'Content-Disposition': `attachment; filename="${examData.title}.hwpx"`,
      },
    });
  } catch (error) {
    console.error('[process] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

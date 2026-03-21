/**
 * Gemini 3/2.5 가 'responseSchema' 로 반환할 JSON 구조 정의
 * 
 * 주의사항:
 * - 발문 내의 강조/밑줄은 마크다운 `**텍스트**` 형식을 따름
 * - 수학 수식은 HWP 수식 전용 문법 (예: `n over 2`) 으로 추출됨
 */

/** 시험지 전체 데이터 구조 */
export interface ExamData {
  /** 시험지 제목 (예: "2024 학년도 3 월 모의고사 수학영역") */
  title: string;
  /** 문제 목록 */
  questions: Question[];
}

/** 개별 문제 구조 */
export interface Question {
  /** 문제 번호 (1, 2, 3...) */
  number: number;
  /** 
   * 발문 (문제 본문)
   * - 강조/밑줄: `**텍스트**` 마크다운 형식
   * - 수식: HWP 수식 문법 (예: `n over 2`, `sqrt{3}`, `sum from i=1 to n`)
   */
  text: string;
  /** 
   * 보기박스 내용 (선다형 문제의 경우 각 보기에 대한 설명/조건)
   * - 없는 경우 빈 배열
   * - 예: ["ㄱ. 참이다", "ㄴ. 거짓이다", "ㄷ. 항상 성립한다"]
   */
  boxContext: string[];
  /** 
   * 선택지 목록
   * - 객관식: ["1", "2", "3", "4", "5"]
   * - 단답형: []
   * - 예: ["2", "4", "6", "8", "10"]
   */
  options: string[];
}

/** Gemini API 요청/응답용 스키마 타입 */
export interface GeminiResponseSchema {
  type: 'object';
  properties: {
    title: { type: 'string'; description: '시험지 제목' };
    questions: {
      type: 'array';
      items: {
        type: 'object';
        properties: {
          number: { type: 'number'; description: '문제 번호' };
          text: { type: 'string'; description: '발문 (마크다운 강조, HWP 수식 포함)' };
          boxContext: {
            type: 'array';
            items: { type: 'string' };
            description: '보기박스 내용 배열'
          };
          options: {
            type: 'array';
            items: { type: 'string' };
            description: '선택지 배열'
          };
        };
        required: ['number', 'text', 'boxContext', 'options'];
      };
    };
  };
  required: ['title', 'questions'];
}

/** HWPX 조립을 위한 내부 처리 타입 */
export interface HwpxBuildConfig {
  templatePath: string;
  examData: ExamData;
  outputPath: string;
}

/** API 처리 결과 타입 */
export interface ProcessResult {
  success: boolean;
  hwpxData?: string;
  error?: string;
}

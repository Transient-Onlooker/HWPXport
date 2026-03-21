/**
 * HWPX 템플릿 상수 및 유틸리티
 * template.hwpx 의 기본 구조를 정의
 */

/**
 * 최소 HWPX 파일 헤더 구조 (ZIP 내부 content.xml 기준)
 * 실제 template.hwpx 에서 추출한 기본 뼈대
 */
export const HWPX_BASE_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="http://www.hangulwordprocessor.com/hwpx/2023/content">
  <Head>
    <FileHeader Version="1.0"/>
    <DocInfo>
      <PageDef PaperSize="215900000" PaperWidth="215900000" PaperHeight="297000000"/>
      <FontList>
        <Font ID="0" Name="Gulim"/>
        <Font ID="1" Name="Batang"/>
      </FontList>
    </DocInfo>
  </Head>
  <Body>
    <Section>
      <BodySection>
        <!-- 여기에 문제 내용 삽입 -->
      </BodySection>
    </Section>
  </Body>
</Document>`;

/**
 * HWP 수식 문법 레퍼런스
 * Gemini 가 수식을 추출할 때 참조할 패턴
 */
export const HWP_FORMULA_PATTERNS = {
  fraction: 'a over b',           // 분수: a/b
  sqrt: 'sqrt{x}',                // 제곱근
  superscript: 'x^2',             // 지수
  subscript: 'x_i',               // 첨자
  sum: 'sum from i=1 to n',       // 합계
  product: 'prod from i=1 to n',  // 곱
  integral: 'int from a to b',    // 적분
  greek: 'alpha, beta, gamma',    // 그리스 문자
};

/**
 * 템플릿 파일 경로 상수
 */
export const TEMPLATE_PATHS = {
  EXAM_BASIC: 'public/templates/template.hwpx',
  EXAM_MATH: 'public/templates/template_math.hwpx',
  EXAM_SCIENCE: 'public/templates/template_science.hwpx',
} as const;

/**
 * 문제 유형별 템플릿 선택자
 */
export type TemplateType = 'basic' | 'math' | 'science';

export function getTemplatePath(type: TemplateType): string {
  switch (type) {
    case 'math':
      return TEMPLATE_PATHS.EXAM_MATH;
    case 'science':
      return TEMPLATE_PATHS.EXAM_SCIENCE;
    default:
      return TEMPLATE_PATHS.EXAM_BASIC;
  }
}

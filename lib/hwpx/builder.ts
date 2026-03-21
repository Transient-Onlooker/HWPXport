import { ExamData } from '../types';

/**
 * HWPX XML 조립 유틸리티
 * template.hwpx 를 기반으로 Gemini 추출 데이터를 주입하여 최종 HWPX 생성
 */

/**
 * HWPX 내에서 마크다운 형식을 HWP 스타일로 변환
 * - `**텍스트**` → <bold>true</bold>
 * - HWP 수식 문법 → <Formula> 태그로 감쌈
 */
export function convertMarkdownToHwp(text: string): string {
  // 1. 강조/볼드 변환: **텍스트** → <b>텍스트</b>
  let converted = text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  
  // 2. HWP 수식 변환 (간이 처리 - 실제론 더 복잡한 파싱 필요)
  // 예: "n over 2" → <Formula>n over 2</Formula>
  converted = converted.replace(
    /([a-zA-Z]\s+(?:over|sqrt|sum|prod|int|from|to)\s+[a-zA-Z0-9{}]+)/g,
    '<Formula>$1</Formula>'
  );
  
  return converted;
}

/**
 * 문제 하나의 HWPX Paragraph XML 생성
 */
export function buildQuestionParagraph(question: ExamData['questions'][number]): string {
  const { number, text, boxContext, options } = question;
  
  const convertedText = convertMarkdownToHwp(text);
  
  // 문제 발문 Paragraph
  let paragraph = `
    <Paragraph ID="${number}">
      <ParaText>
        <LineStretch CharSpacing="-100" LineSpacing="160"/>
        <Text>${number}. ${convertedText}</Text>
      </ParaText>
    </Paragraph>`;
  
  // 보기박스가 있는 경우
  if (boxContext.length > 0) {
    paragraph += `
    <Paragraph ID="${number}-box">
      <ParaText>
        <LineStretch CharSpacing="-100" LineSpacing="160"/>
        <ShapeBox BorderType="1" BorderWidth="100">
          <Text>${boxContext.join(' | ')}</Text>
        </ShapeBox>
      </ParaText>
    </Paragraph>`;
  }
  
  // 선택지가 있는 경우 (객관식)
  if (options.length > 0) {
    paragraph += `
    <Paragraph ID="${number}-options">
      <ParaText>
        <LineStretch CharSpacing="-100" LineSpacing="160"/>
        <Text>① ${options[0] || ''}  ② ${options[1] || ''}  ③ ${options[2] || ''}  ④ ${options[3] || ''}  ⑤ ${options[4] || ''}</Text>
      </ParaText>
    </Paragraph>`;
  }
  
  return paragraph;
}

/**
 * 전체 시험지 HWPX 본문 XML 생성
 */
export function buildExamBody(examData: ExamData): string {
  const titleParagraph = `
    <Paragraph ID="title">
      <ParaText>
        <LineStretch CharSpacing="0" LineSpacing="200"/>
        <Text Align="Center" FontSize="24000" Bold="true">${examData.title}</Text>
      </ParaText>
    </Paragraph>`;
  
  const questionsXml = examData.questions
    .map(q => buildQuestionParagraph(q))
    .join('\n');
  
  return `${titleParagraph}\n${questionsXml}`;
}

/**
 * 완전한 HWPX 파일 조립 (ZIP 내부 XML 구조)
 * 실제 구현시에는 template.hwpx 의 내용을 읽어와서 본문만 교체하는 방식 사용
 */
export function assembleHwpx(templateContent: string, examData: ExamData): string {
  const bodyXml = buildExamBody(examData);
  
  // template.hwpx 의 <BodySection> 태그 내용을 교체
  const bodySectionMatch = templateContent.match(/<BodySection>[\s\S]*<\/BodySection>/);
  if (!bodySectionMatch) {
    throw new Error('Invalid template.hwpx: BodySection not found');
  }
  
  const newBodySection = `<BodySection>\n${bodyXml}\n</BodySection>`;
  return templateContent.replace(bodySectionMatch[0], newBodySection);
}

import JSZip from 'jszip';
import { ExamData } from '../types';

/**
 * HWPX 빌더 - JSON 데이터를 실제 HWPX 파일로 변환
 * 
 * 기술 규칙:
 * 1. No Cache: <hp:linesegarray> 태그 절대 포함 안 함
 * 2. Space Magic: 문제 번호 뒤 <hp:nbSpace/><hp:fwSpace/> 필수 삽입
 * 3. Style Mapping: 일반 (4), 강조 (49)
 * 4. Column System: 2 단 레이아웃 (colCount="2")
 * 5. 수식 처리: <hp:equation><hp:script> 태그 사용
 */

// 문자 속성 ID 상수
const CHAR_PR = {
  NORMAL: 4,      // 일반 텍스트
  BOLD: 49,       // 볼드/강조 텍스트
  NUMBER: 17,     // 문제 번호
} as const;

/**
 * HWPX 의 XML 네임스페이스 정의
 */
const XML_NS = 'http://www.hangulwordprocessor.com/hwpx/2023/content';

/**
 * 마크다운 강조 (**텍스트**) 를 HWP XML 로 변환
 */
function convertMarkdownToHwpXml(text: string): string {
  const parts: string[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // 강조 전 일반 텍스트
    if (match.index > lastIndex) {
      const plainText = escapeXml(text.slice(lastIndex, match.index));
      parts.push(`<hp:run charPrIDRef="${CHAR_PR.NORMAL}">${plainText}</hp:run>`);
    }
    
    // 강조 텍스트
    const boldText = escapeXml(match[1]);
    parts.push(`<hp:run charPrIDRef="${CHAR_PR.BOLD}">${boldText}</hp:run>`);
    
    lastIndex = match.index + match[0].length;
  }

  // 나머지 텍스트
  if (lastIndex < text.length) {
    const plainText = escapeXml(text.slice(lastIndex));
    parts.push(`<hp:run charPrIDRef="${CHAR_PR.NORMAL}">${plainText}</hp:run>`);
  }

  return parts.join('');
}

/**
 * XML 특수문자 이스케이프
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * HWP 수식 문법을 XML 로 변환
 * n over 2 → <hp:equation><hp:script>n over 2</hp:script></hp:equation>
 */
function convertFormulaToHwpXml(text: string): string {
  // HWP 수식 패턴 감지 (간이 파싱)
  const formulaPattern = /([a-zA-Z]\s+(?:over|sqrt|sum|prod|int|from|to|\^|_{)|\{[a-zA-Z0-9\s]+\})/g;
  
  return text.replace(formulaPattern, (match) => {
    const escaped = escapeXml(match);
    return `<hp:equation><hp:script>${escaped}</hp:script></hp:equation>`;
  });
}

/**
 * 문제 발문을 HWPX Paragraph XML 로 변환
 * 
 * 기술 규칙 적용:
 * - 문제 번호 뒤: <hp:nbSpace/><hp:fwSpace/>
 * - 마크다운 강조: charPrIDRef="49"
 * - 수식: <hp:equation> 태그
 */
function buildQuestionParagraph(question: ExamData['questions'][number], paraId: number): string {
  const { number: qNum, text } = question;
  
  // 문제 번호 부분 (charPrIDRef="17")
  const numberXml = `<hp:run charPrIDRef="${CHAR_PR.NUMBER}">${qNum}</hp:run>`;
  
  // Space Magic: 번호 뒤 필수 공백
  const spaceMagic = '<hp:nbSpace/><hp:fwSpace/>';
  
  // 발문 본문 (마크다운 + 수식 변환)
  let bodyText = text;
  
  // 먼저 수식을 별도 토큰으로 분리 (중복 변환 방지)
  const formulaTokens: string[] = [];
  bodyText = bodyText.replace(/(`[^`]+`)/g, (match, p1) => {
    formulaTokens.push(p1);
    return `__FORMULA_${formulaTokens.length - 1}__`;
  });
  
  // 마크다운 강조 변환
  bodyText = convertMarkdownToHwpXml(bodyText);
  
  // 수식 토큰 복원
  formulaTokens.forEach((token, idx) => {
    const formulaContent = escapeXml(token.replace(/`/g, ''));
    bodyText = bodyText.replace(
      `__FORMULA_${idx}__`,
      `<hp:equation><hp:script>${formulaContent}</hp:script></hp:equation>`
    );
  });
  
  return `
        <hp:paragraph id="${paraId}">
          <hp:header>
            <hp:attr name="styleId" value="0"/>
            <hp:attr name="textType" value="normal"/>
          </hp:header>
          <hp:paragraphText>
            <hp:p>
              ${numberXml}${spaceMagic}${bodyText}
            </hp:p>
          </hp:paragraphText>
        </hp:paragraph>`;
}

/**
 * 보기박스 Paragraph 생성
 */
function buildBoxParagraph(boxContext: string[], paraId: number): string {
  if (boxContext.length === 0) return '';
  
  const boxText = escapeXml(boxContext.join(' | '));
  
  return `
        <hp:paragraph id="${paraId}">
          <hp:header>
            <hp:attr name="styleId" value="1"/>
            <hp:attr name="textType" value="normal"/>
          </hp:header>
          <hp:paragraphText>
            <hp:p>
              <hp:run charPrIDRef="${CHAR_PR.NORMAL}">${boxText}</hp:run>
            </hp:p>
          </hp:paragraphText>
        </hp:paragraph>`;
}

/**
 * 선택지 Paragraph 생성 (객관식)
 */
function buildOptionsParagraph(options: string[], paraId: number): string {
  if (options.length === 0) return '';
  
  const optionSymbols = ['①', '②', '③', '④', '⑤'];
  const optionsText = options
    .slice(0, 5)
    .map((opt, idx) => `${optionSymbols[idx] || ''} ${escapeXml(opt)}`)
    .join('  ');
  
  return `
        <hp:paragraph id="${paraId}">
          <hp:header>
            <hp:attr name="styleId" value="2"/>
            <hp:attr name="textType" value="normal"/>
          </hp:header>
          <hp:paragraphText>
            <hp:p>
              <hp:run charPrIDRef="${CHAR_PR.NORMAL}">${optionsText}</hp:run>
            </hp:p>
          </hp:paragraphText>
        </hp:paragraph>`;
}

/**
 * HWPX 의 content.xml 생성
 */
function buildContentXml(examData: ExamData): string {
  // 2 단 컬럼 설정 (수능 시험지 레이아웃)
  const colPr = '<hp:colPr colCount="2" sameGap="3120"/>';
  
  // 제목 Paragraph
  const titleXml = `
        <hp:paragraph id="0">
          <hp:header>
            <hp:attr name="styleId" value="3"/>
            <hp:attr name="textType" value="title"/>
          </hp:header>
          <hp:paragraphText>
            <hp:p>
              <hp:run charPrIDRef="${CHAR_PR.BOLD}">${escapeXml(examData.title)}</hp:run>
            </hp:p>
          </hp:paragraphText>
        </hp:paragraph>`;
  
  // 문제들 생성
  let paraId = 1;
  const questionsXml = examData.questions.map((q) => {
    let xml = buildQuestionParagraph(q, paraId++);
    
    // 보기박스
    if (q.boxContext.length > 0) {
      xml += buildBoxParagraph(q.boxContext, paraId++);
    }
    
    // 선택지
    if (q.options.length > 0) {
      xml += buildOptionsParagraph(q.options, paraId++);
    }
    
    return xml;
  }).join('\n');
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<hp:document xmlns:hp="${XML_NS}" version="1.0">
  <hp:head>
    <hp:fileHeader version="1.0"/>
    <hp:docInfo>
      <hp:pageDef paperSize="215900000" paperWidth="215900000" paperHeight="297000000" 
                  marginLeft="19050000" marginRight="19050000" marginTop="19050000" marginBottom="19050000"/>
      <hp:fontList>
        <hp:font id="0" name="Gulim"/>
        <hp:font id="1" name="Batang"/>
        <hp:font id="2" name="Malgun Gothic"/>
      </hp:fontList>
      <hp:charShapeList>
        <hp:charShape id="${CHAR_PR.NORMAL}">
          <hp:attr name="fontName" value="Batang"/>
          <hp:attr name="fontSize" value="10000"/>
        </hp:charShape>
        <hp:charShape id="${CHAR_PR.BOLD}">
          <hp:attr name="fontName" value="Batang"/>
          <hp:attr name="fontSize" value="10000"/>
          <hp:attr name="bold" value="true"/>
        </hp:charShape>
        <hp:charShape id="${CHAR_PR.NUMBER}">
          <hp:attr name="fontName" value="Gulim"/>
          <hp:attr name="fontSize" value="10000"/>
          <hp:attr name="bold" value="true"/>
        </hp:charShape>
      </hp:charShapeList>
      <hp:paraShapeList>
        <hp:paraShape id="0">
          <hp:attr name="align" value="justify"/>
          <hp:attr name="lineSpacing" value="160"/>
        </hp:paraShape>
        <hp:paraShape id="1">
          <hp:attr name="align" value="justify"/>
          <hp:attr name="lineSpacing" value="160"/>
          <hp:attr name="borderType" value="1"/>
        </hp:paraShape>
        <hp:paraShape id="2">
          <hp:attr name="align" value="justify"/>
          <hp:attr name="lineSpacing" value="160"/>
        </hp:paraShape>
        <hp:paraShape id="3">
          <hp:attr name="align" value="center"/>
          <hp:attr name="lineSpacing" value="200"/>
        </hp:paraShape>
      </hp:paraShapeList>
    </hp:docInfo>
  </hp:head>
  <hp:body>
    <hp:section>
      ${colPr}
      <hp:bodySection>
        ${titleXml}
        ${questionsXml}
      </hp:bodySection>
    </hp:section>
  </hp:body>
</hp:document>`;
}

/**
 * HWPX 의 metadata.xml 생성
 */
function buildMetadataXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<hp:metadata xmlns:hp="${XML_NS}">
  <hp:creator>
    <hp:programName>HWPXport</hp:programName>
    <hp:companyName>HWPXport</hp:companyName>
  </hp:creator>
  <hp:creationDate>${new Date().toISOString()}</hp:creationDate>
</hp:metadata>`;
}

/**
 * HWPX 의 rels.xml 생성
 */
function buildRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://www.hangulwordprocessor.com/hwpx/2023/content" Target="content.xml"/>
  <Relationship Id="rId2" Type="http://www.hangulwordprocessor.com/hwpx/2023/metadata" Target="metadata.xml"/>
</Relationships>`;
}

/**
 * HWPX 의 app.xml 생성
 */
function buildAppXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>HWPXport</Application>
  <TotalTime>0</TotalTime>
</Properties>`;
}

/**
 * HWPX 의 core.xml 생성
 */
function buildCoreXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties">
  <dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">HWPXport</dc:creator>
  <cp:lastModifiedBy>HWPXport</cp:lastModifiedBy>
</cp:coreProperties>`;
}

/**
 * [Content_Types].xml 생성
 */
function buildContentTypes(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/content.xml" ContentType="application/vnd.hanplus.hwpx.content+xml"/>
  <Override PartName="/metadata.xml" ContentType="application/vnd.hanplus.hwpx.metadata+xml"/>
</Types>`;
}

/**
 * ExamData 를 받아 HWPX 파일 (Uint8Array) 생성
 * 
 * @param examData - Gemini 가 추출한 시험지 데이터
 * @returns HWPX 파일 바이트 배열
 */
export async function buildHwpx(examData: ExamData): Promise<Uint8Array> {
  const zip = new JSZip();

  // HWPX 는 ZIP 형식이므로 각 XML 파일을 추가
  zip.file('content.xml', buildContentXml(examData));
  zip.file('metadata.xml', buildMetadataXml());
  zip.file('_rels/.rels', buildRelsXml());
  zip.file('docProps/app.xml', buildAppXml());
  zip.file('docProps/core.xml', buildCoreXml());
  zip.file('[Content_Types].xml', buildContentTypes());

  // ZIP 파일 생성
  const content = await zip.generateAsync({ type: 'uint8array' });
  
  return content;
}

/**
 * HWPX 파일명 생성
 */
export function generateHwpxFilename(title: string): string {
  // 파일명에 사용할 수 없는 문자 제거
  const safeTitle = title
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 50); // 길이 제한
  
  return `${safeTitle}.hwpx`;
}

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import { ContextLabel, ExamData } from '../types';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, '..', '..');
const TEMPLATE_CANDIDATES = [
  path.join(PROJECT_ROOT, 'example.hwpx'),
  path.join(PROJECT_ROOT, 'public', 'templates', 'template.hwpx'),
];

const SECTION_XMLNS = [
  'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"',
  'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"',
  'xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph"',
  'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"',
  'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"',
  'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"',
  'xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history"',
  'xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page"',
  'xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:opf="http://www.idpf.org/2007/opf/"',
  'xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart"',
  'xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"',
  'xmlns:epub="http://www.idpf.org/2007/ops"',
  'xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"',
].join(' ');

const TEXT_CHAR_PR = 6;
const BOLD_CHAR_PR = 9;
const UNDERLINE_CHAR_PR = 10;
const BODY_PARA_PR = 13;
const BODY_STYLE_ID = 0;
const BOX_PARA_PR = 11;
const BOX_STYLE_ID = 15;
const FIGURE_NOTICE_PARA_PR = 11;
const FIGURE_NOTICE_STYLE_ID = 15;
const OPTION_SYMBOLS = ['\u2460', '\u2461', '\u2462', '\u2463', '\u2464'];

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripMarkdown(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1');
}

function splitMarkdownRuns(
  text: string
): Array<{ text: string; bold: boolean; underline: boolean }> {
  const runs: Array<{ text: string; bold: boolean; underline: boolean }> = [];
  const regex = /(\*\*(.+?)\*\*)|(__(.+?)__)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push({ text: text.slice(lastIndex, match.index), bold: false, underline: false });
    }

    if (match[2] !== undefined) {
      runs.push({ text: match[2], bold: true, underline: false });
    } else if (match[4] !== undefined) {
      runs.push({ text: match[4], bold: false, underline: true });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    runs.push({ text: text.slice(lastIndex), bold: false, underline: false });
  }

  return runs.length > 0 ? runs : [{ text, bold: false, underline: false }];
}

function buildTextRuns(text: string): string {
  return splitMarkdownRuns(text)
    .filter((run) => run.text.length > 0)
    .map((run) => {
      const charPrId = run.bold
        ? BOLD_CHAR_PR
        : run.underline
          ? UNDERLINE_CHAR_PR
          : TEXT_CHAR_PR;
      const content = escapeXml(run.text.replace(/`/g, ''));
      return `<hp:run charPrIDRef="${charPrId}"><hp:t>${content}</hp:t></hp:run>`;
    })
    .join('');
}

function buildTextRunsWithBreaks(lines: string[]): string {
  return lines
    .filter((line) => line.length > 0)
    .map((line, index) => {
      const lineXml = buildTextRuns(line);
      if (index === 0) {
        return lineXml;
      }
      return `<hp:run charPrIDRef="${TEXT_CHAR_PR}"><hp:lineBreak/></hp:run>${lineXml}`;
    })
    .join('');
}

function buildParagraph(
  paraId: number,
  paraPrId: number,
  styleId: number,
  innerXml: string
): string {
  return `<hp:p id="${paraId}" paraPrIDRef="${paraPrId}" styleIDRef="${styleId}" pageBreak="0" columnBreak="0" merged="0">${innerXml}</hp:p>`;
}

function buildQuestionParagraph(question: ExamData['questions'][number], paraId: number): string {
  const prefix =
    `<hp:run charPrIDRef="${BOLD_CHAR_PR}"><hp:t>${question.number}.</hp:t></hp:run>` +
    `<hp:run charPrIDRef="${TEXT_CHAR_PR}"><hp:t> </hp:t></hp:run>`;
  return buildParagraph(paraId, BODY_PARA_PR, BODY_STYLE_ID, `${prefix}${buildTextRuns(question.text)}`);
}

function buildFigureNoticeParagraph(questionNumber: number, paraId: number): string {
  return buildParagraph(
    paraId,
    FIGURE_NOTICE_PARA_PR,
    FIGURE_NOTICE_STYLE_ID,
    `<hp:run charPrIDRef="${BOLD_CHAR_PR}"><hp:t>${escapeXml(`[${questionNumber}번 문제: 그림 삽입 필요]`)}</hp:t></hp:run>`
  );
}

function buildOptionsParagraphs(
  options: string[],
  startParaId: number
): { xml: string; nextParaId: number } {
  const paragraphs: string[] = [];
  let paraId = startParaId;

  options.slice(0, 5).forEach((option, index) => {
    const symbol = escapeXml(OPTION_SYMBOLS[index] ?? '-');
    paragraphs.push(
      buildParagraph(
        paraId++,
        BODY_PARA_PR,
        BODY_STYLE_ID,
        `<hp:run charPrIDRef="${TEXT_CHAR_PR}"><hp:t>${symbol} </hp:t></hp:run>${buildTextRuns(option)}`
      )
    );
  });

  return { xml: paragraphs.join(''), nextParaId: paraId };
}

function buildBoxParagraph(boxContext: string[], paraId: number): string {
  return buildParagraph(paraId, BOX_PARA_PR, BOX_STYLE_ID, buildTextRuns(boxContext.join(' / ')));
}

function getContextLabelPrefix(contextLabel: ContextLabel | undefined): string {
  switch (contextLabel) {
    case 'passage':
      return '[지문] ';
    case 'condition':
      return '[조건] ';
    case 'data':
      return '[자료] ';
    case 'example':
      return '[보기] ';
    default:
      return '';
  }
}

function buildContextParagraph(
  boxContext: string[],
  contextLabel: ContextLabel | undefined,
  paraId: number
): string {
  const prefix = getContextLabelPrefix(contextLabel);
  const preserveLineBreaks = contextLabel === 'passage' || contextLabel === 'condition' || contextLabel === 'data';
  if (preserveLineBreaks) {
    const lines = boxContext.map((line, index) => (index === 0 && prefix ? `${prefix}${line}` : line));
    return buildParagraph(paraId, BOX_PARA_PR, BOX_STYLE_ID, buildTextRunsWithBreaks(lines));
  }

  const content = prefix ? `${prefix}${boxContext.join(' / ')}` : boxContext.join(' / ');
  return buildParagraph(paraId, BOX_PARA_PR, BOX_STYLE_ID, buildTextRuns(content));
}

function buildSectionPreamble(title: string): string {
  return [
    '<hp:p id="1" paraPrIDRef="17" styleIDRef="2" pageBreak="0" columnBreak="0" merged="0">',
    `<hp:run charPrIDRef="${TEXT_CHAR_PR}">`,
    '<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">',
    '<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>',
    '<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>',
    '<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>',
    '<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>',
    '<hp:pagePr landscape="WIDELY" width="59528" height="84188" gutterType="LEFT_ONLY"><hp:margin header="4251" footer="4251" gutter="0" left="5669" right="5669" top="4251" bottom="4251"/></hp:pagePr>',
    '<hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr>',
    '<hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr>',
    '<hp:pageBorderFill type="BOTH" borderFillIDRef="5" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="2267" bottom="1700"/></hp:pageBorderFill>',
    '<hp:pageBorderFill type="EVEN" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>',
    '<hp:pageBorderFill type="ODD" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>',
    '</hp:secPr>',
    '<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="2" sameSz="1" sameGap="2268"><hp:colLine type="SOLID" width="0.4 mm" color="#000000"/></hp:colPr></hp:ctrl>',
    '<hp:ctrl><hp:pageNum pos="BOTTOM_CENTER" formatType="DIGIT" sideChar="-"/></hp:ctrl>',
    '<hp:ctrl><hp:footer id="0" applyPageType="BOTH"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="BOTTOM" linkListIDRef="0" linkListNextIDRef="0" textWidth="48190" textHeight="4251" hasTextRef="0" hasNumRef="0"><hp:p id="0" paraPrIDRef="2" styleIDRef="10" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="2"/></hp:p></hp:subList></hp:footer></hp:ctrl>',
    '<hp:ctrl><hp:header id="2" applyPageType="BOTH"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="48190" textHeight="4251" hasTextRef="0" hasNumRef="0">',
    '<hp:p id="0" paraPrIDRef="2" styleIDRef="10" pageBreak="0" columnBreak="0" merged="0">',
    `<hp:run charPrIDRef="${TEXT_CHAR_PR}"><hp:t>${escapeXml(title)}</hp:t></hp:run>`,
    '</hp:p>',
    '</hp:subList></hp:header></hp:ctrl>',
    '<hp:t></hp:t>',
    '</hp:run>',
    '</hp:p>',
  ].join('');
}

function buildSectionXml(examData: ExamData): string {
  const paragraphs: string[] = [];
  let paraId = 2;

  for (const question of examData.questions) {
    paragraphs.push(buildQuestionParagraph(question, paraId++));

    if (question.needsFigure) {
      paragraphs.push(buildFigureNoticeParagraph(question.number, paraId++));
    }

    if (question.boxContext.length > 0) {
      paragraphs.push(buildContextParagraph(question.boxContext, question.contextLabel, paraId++));
    }

    if (question.options.length > 0) {
      const options = buildOptionsParagraphs(question.options, paraId);
      paragraphs.push(options.xml);
      paraId = options.nextParaId;
    }

    paragraphs.push(buildParagraph(paraId++, BODY_PARA_PR, BODY_STYLE_ID, `<hp:run charPrIDRef="${TEXT_CHAR_PR}"/>`));
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><hs:sec ${SECTION_XMLNS}>${buildSectionPreamble(
    examData.title
  )}${paragraphs.join('')}</hs:sec>`;
}

function buildPreviewText(examData: ExamData): string {
  const lines = [examData.title, ''];

  for (const question of examData.questions) {
    lines.push(`${question.number}. ${stripMarkdown(question.text)}`);

    if (question.needsFigure) {
      lines.push(`[${question.number}번 문제: 그림 삽입 필요]`);
    }
    if (question.boxContext.length > 0) {
      const prefix = getContextLabelPrefix(question.contextLabel).trim() || 'BOX';
      lines.push(`[${prefix}] ${stripMarkdown(question.boxContext[0])}`);
      question.boxContext.slice(1).forEach((line) => lines.push(stripMarkdown(line)));
    }
    if (question.options.length > 0) {
      lines.push(question.options.map(stripMarkdown).join(' | '));
    }

    lines.push('');
  }

  return lines.join('\r\n').trim();
}

async function findTemplatePath(): Promise<string> {
  for (const candidate of TEMPLATE_CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error('HWPX template not found. example.hwpx or public/templates/template.hwpx is required.');
}

async function loadTemplateZip(): Promise<JSZip> {
  const templatePath = await findTemplatePath();
  const buffer = await fs.readFile(templatePath);

  try {
    return await JSZip.loadAsync(buffer);
  } catch {
    throw new Error(`Failed to open HWPX template: ${templatePath}`);
  }
}

async function updateContentHpf(zip: JSZip, title: string): Promise<void> {
  const file = zip.file('Contents/content.hpf');
  if (!file) {
    return;
  }

  const xml = await file.async('string');
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const koreanDate = new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'long',
    timeStyle: 'medium',
    timeZone: 'Asia/Seoul',
  }).format(new Date());

  const withTitle = xml.match(/<opf:title\/>/)
    ? xml.replace('<opf:title/>', `<opf:title>${escapeXml(title)}</opf:title>`)
    : xml.replace(/<opf:title>.*?<\/opf:title>/, `<opf:title>${escapeXml(title)}</opf:title>`);

  const updated = withTitle
    .replace(/(<opf:meta name="ModifiedDate" content="text">).*?(<\/opf:meta>)/, `$1${now}$2`)
    .replace(/(<opf:meta name="date" content="text">).*?(<\/opf:meta>)/, `$1${escapeXml(koreanDate)}$2`);

  zip.file('Contents/content.hpf', updated);
}

export async function buildHwpx(examData: ExamData): Promise<Uint8Array> {
  const zip = await loadTemplateZip();

  zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
  zip.file('Contents/section0.xml', buildSectionXml(examData));
  zip.file('Preview/PrvText.txt', buildPreviewText(examData));

  await updateContentHpf(zip, examData.title);

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.hanplus.hwpx',
  });
}

export function generateHwpxFilename(title: string): string {
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 50);
  return `${safeTitle || 'exam'}.hwpx`;
}

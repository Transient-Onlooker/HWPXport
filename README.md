# HWPXport

> 시험지 이미지, PDF, 또는 추출된 JSON을 `.hwpx`로 변환하는 Next.js 앱

HWPXport는 시험지 스캔본이나 PDF를 구조화된 문제 데이터로 해석한 뒤, 한글(HWPX) 문서로 다시 조립하는 도구입니다.  
기본 흐름은 Gemini API를 사용하는 방식이지만, API 키 없이 일반 AI 채팅 서비스에서 JSON만 추출한 뒤 이 프로젝트에 다시 넣어 HWPX를 생성하는 방식도 지원합니다.

---

## 프로젝트 개요

이 프로젝트는 다음 작업을 한 번에 처리합니다.

- 이미지 파일(`PNG`, `JPG`, `JPEG`, `WEBP`) 업로드
- PDF 업로드 후 페이지별 이미지 변환
- Gemini를 통한 문제 구조 추출
- 추출 결과를 실제 HWPX 템플릿 기반 ZIP 패키지로 재조립
- 생성된 `.hwpx` 자동 다운로드
- 디버그용 JSON 확인 및 재다운로드
- 저장된 JSON을 다시 업로드해 API 비용 없이 HWPX만 반복 생성

---

## 주요 구성

| 영역 | 내용 |
|------|------|
| Frontend | Next.js App Router 기반 업로드 UI, 상태 표시, 다운로드 처리 |
| AI Parsing | Gemini 라우터 + 파서 2단계 처리 |
| Conversion | `jszip` 기반 HWPX 템플릿 수정 및 재패키징 |
| Input Handling | 이미지 리사이즈, PDF 렌더링, JSON 직접 업로드 |
| Debugging | 처리 이미지 미리보기, JSON payload 다운로드 |

---

## 동작 방식

### 1. 입력 전처리

[`app/page.tsx`](C:/Users/junuh/Desktop/코딩/HWPXport/app/page.tsx)에서 파일을 받아 다음처럼 처리합니다.

- 이미지 파일은 브라우저에서 최대 `1920x1920` 범위로 리사이즈
- JPEG 품질 `0.8`로 최적화
- PDF는 `pdfjs-dist`로 페이지별 렌더링 후 이미지 Blob으로 변환
- JSON 파일은 AI 호출 없이 그대로 서버로 전달

### 2. 문제 구조 추출

[`app/api/process/route.ts`](C:/Users/junuh/Desktop/코딩/HWPXport/app/api/process/route.ts)에서 처리합니다.

- 이미지/PDF 경로:
  - `gemini-3.1-flash-lite-preview`로 복잡도 판단
  - `gemini-3-flash-preview`로 문제 구조 파싱
- JSON 경로:
  - 업로드된 JSON을 `ExamData` 스키마로 검증
  - 검증 통과 시 바로 HWPX 생성

추출 데이터 구조는 [`lib/types.ts`](C:/Users/junuh/Desktop/코딩/HWPXport/lib/types.ts)에 정의되어 있습니다.

```ts
interface ExamData {
  title: string;
  questions: {
    number: number;
    text: string;
    boxContext: string[];
    options: string[];
  }[];
}
```

### 3. HWPX 생성

[`lib/hwpx/builder.ts`](C:/Users/junuh/Desktop/코딩/HWPXport/lib/hwpx/builder.ts)에서 실제 HWPX 템플릿을 읽어 필요한 XML만 교체합니다.

- 우선 템플릿 후보:
  - `example.hwpx`
  - `public/templates/template.hwpx`
- 수정 대상:
  - `Contents/section0.xml`
  - `Contents/content.hpf`
  - `Preview/PrvText.txt`

즉, 예전처럼 임의의 ZIP/XML 묶음을 새로 만드는 방식이 아니라, 정상적인 HWPX 템플릿을 기준으로 문서 내용을 교체하는 구조입니다.

---

## 프로젝트 구조

```text
app/
  api/process/route.ts
  globals.css
  layout.tsx
  page.tsx
components/
  ErrorBoundary.tsx
  FileUploader.tsx
  StatusMessage.tsx
lib/
  hwpx/
    builder.ts
    templates.ts
  types.ts
public/
  templates/
    template.hwpx
example.hwpx
run.bat
push.bat
pull.bat
```

---

## 실행 방법

### 1. 환경 변수 설정

루트에 `.env.local` 파일을 만들고 Gemini API 키를 넣습니다.

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

예시는 [`.env.example`](C:/Users/junuh/Desktop/코딩/HWPXport/.env.example)에 있습니다.

### 2. 설치

```bash
npm install
```

### 3. 개발 서버 실행

```bash
npm run dev
```

또는 Windows에서는 [`run.bat`](C:/Users/junuh/Desktop/코딩/HWPXport/run.bat)을 실행해도 됩니다.

기본 주소는 `http://localhost:3000`입니다.

---

## 사용 방법

### API 키를 사용하는 기본 방식

1. 이미지 또는 PDF를 업로드합니다.
2. 서버가 Gemini로 문제 구조를 추출합니다.
3. 결과를 바탕으로 `.hwpx`가 생성됩니다.
4. 브라우저에서 파일이 자동 다운로드됩니다.
5. 성공 화면에서 JSON payload를 내려받아 디버그용으로 보관할 수 있습니다.

### API 키 없이 쓰는 방식

1. 일반 AI 채팅 서비스에 이미지 또는 PDF를 넣습니다.
2. 아래 프롬프트를 사용해 `ExamData` JSON만 추출합니다.
3. JSON을 `.json` 파일로 저장합니다.
4. HWPXport에 그 JSON 파일을 업로드합니다.
5. Gemini 호출 없이 바로 `.hwpx`가 생성됩니다.

---

## 일반 AI용 프롬프트

API 비용을 아끼고 싶거나, Gemini API 대신 ChatGPT / Gemini App / Claude 같은 일반 채팅형 AI를 쓰고 싶다면 아래 프롬프트를 그대로 사용하면 됩니다.  
권장 모델은 가능하면 `Pro`, `Advanced`, `Opus`처럼 고성능 모델입니다. 이 프롬프트는 느슨한 OCR이 아니라, 시험지 구조를 HWPX 변환용 JSON으로 엄격하게 정규화하는 목적입니다.

### 권장 사용법

- 시험지 전체가 잘 보이도록 이미지 또는 PDF 페이지를 넣습니다.
- 모델에게 반드시 **JSON만 출력**하게 합니다.
- 한 번에 여러 페이지를 넣을 경우, 누락 없이 하나의 `questions` 배열로 합치라고 지시합니다.
- 결과 JSON은 그대로 저장해서 이 앱에 업로드합니다.

### 복붙용 프롬프트

```text
You are a strict exam-structure extraction engine.

Your job is to read the attached Korean exam image(s) or PDF page(s) and convert them into a single JSON object that exactly matches the schema below.

You must behave as a loss-minimizing parser, not as a summarizer.
Do not explain anything.
Do not add markdown fences.
Do not add commentary.
Output JSON only.

Target JSON schema:
{
  "title": "string",
  "questions": [
    {
      "number": 1,
      "text": "string",
      "boxContext": ["string"],
      "options": ["string"]
    }
  ]
}

Field rules:
1. "title"
   - Extract the exam title as precisely as possible.
   - Preserve Korean text exactly.
   - If the exact formal title is unclear, infer the smallest safe title from the visible heading without inventing extra context.

2. "questions"
   - Each question must be a separate object.
   - Keep the original question order.
   - "number" must be numeric.
   - If numbering is visually ambiguous, choose the most likely intended question number.

3. "text"
   - Put the full main question stem here.
   - Preserve Korean wording as faithfully as possible.
   - Do not summarize.
   - Do not omit conditions, qualifiers, parenthetical notes, or inline labels.
   - If there is underlined, bold, boxed, or emphasized text inside the stem, preserve the emphasis using markdown bold syntax like **this**.
   - Keep line-broken content logically merged into one continuous string unless separation is semantically necessary.

4. "boxContext"
   - Use this only for separate boxed guidance, 보기 박스, 조건 목록, statement groups, or detached context blocks that belong to the question but are visually distinct from the main stem.
   - Each logically separate line or statement should be a separate string item.
   - If no such box exists, use [].

5. "options"
   - For multiple-choice questions, store each option as one string item.
   - Remove only the printed numbering marker if necessary, but keep the actual option text.
   - If there are no answer choices, use [].

Math normalization rules:
1. Fractions:
   - Convert to inline HWP-friendly text such as "n over 2", "(x+1) over (x-1)", "a+b over c".

2. Square roots:
   - Use forms like "sqrt{3}", "sqrt{x+1}".

3. Powers:
   - Use "x^2", "a^n", "(x+1)^2".

4. Subscripts:
   - Use "a_n", "x_i", "S_n".

5. Summation / product / integral:
   - Use plain linear forms like:
     - "sum from i=1 to n"
     - "prod from k=1 to n"
     - "int from 0 to 1"

6. Matrices, cases, vectors, and uncommon expressions:
   - Preserve them as faithfully as possible in a readable linear plain-text form.
   - Prefer structural fidelity over elegance.
   - Never omit symbols just because formatting is difficult.

OCR and ambiguity rules:
1. If a character is uncertain but strongly inferable from context, choose the most likely reading.
2. If a small part is truly unreadable, keep the rest intact and use the minimum necessary neutral placeholder.
3. Never hallucinate entire missing sentences, options, or conditions.
4. Never silently drop content because it is hard to parse.

Segmentation rules:
1. A question that contains a passage plus sub-statements should still remain one question unless the printed source clearly splits it into separate numbered items.
2. If a shared passage applies to multiple numbered questions, include the shared passage in each relevant question's "boxContext" unless the source clearly indicates a different structure.
3. Do not merge distinct numbered questions into one.

Output constraints:
1. Output exactly one JSON object.
2. The top-level keys must be exactly "title" and "questions".
3. Every question object must contain exactly:
   - "number"
   - "text"
   - "boxContext"
   - "options"
4. Use valid JSON.
5. Do not wrap the JSON in markdown code fences.
6. Do not prepend or append any explanation.

Before finalizing internally, verify:
1. No numbered question was skipped.
2. No option was dropped.
3. No boxed condition was accidentally merged into the wrong field.
4. Math notation was normalized consistently.
5. The final output is valid JSON and nothing else.
```

### 권장 후처리

일반 AI가 JSON 앞뒤에 설명을 붙이면 다시 이렇게 한 줄로 요청하면 됩니다.

```text
Return the previous result again as raw JSON only. No markdown, no explanation, no code fences.
```

---

## JSON 디버그 워크플로

API 비용을 줄이면서 HWPX 로직만 반복 검증하려면 이 흐름이 가장 효율적입니다.

1. 이미지 또는 PDF로 한 번만 AI 추출을 실행합니다.
2. 성공 화면에서 JSON payload를 다운로드합니다.
3. 이후에는 그 JSON 파일만 다시 업로드합니다.
4. Gemini 호출 없이 HWPX 생성 결과만 반복 확인합니다.

---

## 응답 형식

`/api/process`는 상황에 따라 두 종류의 응답을 반환합니다.

- 성공 시:
  - `Content-Type: application/vnd.hanplus.hwpx`
  - `Content-Disposition`: 다운로드 파일명 포함
  - `X-Exam-Data`: Base64 인코딩된 JSON payload
- 실패 시:
  - JSON 에러 응답

---

## 현재 구현 기준과 한계

- HWPX 생성은 실제 템플릿 파일을 기준으로 동작합니다.
- 템플릿은 [`example.hwpx`](C:/Users/junuh/Desktop/코딩/HWPXport/example.hwpx)를 우선 사용하고, 없으면 [`public/templates/template.hwpx`](C:/Users/junuh/Desktop/코딩/HWPXport/public/templates/template.hwpx)를 사용합니다.
- 여러 파일을 한 번에 처리하더라도 현재 다운로드는 마지막 처리 흐름 기준으로 단일 파일 저장 UX에 맞춰져 있습니다.
- 수식은 완전한 수학 OCR 엔진이 아니라, HWP에 넣기 쉬운 선형 표기 텍스트로 정규화하는 방향입니다.
- 일반 AI 채팅 기반 추출은 모델 품질과 이미지 품질의 영향을 크게 받습니다. 따라서 정확도가 중요하면 고성능 모델을 권장합니다.

---

## 사용 기술

- `next`
- `react`
- `react-dom`
- `@google/generative-ai`
- `jszip`
- `pdfjs-dist`
- `tailwindcss`
- `typescript`

---

## 참고 파일

- [`app/page.tsx`](C:/Users/junuh/Desktop/코딩/HWPXport/app/page.tsx)
- [`app/api/process/route.ts`](C:/Users/junuh/Desktop/코딩/HWPXport/app/api/process/route.ts)
- [`lib/hwpx/builder.ts`](C:/Users/junuh/Desktop/코딩/HWPXport/lib/hwpx/builder.ts)
- [`lib/types.ts`](C:/Users/junuh/Desktop/코딩/HWPXport/lib/types.ts)

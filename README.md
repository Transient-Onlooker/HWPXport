# HWPXport

> **시험지 이미지와 PDF를 Gemini로 분석해 `.hwpx`로 복원하는 Next.js 앱**

프론트엔드에서 업로드 파일을 전처리한 뒤 `/api/process`로 전송하고, 서버에서 Gemini로 문제 데이터를 추출한 후 HWPX ZIP 구조를 조립합니다.

---

## 프로젝트 소개

HWPXport는 시험지 이미지 또는 PDF를 받아 문제 구조를 분석하고, 이를 한글 문서 형식인 `.hwpx`로 내려받게 하는 도구입니다.

- 이미지 파일(`PNG`, `JPG`, `JPEG`, `WEBP`)과 `PDF` 업로드 지원
- 드래그 앤 드롭 업로드 UI
- 다크 모드 토글
- 브라우저에서 이미지 리사이즈 및 JPEG 압축 처리
- PDF를 페이지별 이미지로 변환 후 순차 처리
- Gemini 2단계 처리
- 1단계: Lite 모델로 복잡도 판별
- 2단계: Flash 계열 모델로 문제 구조 파싱
- Gemini 응답을 기반으로 `.hwpx` 파일 생성 및 자동 다운로드
- 성공 후 디버그 정보 확인
- 처리된 이미지 미리보기
- Gemini JSON 응답 확인 및 JSON 다운로드
- React `ErrorBoundary` 적용

---

## 주요 구성

| 영역 | 내용 |
|------|------|
| **Frontend** | Next.js App Router 기반 업로드 UI, 상태 표시, 자동 다운로드 |
| **AI Parsing** | Gemini Router + Parser 2단계 처리 |
| **Conversion** | `jszip` 기반 HWPX ZIP/XML 조립 |
| **Input Handling** | 이미지 리사이즈, PDF 페이지 렌더링, 순차 업로드 |
| **Debugging** | 처리 이미지 미리보기, JSON 응답 헤더 확인 |

---

## 동작 방식

### 1. 업로드와 전처리

`app/page.tsx`에서 파일을 받습니다.

- 이미지 파일은 `canvas`로 최대 `1920x1920` 범위 안에서 리사이즈합니다.
- JPEG 품질은 `0.8`로 압축합니다.
- PDF는 `pdfjs-dist`로 모든 페이지를 렌더링한 뒤 페이지별 JPEG Blob으로 변환합니다.
- 각 페이지 또는 이미지가 `/api/process`에 개별 전송됩니다.

### 2. Gemini 분석

[`app/api/process/route.ts`](C:/Users/junuh/Desktop/코딩/HWPXport/app/api/process/route.ts)에서 처리합니다.

- `GEMINI_API_KEY`를 `process.env.GEMINI_API_KEY`에서 읽습니다.
- Router 모델: `gemini-3.1-flash-lite-preview`
- Parser 모델: `gemini-3-flash-preview`
- Router는 `{"isComplex": boolean}` JSON만 반환하도록 구성됩니다.
- Parser는 `responseMimeType: "application/json"`과 스키마를 사용해 `ExamData` 구조를 반환하도록 구성됩니다.

추출 데이터 구조는 [`lib/types.ts`](C:/Users/junuh/Desktop/코딩/HWPXport/lib/types.ts)에 정의되어 있습니다.

- `title`
- `questions[]`
- `number`
- `text`
- `boxContext`
- `options`

### 3. HWPX 생성

[`lib/hwpx/builder.ts`](C:/Users/junuh/Desktop/코딩/HWPXport/lib/hwpx/builder.ts)에서 `jszip`으로 HWPX 패키지를 생성합니다.

- `content.xml`
- `metadata.xml`
- `_rels/.rels`
- `docProps/app.xml`
- `docProps/core.xml`
- `[Content_Types].xml`

현재 빌더에 반영된 규칙:

- 2단 레이아웃용 `<hp:colPr colCount="2" sameGap="3120"/>`
- 문제 번호 뒤 공백용 `<hp:nbSpace/><hp:fwSpace/>`
- 일반 텍스트와 강조 텍스트의 문자 스타일 분리
- 백틱으로 감싼 수식을 `<hp:equation><hp:script>...</hp:script></hp:equation>`로 삽입
- 제목, 보기 박스, 선택지 문단 생성

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
inputprompt.txt
```

---

## 실행 방법

### 1. 환경 변수

루트에 `.env.local` 파일을 만들고 Gemini API 키를 넣습니다.

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

예시는 [`.env.example`](C:/Users/junuh/Desktop/코딩/HWPXport/.env.example) 파일에 있습니다.

### 2. 설치

```bash
npm install
```

### 3. 개발 서버 실행

```bash
npm run dev
```

기본적으로 `http://localhost:3000`에서 확인합니다.

---

## 사용 방법

1. 이미지 또는 PDF를 업로드합니다.
2. 앱이 파일을 전처리하고 순차적으로 서버에 전송합니다.
3. Gemini가 시험지 구조를 JSON으로 추출합니다.
4. 서버가 HWPX 파일을 생성해 응답합니다.
5. 브라우저가 `.hwpx` 파일을 자동 다운로드합니다.
6. 성공 화면에서 처리된 이미지와 JSON 응답을 확인할 수 있습니다.

---

## 구현 세부사항

### 프론트엔드 상태

[`app/page.tsx`](C:/Users/junuh/Desktop/코딩/HWPXport/app/page.tsx) 기준 상태 머신:

- `IDLE`
- `UPLOADING`
- `GENERATING`
- `SUCCESS`
- `ERROR`

### 업로드 제한

[`components/FileUploader.tsx`](C:/Users/junuh/Desktop/코딩/HWPXport/components/FileUploader.tsx) 기준:

- 허용 형식: 이미지, PDF
- 기본 최대 파일 크기: `20MB`
- 다중 파일 업로드 지원

### 응답 형식

API는 HWPX 바이너리를 직접 반환합니다.

- `Content-Type: application/vnd.hanplus.hwpx`
- `Content-Disposition`으로 파일명 제공
- `X-Exam-Data` 헤더에 Base64 인코딩된 JSON 포함

---

## 현재 구현 기준의 한계

- `public/templates/template.hwpx` 파일은 저장소에 포함되어 있지만, 현재 빌더는 이 템플릿을 읽어 재조립하지 않고 직접 ZIP/XML을 생성합니다.
- 여러 파일이나 여러 PDF 페이지를 처리하더라도, 프론트엔드에서는 현재 첫 번째 HWPX 결과물만 자동 다운로드합니다.
- 수식은 자유 텍스트 전체를 자동 분석하는 방식이 아니라, 현재 코드상 백틱으로 감싼 토큰을 우선적으로 HWP 수식 XML로 넣는 방식입니다.
- [`lib/hwpx/templates.ts`](C:/Users/junuh/Desktop/코딩/HWPXport/lib/hwpx/templates.ts)에 정의된 템플릿 경로와 상수는 현재 핵심 처리 경로에서 직접 사용되지 않습니다.
- README는 [`inputprompt.txt`](C:/Users/junuh/Desktop/코딩/HWPXport/inputprompt.txt)의 목표를 참고했지만, 설명 기준은 실제 커밋된 코드입니다.

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

- [`inputprompt.txt`](C:/Users/junuh/Desktop/코딩/HWPXport/inputprompt.txt)
- [`app/page.tsx`](C:/Users/junuh/Desktop/코딩/HWPXport/app/page.tsx)
- [`app/api/process/route.ts`](C:/Users/junuh/Desktop/코딩/HWPXport/app/api/process/route.ts)
- [`lib/hwpx/builder.ts`](C:/Users/junuh/Desktop/코딩/HWPXport/lib/hwpx/builder.ts)
- [`lib/types.ts`](C:/Users/junuh/Desktop/코딩/HWPXport/lib/types.ts)

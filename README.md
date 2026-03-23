# HWPXport

> Convert exam images, PDFs, or extracted JSON into `.hwpx` using a real HWPX template.

HWPXport is a Next.js app for turning exam sheets into editable HWPX documents.  
It supports two workflows:

- `Image/PDF -> Gemini -> JSON -> HWPX`
- `Saved JSON -> HWPX` without extra API cost

The current implementation is built around a real template file, `example.hwpx`, and rewrites HWPX XML instead of generating a fake archive from scratch.

---

## Features

- Upload `PNG`, `JPG`, `JPEG`, `WEBP`, `PDF`, or `.json`
- Convert PDF pages into images in the browser
- Run Gemini parsing for image/PDF input
- Rebuild HWPX directly from saved JSON
- Merge multiple JSON block files into one exam before generation
- Preserve:
  - bold text via `**text**`
  - underlined text via `__text__`
- Mark questions that still need manual figure insertion
- Distinguish detached context blocks:
  - `passage`
  - `condition`
  - `data`
  - `example`
  - `box`
- Keep the exam-style 2-column HWPX layout from the template

---

## Current Data Model

`lib/types.ts`

```ts
type ContextLabel = 'box' | 'passage' | 'condition' | 'data' | 'example';

interface ExamData {
  title: string;
  questions: Question[];
}

interface Question {
  number: number;
  text: string;
  boxContext: string[];
  contextLabel?: ContextLabel;
  needsFigure: boolean;
  options: string[];
}
```

Field meaning:

- `title`: exam title shown in the HWPX header
- `text`: main question text
- `boxContext`: detached visible block only when actually present in the source
- `contextLabel`: semantic label for `boxContext`
- `needsFigure`: `true` if a graph/diagram/table/chemical figure still needs manual insertion
- `options`: option text only, without `??, `(1)`, `1.` prefixes

---

## JSON Rules

### Recommended JSON Example

```json
{
  "title": "Sample Middle School Grade 1 Midterm English",
  "questions": [
    {
      "number": 1,
      "text": "What is the meaning of __pine branches__ in the highlighted **context**?",
      "boxContext": [
        "[1-3] Read the following passage and answer the questions.",
        "First visible line of the passage...",
        "Second visible line of the passage..."
      ],
      "contextLabel": "passage",
      "needsFigure": false,
      "options": [
        "First option",
        "Second option",
        "Third option",
        "Fourth option",
        "Fifth option"
      ]
    }
  ]
}
```

### Important Normalization Rules

- `**text**` means bold
- `__text__` means underline
- Option text should not include numbering markers
- `boxContext` is optional
- If no detached visible block exists, use `[]`
- If uncertain, do not invent `boxContext`
- Never use placeholders such as:
  - `...`
  - `(본문 생략)`
  - `(지문 생략)`
  - `요약`
  unless those words are literally printed in the source

---

## General AI Prompt

Use this when you do not want to call Gemini API directly and instead want to extract JSON from ChatGPT, Gemini App, Claude, or another general-purpose AI.

### Recommended Usage

- Prefer high-capability models such as `Pro`, `Advanced`, or `Opus`
- Split long exams by question block, not by page
- Keep shared passage blocks together
- Output raw JSON only

### Copy-Paste Prompt

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
      "contextLabel": "box | passage | condition | data | example",
      "needsFigure": false,
      "options": ["string"]
    }
  ]
}

Critical extraction rules:
1. Keep Korean text exactly as shown whenever it is visible.
2. Never replace visible source text with placeholders such as "...", "(본문 생략)", "(지문 생략)", "요약", or similar shortened text unless those exact words are literally printed in the source.
3. If a passage is long, still transcribe the visible text in full instead of abbreviating it.
4. Preserve underlined, bold, boxed, or otherwise emphasized phrases:
   - bold -> **text**
   - underline -> __text__
5. Preserve visible markers such as `㉠`, `㉡`, `㉢`, `①`, `②`, `③` exactly when they are part of the source text.
6. If a question contains a graph, chart, diagram, table, chemical structure, or other important non-text figure that should later be inserted manually, set "needsFigure" to true. Otherwise set it to false.
7. If boxContext contains a detached block, classify it with contextLabel:
   - "passage" for long reading passages or shared stems
   - "condition" for answer conditions or constraints
   - "data" for data blocks, tables, or reference materials
   - "example" for 보기/example statement blocks
   - "box" for generic boxed content when the type is unclear
8. If a shared passage header exists, such as "[1-3] ..." or "다음 글을 읽고 ...", include that header inside boxContext and use contextLabel "passage" instead of merging it into the main question text.
9. Keep each visible passage line as a separate boxContext item when possible, especially for long reading passages.
10. For multiple-choice questions, return each option as plain option text only. Do not include leading numbering markers such as "①", "(1)", "1.", or similar prefixes.
11. boxContext is optional. If there is no clearly visible detached block in the source, use [].
12. Never invent quotations, summaries, omitted text, background explanations, or reconstructed passage lines that are not visibly present in the source.
13. When uncertain whether a detached block really exists, leave boxContext empty instead of guessing.

Math normalization rules:
1. Fractions:
   - "n over 2"
   - "(x+1) over (x-1)"
2. Square roots:
   - "sqrt{3}"
3. Powers:
   - "x^2"
4. Subscripts:
   - "x_i"
5. Summation / product / integral:
   - "sum from i=1 to n"
   - "prod from k=1 to n"
   - "int from 0 to 1"

Segmentation rules:
1. A question that contains a passage plus sub-statements should still remain one question unless the printed source clearly splits it into separate numbered items.
2. If a shared passage applies to multiple numbered questions, keep that shared passage in boxContext as a detached passage block.
3. Do not merge distinct numbered questions into one.

Output constraints:
1. Output exactly one JSON object.
2. Use valid JSON only.
3. Do not wrap the JSON in markdown code fences.
4. Do not prepend or append any explanation.
```

### Recovery Prompt

If the AI adds explanation text around the JSON:

```text
Return the previous result again as raw JSON only. No markdown, no explanation, no code fences.
```

---

## Block JSON Workflow

For long exams, do not split by page when a passage crosses page boundaries.

Recommended approach:

- Split by question block
- Keep shared passage groups together
- Examples:
  - `block-01.json`
  - `block-02.json`
  - `block-22-24.json`

Current behavior:

- If you upload multiple `.json` files together, HWPXport merges them by:
  - `title`
  - `question.number`

This merge happens in `app/page.tsx` before the request is sent to `/api/process`.

---

## Figure Handling

`needsFigure: true` means the app will not try to rebuild the figure automatically.

Instead, HWPX output will include a placeholder such as:

```text
[23번 문제: 그림 삽입 필요]
```

Use this for:

- graphs
- diagrams
- chemical structures
- complex nested tables
- anything visual that is unsafe to reconstruct as plain text

---

## Table Handling

Current status:

- simple text/table-like blocks can be preserved as context
- true structured multi-cell table generation is not implemented yet
- nested tables are not supported

Recommended fallback:

- if a table is too complex, mark the question with `needsFigure: true`

---

## HWPX Formatting Mapping

Based on the styles found in `example.hwpx`:

- plain text -> `charPrIDRef="6"`
- bold -> `charPrIDRef="9"`
- underline -> `charPrIDRef="10"`

The builder currently maps:

- `**text**` -> bold
- `__text__` -> underline

Implementation:

- `lib/hwpx/builder.ts`

---

## App Behavior

### Frontend

`app/page.tsx`

- image/PDF upload
- JSON upload
- multiple JSON block merge
- debug JSON download
- processed image preview

### API Route

`app/api/process/route.ts`

- image/PDF -> Gemini parsing
- JSON -> validation -> HWPX
- option prefix cleanup
- `boxContext` hallucination filtering

### Builder

`lib/hwpx/builder.ts`

- preserves the 2-column template layout
- writes:
  - `Contents/section0.xml`
  - `Contents/content.hpf`
  - `Preview/PrvText.txt`
- renders context blocks with semantic labels
- inserts figure placeholders when needed

---

## Run

### 1. Environment

Create `.env.local` in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Reference file:

- `.env.example`

### 2. Install

```bash
npm install
```

### 3. Start Dev Server

```bash
npm run dev
```

Or on Windows:

- `run.bat`

Default URL:

- `http://localhost:3000`

---

## Cheap Verification Loop

1. Run one image/PDF once
2. Download the JSON payload from the debug panel
3. Re-upload the saved JSON
4. Iterate on HWPX generation without paying for repeated AI parsing

---

## Limitations

- complex tables are not fully reconstructed yet
- nested tables are not supported
- figure/image insertion is still manual via placeholder guidance
- AI extraction quality still depends on source quality and model quality
- `next.config.mjs` still produces one Turbopack tracing warning because the builder reads template files from disk

---

## Stack

- `next`
- `react`
- `react-dom`
- `@google/generative-ai`
- `jszip`
- `pdfjs-dist`
- `tailwindcss`
- `typescript`

---

## Main Files

- `app/page.tsx`
- `app/api/process/route.ts`
- `lib/hwpx/builder.ts`
- `lib/types.ts`
- `example.hwpx`

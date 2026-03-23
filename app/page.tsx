'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileUploader } from '@/components/FileUploader';
import { StatusMessage } from '@/components/StatusMessage';

let PDFJS: typeof import('pdfjs-dist') | null = null;

async function loadPDFJS() {
  if (!PDFJS) {
    PDFJS = await import('pdfjs-dist');
    PDFJS.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  }

  return PDFJS;
}

type UploadStatus = 'IDLE' | 'UPLOADING' | 'GENERATING' | 'SUCCESS' | 'ERROR';

interface UploadState {
  status: UploadStatus;
  message?: string;
  progress?: number;
  filename?: string;
}

const IMAGE_OPTIMIZATION = {
  MAX_WIDTH: 1920,
  MAX_HEIGHT: 1920,
  JPEG_QUALITY: 0.8,
} as const;

type ProcessedInput =
  | { kind: 'image'; blobs: Blob[] }
  | { kind: 'pdf'; blobs: Blob[] }
  | { kind: 'json'; blobs: Blob[] };

function isJsonFile(file: File): boolean {
  return file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');
}

async function convertPdfToImage(file: File): Promise<Blob[]> {
  const pdfjs = await loadPDFJS();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const images: Blob[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create canvas context for PDF rendering.');
    }

    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => {
          if (!value) {
            reject(new Error('Failed to convert PDF page to image.'));
            return;
          }
          resolve(value);
        },
        'image/jpeg',
        IMAGE_OPTIMIZATION.JPEG_QUALITY
      );
    });

    images.push(blob);
  }

  return images;
}

async function optimizeImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      const scale = Math.min(
        IMAGE_OPTIMIZATION.MAX_WIDTH / width,
        IMAGE_OPTIMIZATION.MAX_HEIGHT / height,
        1
      );

      width = Math.floor(width * scale);
      height = Math.floor(height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to create canvas context for image optimization.'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to optimize image.'));
            return;
          }
          resolve(blob);
        },
        'image/jpeg',
        IMAGE_OPTIMIZATION.JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image.'));
    };

    img.src = url;
  });
}

async function processFile(file: File): Promise<ProcessedInput> {
  if (isJsonFile(file)) {
    return { kind: 'json', blobs: [file] };
  }

  if (file.type === 'application/pdf') {
    return { kind: 'pdf', blobs: await convertPdfToImage(file) };
  }

  return { kind: 'image', blobs: [await optimizeImage(file)] };
}

export default function Home() {
  const [state, setState] = useState<UploadState>({ status: 'IDLE' });
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    const saved = localStorage.getItem('darkMode');
    if (saved !== null) {
      return JSON.parse(saved);
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [debugData, setDebugData] = useState<{
    images: { url: string; name: string }[];
    jsonResponse: string;
  }>({ images: [], jsonResponse: '' });
  const [uploaderKey, setUploaderKey] = useState(0);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  const handleFileSelect = useCallback(async (files: File[]) => {
    try {
      setState({ status: 'UPLOADING', progress: 0, message: 'Preparing files...' });

      const totalFiles = files.length;
      const allHwpxFiles: Blob[] = [];
      const processedImages: { url: string; name: string }[] = [];
      let lastResponse: Response | null = null;
      let lastJsonResponse = '';

      for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
        const file = files[fileIndex];
        const processed = await processFile(file);
        const totalParts = processed.blobs.length;

        for (let partIndex = 0; partIndex < processed.blobs.length; partIndex++) {
          const blob = processed.blobs[partIndex];
          const currentFileNum = fileIndex + 1;
          const currentPartNum = partIndex + 1;
          const progress = Math.floor(((fileIndex + currentPartNum / totalParts) / totalFiles) * 100);

          if (processed.kind !== 'json') {
            const imageUrl = URL.createObjectURL(blob);
            const imageName =
              processed.kind === 'pdf'
                ? `${file.name.replace(/\.pdf$/i, '')}_p${currentPartNum}.jpg`
                : file.name;
            processedImages.push({ url: imageUrl, name: imageName });
          }

          const processMessage =
            processed.kind === 'json'
              ? `${file.name} -> HWPX (${currentFileNum}/${totalFiles})`
              : processed.kind === 'pdf'
                ? `${file.name} page ${currentPartNum}/${totalParts}`
                : `${file.name} (${currentFileNum}/${totalFiles})`;

          setState({
            status: 'GENERATING',
            progress,
            message:
              processed.kind === 'json'
                ? `Building HWPX directly from JSON: ${processMessage}`
                : `Analyzing with Gemini and building HWPX: ${processMessage}`,
          });

          const formData = new FormData();
          const uploadName =
            processed.kind === 'json'
              ? file.name
              : processed.kind === 'pdf'
                ? `page_${currentPartNum}.jpg`
                : `image_${currentFileNum}.jpg`;
          formData.append('file', blob, uploadName);

          const response = await fetch('/api/process', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server error: ${response.status}`);
          }

          allHwpxFiles.push(await response.blob());
          lastResponse = response;

          const examDataHeader = response.headers.get('X-Exam-Data');
          if (examDataHeader) {
            try {
              lastJsonResponse = atob(examDataHeader);
            } catch (error) {
              console.error('[Upload] Failed to decode X-Exam-Data header:', error);
            }
          }
        }
      }

      if (allHwpxFiles.length === 0) {
        throw new Error('No HWPX file was produced.');
      }

      const firstBlob = allHwpxFiles[0];
      const contentDisposition = lastResponse?.headers.get('Content-Disposition');
      let filename = 'exam.hwpx';

      if (files.length === 1) {
        if (isJsonFile(files[0])) {
          filename = files[0].name.replace(/\.json$/i, '.hwpx');
        } else if (files[0].type === 'application/pdf') {
          filename = files[0].name.replace(/\.pdf$/i, '.hwpx');
        }
      }

      if (contentDisposition) {
        const starMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
        const basicMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i);

        if (starMatch?.[1]) {
          filename = decodeURIComponent(starMatch[1]);
        } else if (basicMatch?.[1]) {
          filename = basicMatch[1].replace(/['"]/g, '');
        }
      }

      const downloadUrl = URL.createObjectURL(firstBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      setDebugData({
        images: processedImages,
        jsonResponse: lastJsonResponse,
      });

      setState({
        status: 'SUCCESS',
        filename,
        message: `Completed. Downloaded ${filename}.`,
      });
    } catch (error) {
      console.error('[Upload] Error:', error);
      setState({
        status: 'ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, []);

  const handleReset = useCallback(() => {
    setState({ status: 'IDLE' });
    debugData.images.forEach((image) => URL.revokeObjectURL(image.url));
    setDebugData({ images: [], jsonResponse: '' });
    setUploaderKey((prev: number) => prev + 1);
  }, [debugData.images]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors duration-300">
      <header className="sticky top-0 z-10 backdrop-blur-md bg-white/70 dark:bg-gray-900/70 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">HWPXport</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Image/PDF to HWPX, or JSON to HWPX without Gemini cost
            </p>
          </div>
          <button
            onClick={() => setDarkMode((prev: boolean) => !prev)}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Toggle dark mode"
          >
            {darkMode ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <section className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Gemini-based exam recovery to HWPX
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Upload an image or PDF to run Gemini extraction, or upload a saved JSON file to rebuild HWPX
            directly with no extra API cost.
          </p>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 mb-8">
          <div className="space-y-6">
            <FileUploader
              key={uploaderKey}
              onFileSelect={handleFileSelect}
              disabled={state.status === 'UPLOADING' || state.status === 'GENERATING'}
              accept="image/*,application/pdf,application/json,.json"
              maxSize={20 * 1024 * 1024}
            />

            <StatusMessage status={state.status} message={state.message} progress={state.progress} />

            {state.status === 'SUCCESS' && (
              <button
                onClick={handleReset}
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Process another file
              </button>
            )}

            {state.status === 'ERROR' && (
              <button
                onClick={handleReset}
                className="w-full px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
              >
                Retry
              </button>
            )}
          </div>
        </section>

        {state.status === 'SUCCESS' && (debugData.images.length > 0 || debugData.jsonResponse) && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 mb-8">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Debug Output</h3>

            {debugData.images.length > 0 && (
              <div className="mb-6">
                <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Processed images ({debugData.images.length})
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {debugData.images.map((image, index) => (
                    <div key={`${image.name}-${index}`} className="group relative">
                      <img
                        src={image.url}
                        alt={image.name}
                        className="w-full h-40 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                        <a
                          href={image.url}
                          download={image.name}
                          className="px-4 py-2 bg-white text-gray-900 rounded-lg font-medium hover:bg-gray-100 transition-colors"
                        >
                          Download
                        </a>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{image.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {debugData.jsonResponse && (
              <div>
                <div className="flex items-center justify-between mb-3 gap-3">
                  <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300">JSON payload</h4>
                  <button
                    onClick={() => {
                      const blob = new Blob([debugData.jsonResponse], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = 'exam-data.json';
                      link.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                  >
                    Download JSON
                  </button>
                </div>
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto max-h-96 text-sm">
                  <code>{debugData.jsonResponse}</code>
                </pre>
              </div>
            )}
          </section>
        )}

        <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">How to verify cheaply</h3>
          <ul className="space-y-3 text-gray-600 dark:text-gray-400">
            <li>1. Run one image or PDF once and download the JSON from the debug panel.</li>
            <li>2. Re-upload that JSON file to regenerate HWPX without calling Gemini again.</li>
            <li>3. Compare the new HWPX output while iterating on the builder logic.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

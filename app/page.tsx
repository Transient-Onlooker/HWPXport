'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { FileUploader } from '@/components/FileUploader';
import { StatusMessage } from '@/components/StatusMessage';

// PDF.js 는 동적 import 사용 (서버 사이드 에러 방지)
let PDFJS: typeof import('pdfjs-dist') | null = null;

async function loadPDFJS() {
  if (!PDFJS) {
    PDFJS = await import('pdfjs-dist');
    // 로컬 node_modules 의 워커 사용 (CORS 문제 없음)
    PDFJS.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  }
  return PDFJS;
}

/**
 * 업로드 상태 머신
 */
type UploadStatus = 'IDLE' | 'UPLOADING' | 'GENERATING' | 'SUCCESS' | 'ERROR';

interface UploadState {
  status: UploadStatus;
  message?: string;
  progress?: number;
  filename?: string;
}

/**
 * 이미지 최적화 설정
 */
const IMAGE_OPTIMIZATION = {
  MAX_WIDTH: 1920,
  MAX_HEIGHT: 1920,
  JPEG_QUALITY: 0.8,
} as const;

/**
 * PDF 를 이미지로 변환 (모든 페이지)
 */
async function convertPdfToImage(file: File): Promise<Blob[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const pdfjs = await loadPDFJS();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const images: Blob[] = [];

      // 모든 페이지 순회
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 }); // 고해상도

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context 를 생성할 수 없습니다.'));
          return;
        }

        await page.render({
          canvasContext: ctx,
          viewport,
        }).promise;

        // JPEG 로 변환
        const blob = await new Promise<Blob>((resolveBlob, rejectBlob) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                rejectBlob(new Error('이미지 변환에 실패했습니다.'));
                return;
              }
              resolveBlob(blob);
            },
            'image/jpeg',
            IMAGE_OPTIMIZATION.JPEG_QUALITY
          );
        });

        images.push(blob);
      }

      resolve(images);
    } catch (error) {
      reject(new Error('PDF 변환 중 오류가 발생했습니다.'));
    }
  });
}

/**
 * Canvas 를 사용하여 이미지 리사이징 및 최적화
 */
async function optimizeImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // 리사이징 비율 계산
      let { width, height } = img;
      const scale = Math.min(
        IMAGE_OPTIMIZATION.MAX_WIDTH / width,
        IMAGE_OPTIMIZATION.MAX_HEIGHT / height,
        1 // 원래 크기보다 크게 만들지 않음
      );

      width = Math.floor(width * scale);
      height = Math.floor(height * scale);

      // Canvas 에 그리기
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context 를 생성할 수 없습니다.'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // JPEG 로 변환 (품질 80%)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('이미지 변환에 실패했습니다.'));
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
      reject(new Error('이미지를 로드할 수 없습니다.'));
    };

    img.src = url;
  });
}

/**
 * 파일 타입에 따라 적절한 변환 함수 선택
 */
async function processFile(file: File): Promise<Blob[]> {
  if (file.type === 'application/pdf') {
    return convertPdfToImage(file);
  } else {
    const blob = await optimizeImage(file);
    return [blob];
  }
}

/**
 * 메인 페이지 컴포넌트
 */
export default function Home() {
  const [state, setState] = useState<UploadState>({ status: 'IDLE' });
  const [darkMode, setDarkMode] = useState(() => {
    // 초기값: 시스템 테마 또는 localStorage 에서 읽기
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) {
        return JSON.parse(saved);
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // darkMode 변경 시 html 태그에 클래스 적용
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('darkMode', 'false');
    }
  }, [darkMode]);

  /**
   * 파일 선택 핸들러
   */
  const handleFileSelect = useCallback(async (files: File[]) => {
    try {
      // 1. UPLOADING 상태로 전환
      setState({ status: 'UPLOADING', progress: 0 });

      const totalFiles = files.length;
      const allHwpxFiles: Blob[] = [];
      let lastResponse: Response | null = null;

      // 2. 각 파일을 순차적으로 처리
      for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
        const file = files[fileIndex];
        const isPdf = file.type === 'application/pdf';
        
        // 파일 변환 (PDF 는 모든 페이지, 이미지는 단일)
        const optimizedBlobs = await processFile(file);
        const pageBlobs = optimizedBlobs.length;

        // 3. 각 페이지/이미지를 개별적으로 API 호출
        for (let i = 0; i < optimizedBlobs.length; i++) {
          const optimizedBlob = optimizedBlobs[i];
          const pageNum = i + 1;
          const currentFileNum = fileIndex + 1;

          // 진행 상황 업데이트
          const overallProgress = Math.floor(((fileIndex + (i + 1) / pageBlobs) / totalFiles) * 100);
          setState((prev) => ({
            ...prev,
            progress: overallProgress,
            message: isPdf
              ? `${file.name} - ${pageNum}페이지 처리 중... (${i + 1}/${pageBlobs})`
              : `${file.name} 처리 중... (${currentFileNum}/${totalFiles})`
          }));

          // FormData 생성 (파일명은 ASCII 만 사용 - 한국어 인코딩 문제 방지)
          const formData = new FormData();
          const safeFilename = isPdf
            ? `page_${pageNum}.jpg`
            : `image_${fileIndex + 1}.jpg`;
          formData.append('file', optimizedBlob, safeFilename);

          // API 호출
          setState({
            status: 'GENERATING',
            message: isPdf
              ? `${file.name} - ${pageNum}페이지 처리 중... (${i + 1}/${pageBlobs})`
              : `${file.name} 처리 중... (${currentFileNum}/${totalFiles})`
          });

          const response = await fetch('/api/process', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('[Upload] API Error:', response.status, errorData);
            throw new Error(errorData.error || `서버 오류: ${response.status}`);
          }

          // HWPX 파일 받기
          const blob = await response.blob();
          console.log('[Upload] Received blob:', blob.type, blob.size);
          allHwpxFiles.push(blob);
          lastResponse = response;
        }
      }

      // 4. 모든 파일 처리 완료 - 첫 번째 파일만 다운로드
      if (allHwpxFiles.length === 0) {
        throw new Error('처리된 파일이 없습니다.');
      }

      const firstBlob = allHwpxFiles[0];
      const contentDisposition = lastResponse?.headers.get('Content-Disposition');

      // 파일명 추출
      let filename = totalFiles === 1 && files[0].type === 'application/pdf'
        ? files[0].name.replace(/\.pdf$/i, '.hwpx')
        : 'exam.hwpx';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }

      // 5. 다운로드 트리거
      const downloadUrl = URL.createObjectURL(firstBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      // 6. SUCCESS 상태로 전환
      setState({
        status: 'SUCCESS',
        message: `총 ${totalFiles}개 파일 처리 완료. ${filename} 파일이 다운로드되었습니다.`,
        filename
      });

    } catch (error) {
      console.error('[Upload] Error:', error);
      setState({
        status: 'ERROR',
        message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
      });
    }
  }, []);

  /**
   * 초기화 핸들러
   */
  const handleReset = useCallback(() => {
    setState({ status: 'IDLE' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  /**
   * 다크모드 토글
   */
  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => !prev);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors duration-300">
        {/* 헤더 */}
        <header className="sticky top-0 z-10 backdrop-blur-md bg-white/70 dark:bg-gray-900/70 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📝</span>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                HWPX Port
              </h1>
            </div>
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title={darkMode ? '라이트 모드' : '다크 모드'}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
          </div>
        </header>

        {/* 메인 컨텐츠 */}
        <main className="max-w-4xl mx-auto px-4 py-12">
          {/* 소개 섹션 */}
          <section className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Gemini 기반 HWPX 시험지 복원
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              시험지 이미지 또는 PDF 를 업로드하면 AI 가 문제와 수식을 자동으로 추출하여
              HWPX 파일로 변환해드립니다.
            </p>
          </section>

          {/* 업로드 섹션 */}
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 mb-8">
            <div className="space-y-6">
              {/* 파일 업로더 */}
              <FileUploader
                onFileSelect={handleFileSelect}
                disabled={state.status === 'UPLOADING' || state.status === 'GENERATING'}
                accept="image/*,application/pdf"
                maxSize={20 * 1024 * 1024}
              />

              {/* 상태 메시지 */}
              <StatusMessage
                status={state.status}
                message={state.message}
                progress={state.progress}
              />

              {/* 액션 버튼 */}
              {state.status === 'SUCCESS' && (
                <div className="flex gap-3">
                  <button
                    onClick={handleReset}
                    className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                  >
                    다른 파일 변환하기
                  </button>
                </div>
              )}

              {state.status === 'ERROR' && (
                <div className="flex gap-3">
                  <button
                    onClick={handleReset}
                    className="flex-1 px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
                  >
                    다시 시도
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* 사용 가이드 */}
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <span>💡</span> 사용 가이드
            </h3>
            <ul className="space-y-3 text-gray-600 dark:text-gray-400">
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">1.</span>
                <span>시험지 이미지 (PNG, JPG) 또는 PDF 파일을 준비합니다.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">2.</span>
                <span>위 영역에 드래그하거나 클릭하여 업로드합니다.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">3.</span>
                <span>AI 가 문제와 수식을 분석하여 HWPX 파일로 변환합니다.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">4.</span>
                <span>변환된 파일을 자동으로 다운로드합니다.</span>
              </li>
            </ul>
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <span className="font-bold">💡 팁:</span> PDF 는 모든 페이지가 개별적으로 처리되며,
                이미지는 자동으로 최적화되어 업로드됩니다 (최대 20MB).
              </p>
            </div>
          </section>
        </main>

        {/* 푸터 */}
        <footer className="border-t border-gray-200 dark:border-gray-700 mt-12">
          <div className="max-w-4xl mx-auto px-4 py-6 text-center text-gray-500 dark:text-gray-400 text-sm">
            <p>HWPX Port - Gemini AI 기반 시험지 복원 서비스</p>
          </div>
        </footer>
      </div>
  );
}

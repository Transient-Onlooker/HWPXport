'use client';

import { useCallback, useState, DragEvent, ChangeEvent } from 'react';

interface Props {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  accept?: string;
  maxSize?: number; // bytes
}

/**
 * 드래그 앤 드롭 파일 업로드 컴포넌트
 * - 이미지 미리보기
 * - 파일 크기 제한
 * - 드래그 앤 드롭 + 클릭 업로드 지원
 */
export function FileUploader({
  onFileSelect,
  disabled = false,
  accept = 'image/*',
  maxSize = 10 * 1024 * 1024, // 10MB
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const validateFile = (file: File): string | null => {
    if (!file.type.startsWith('image/')) {
      return '이미지 파일만 업로드할 수 있습니다.';
    }
    if (file.size > maxSize) {
      return `파일 크기는 ${maxSize / 1024 / 1024}MB 이하여야 합니다.`;
    }
    return null;
  };

  const handleFile = useCallback((file: File) => {
    const error = validateFile(file);
    if (error) {
      alert(error);
      return;
    }

    setFileName(file.name);
    onFileSelect(file);

    // 미리보기 생성
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, [onFileSelect, maxSize]);

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [disabled, handleFile]);

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  const handleReset = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewUrl(null);
    setFileName(null);
  }, []);

  return (
    <div
      className={`
        relative w-full h-64 border-2 border-dashed rounded-xl
        transition-all duration-200 ease-in-out
        ${isDragging 
          ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20' 
          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${previewUrl ? 'p-2' : 'flex flex-col items-center justify-center'}
      `}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {previewUrl ? (
        <div className="relative w-full h-full">
          <img
            src={previewUrl}
            alt="Preview"
            className="w-full h-full object-contain rounded-lg"
          />
          <button
            type="button"
            onClick={handleReset}
            disabled={disabled}
            className="absolute top-2 right-2 p-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-colors disabled:opacity-50"
            title="파일 제거"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {fileName && (
            <p className="absolute bottom-2 left-2 text-xs text-gray-600 dark:text-gray-400 bg-white/80 dark:bg-gray-800/80 px-2 py-1 rounded">
              {fileName}
            </p>
          )}
        </div>
      ) : (
        <>
          <input
            type="file"
            accept={accept}
            onChange={handleInputChange}
            disabled={disabled}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="text-center p-6">
            <div className="text-5xl mb-4">📁</div>
            <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
              파일을 여기에 드래그하거나 클릭하세요
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              지원 형식: PNG, JPG, JPEG, WEBP (최대 {maxSize / 1024 / 1024}MB)
            </p>
          </div>
        </>
      )}
    </div>
  );
}

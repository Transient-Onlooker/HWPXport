'use client';

import { ChangeEvent, DragEvent, useCallback, useState } from 'react';

interface Props {
  onFileSelect: (files: File[]) => void;
  disabled?: boolean;
  accept?: string;
  maxSize?: number;
  multiple?: boolean;
}

type PreviewItem = {
  url: string;
  name: string;
  type: 'image' | 'pdf' | 'json';
};

function isJsonFile(file: File): boolean {
  return file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');
}

export function FileUploader({
  onFileSelect,
  disabled = false,
  accept = 'image/*,application/pdf,application/json,.json',
  maxSize = 10 * 1024 * 1024,
  multiple = true,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);

  const validateFile = (file: File): string | null => {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    const isJson = isJsonFile(file);

    if (!isImage && !isPdf && !isJson) {
      return 'Only image, PDF, or JSON files are supported.';
    }

    if (file.size > maxSize) {
      return `File size must be <= ${maxSize / 1024 / 1024}MB.`;
    }

    return null;
  };

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const validFiles: File[] = [];

      for (const file of fileArray) {
        const error = validateFile(file);
        if (error) {
          alert(`${file.name}: ${error}`);
          continue;
        }
        validFiles.push(file);
      }

      if (validFiles.length === 0) {
        return;
      }

      setPreviewItems([]);

      validFiles.forEach((file) => {
        if (file.type === 'application/pdf') {
          setPreviewItems((prev: PreviewItem[]) => [...prev, { url: '', name: file.name, type: 'pdf' }]);
          return;
        }

        if (isJsonFile(file)) {
          setPreviewItems((prev: PreviewItem[]) => [...prev, { url: '', name: file.name, type: 'json' }]);
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          setPreviewItems((prev: PreviewItem[]) => [
            ...prev,
            { url: event.target?.result as string, name: file.name, type: 'image' },
          ]);
        };
        reader.readAsDataURL(file);
      });

      onFileSelect(validFiles);
    },
    [maxSize, onFileSelect]
  );

  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!disabled) {
        setIsDragging(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);

      if (!disabled && event.dataTransfer.files.length > 0) {
        handleFiles(event.dataTransfer.files);
      }
    },
    [disabled, handleFiles]
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        handleFiles(files);
      }
    },
    [handleFiles]
  );

  const handleReset = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setPreviewItems([]);
  }, []);

  return (
    <div
      className={`
        relative w-full h-64 border-2 border-dashed rounded-xl
        transition-all duration-200 ease-in-out
        ${isDragging
          ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${previewItems.length > 0 ? 'p-2 overflow-auto' : 'flex flex-col items-center justify-center'}
      `}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {previewItems.length > 0 ? (
        <div className="relative w-full h-full">
          <div className="grid grid-cols-3 gap-2 h-full">
            {previewItems.map((item, index) => (
              <div key={`${item.name}-${index}`} className="relative border rounded-lg overflow-hidden">
                {item.type === 'image' ? (
                  <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800">
                    <div className="text-3xl mb-1">{item.type === 'json' ? '{ }' : 'PDF'}</div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate px-1">
                      {item.name}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={handleReset}
              className="absolute top-2 right-2 p-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-colors"
              title="Reset files"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <p className="absolute bottom-2 left-2 text-xs text-gray-600 dark:text-gray-400 bg-white/80 dark:bg-gray-800/80 px-2 py-1 rounded">
            {previewItems.length} file(s)
          </p>
        </div>
      ) : (
        <>
          <input
            type="file"
            accept={accept}
            onChange={handleInputChange}
            disabled={disabled}
            multiple={multiple}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="text-center p-6">
            <div className="text-5xl mb-4">+</div>
            <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
              Drop files here or click to upload
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Supported: PNG, JPG, JPEG, WEBP, PDF, JSON (max {maxSize / 1024 / 1024}MB)
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Use JSON to regenerate HWPX without calling Gemini again
            </p>
          </div>
        </>
      )}
    </div>
  );
}

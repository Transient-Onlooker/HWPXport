'use client';

interface StatusMessageProps {
  status: 'IDLE' | 'UPLOADING' | 'GENERATING' | 'SUCCESS' | 'ERROR';
  message?: string;
  progress?: number;
}

/**
 * 상태별 메시지 표시 컴포넌트
 */
export function StatusMessage({ status, message, progress }: StatusMessageProps) {
  const config = {
    IDLE: {
      icon: '📋',
      title: '대기 중',
      description: '시험지 이미지를 업로드해주세요.',
      color: 'text-gray-500 dark:text-gray-400',
      bgColor: 'bg-gray-100 dark:bg-gray-800',
    },
    UPLOADING: {
      icon: '⏳',
      title: '업로드 중',
      description: message || '이미지를 서버로 전송하고 있습니다...',
      color: 'text-blue-500 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    GENERATING: {
      icon: '🤖',
      title: '분석 중',
      description: message || 'Gemini AI 가 수식을 판별하고 있습니다...',
      color: 'text-purple-500 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    },
    SUCCESS: {
      icon: '✅',
      title: '완료!',
      description: message || 'HWPX 파일이 생성되었습니다.',
      color: 'text-green-500 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    ERROR: {
      icon: '❌',
      title: '오류',
      description: message || '오류가 발생했습니다.',
      color: 'text-red-500 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
    },
  }[status];

  return (
    <div className={`w-full rounded-xl p-4 ${config.bgColor} transition-all duration-300`}>
      <div className="flex items-center gap-3">
        <span className="text-3xl">{config.icon}</span>
        <div className="flex-1">
          <h3 className={`font-bold ${config.color}`}>{config.title}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {config.description}
          </p>
          {status === 'UPLOADING' && progress !== undefined && (
            <div className="mt-3">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-right">
                {Math.round(progress)}%
              </p>
            </div>
          )}
          {status === 'GENERATING' && (
            <div className="mt-3 flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

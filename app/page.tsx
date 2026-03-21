export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-4">HWPX Port</h1>
      <p className="text-lg text-gray-600">
        Gemini 기반 HWPX 시험지 복원 서비스
      </p>
      <div className="mt-8 p-4 bg-gray-100 rounded-lg">
        <h2 className="text-xl font-semibold mb-2">API 엔드포인트</h2>
        <code className="text-sm">POST /api/process</code>
        <p className="text-sm text-gray-500 mt-2">
          multipart/form-data 로 이미지/PDF 업로드 → HWPX 파일 다운로드
        </p>
      </div>
    </main>
  );
}

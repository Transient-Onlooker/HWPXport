/** @type {import('next').NextConfig} */
const nextConfig = {
  // HWPX 파일 다운로드를 위한 설정
  headers: async () => [
    {
      source: '/api/process',
      headers: [
        {
          key: 'Content-Disposition',
          value: 'attachment; filename="exam.hwpx"',
        },
      ],
    },
  ],
};

export default nextConfig;

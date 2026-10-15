import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  // 옛 주소(allsuricommerce.netlify.app)로 들어오면 대표 주소 allsuri.app 의 같은 화면으로 보냅니다.
  // /api 는 빼 둡니다 — 서버끼리 호출(문자 발송 등)이 옛 주소를 쓰고 있어도 끊기지 않게.
  // 308(영구 이동)이라 검색엔진도 새 주소로 옮겨 갑니다.
  async redirects() {
    return [
      {
        source: '/:path((?!api/).*)',
        has: [{ type: 'host', value: 'allsuricommerce.netlify.app' }],
        destination: 'https://allsuri.app/:path',
        permanent: true,
      },
    ]
  },
};

export default nextConfig;

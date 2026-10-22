import type { Metadata } from 'next'
import './globals.css'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { SITE_NAME, SITE_URL, absoluteUrl } from '@/lib/site'

export const metadata: Metadata = {
  // 페이지별 canonical·og:url 을 상대 경로로 쓸 수 있게 대표 도메인을 지정합니다.
  metadataBase: new URL(SITE_URL),
  // 네이버 서치어드바이저 권장: 설명은 80자 이내 한 문장
  title: '올수리 - 집수리·설비·청소 견적 비교 | 누수·하수구 막힘·보일러·입주청소',
  description: '누수·하수구 막힘·보일러 같은 집수리 설비부터 입주청소·에어컨 청소까지, 전문 업체 견적을 무료로 받아 비교하세요.',
  keywords: [
    '집수리', '집수리 견적', '설비', '설비 견적', '청소 견적', '견적 비교',
    '누수 탐지', '하수구 막힘', '변기 막힘', '싱크대 막힘', '배관 고압세척', '보일러 수리', '보일러 교체',
    '방수 공사', '화장실 수리', '입주청소', '이사청소', '에어컨 청소', '세탁기 청소',
    '욕실 곰팡이 제거', '줄눈 시공', '저수조 청소', '정화조 청소', '사무실 청소', '상가 청소',
  ],
  openGraph: {
    title: '올수리 - 집수리·설비·청소 견적 비교 | 누수·하수구 막힘·보일러·입주청소',
    description: '누수·하수구 막힘·보일러 같은 집수리 설비부터 입주청소·에어컨 청소까지, 전문 업체 견적을 무료로 받아 비교하세요.',
    url: absoluteUrl('/'),
    siteName: SITE_NAME,
    locale: 'ko_KR',
    type: 'website',
    images: [{ url: absoluteUrl('/app-icon.png'), width: 512, height: 512, alt: '올수리' }],
  },
  other: {
    'naver-site-verification': '3d6603043a98df369e669973ff157eeaffa91877',
    'google-adsense-account': 'ca-pub-8260409557475507',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <head>
        {/* AdSense 크롤러가 초기 HTML에서 바로 읽을 수 있도록 head에 직접 삽입 */}
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8260409557475507"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  )
}

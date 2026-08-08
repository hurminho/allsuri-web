import type { Metadata } from 'next'
import './globals.css'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: '올수리 - 집수리 전문 견적 서비스',
  description: '누수, 배관, 방수, 리모델링 등 집수리 전문가에게 무료로 견적을 받아보세요. 앱 설치 없이 바로 요청 가능합니다.',
  keywords: '집수리, 견적, 누수, 배관, 방수, 리모델링, 화장실, 주방',
  openGraph: {
    title: '올수리 - 집수리 전문 견적 서비스',
    description: '무료로 여러 업체의 견적을 비교하세요',
    url: 'https://allsuricommerce.netlify.app',
    siteName: '올수리',
    locale: 'ko_KR',
    type: 'website',
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

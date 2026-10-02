import type { Metadata } from 'next'
import Link from 'next/link'
import { absoluteUrl } from '@/lib/site'

export const metadata: Metadata = {
  title: '시공 후기 (준비 중) | 올수리',
  description: '전문 업체의 시공 사진과 후기를 모아볼 공간입니다. 현재 준비 중입니다.',
  alternates: { canonical: absoluteUrl('/community') },
  // 아직 내용이 없는 준비중 페이지입니다. 공개될 때 색인 설정을 다시 켜야 합니다.
  robots: { index: false, follow: true },
}

export default function CommunityPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-20">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">🛠️</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">시공 후기</h1>
        <p className="text-gray-500 leading-relaxed mb-8">
          전문 업체의 실제 시공 사진과 후기를 모아볼 수 있는 공간입니다.
          <br />
          곧 서비스될 예정입니다.
        </p>
        <Link
          href="/requests"
          className="inline-block bg-blue-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors"
        >
          무료 견적 요청하기 →
        </Link>
      </div>
    </div>
  )
}

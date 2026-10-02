import type { Metadata } from 'next'
import Link from 'next/link'
import { SERVICE_GUIDES } from '@/lib/service-guides'

export const metadata: Metadata = {
  title: '페이지를 찾을 수 없습니다 | 올수리',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-20">
      <div className="max-w-md text-center">
        <div className="text-5xl font-bold text-blue-600 mb-4">404</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">페이지를 찾을 수 없습니다</h1>
        <p className="text-gray-500 leading-relaxed mb-8">
          주소가 바뀌었거나 삭제된 페이지입니다. 아래에서 필요한 곳으로 이동해 주세요.
        </p>

        <div className="flex flex-col gap-2 mb-8">
          <Link
            href="/requests/ai"
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            무료 견적 요청하기
          </Link>
          <Link
            href="/my-order"
            className="bg-white border border-gray-300 hover:border-blue-400 text-gray-700 font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            내 견적 확인하기
          </Link>
        </div>

        <div className="text-sm text-gray-500">
          <span className="block mb-2 font-semibold text-gray-700">수리 안내</span>
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
            {SERVICE_GUIDES.map((guide) => (
              <Link
                key={guide.slug}
                href={`/services/${guide.slug}`}
                className="text-blue-600 hover:underline"
              >
                {guide.navLabel}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

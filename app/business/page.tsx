import type { Metadata } from 'next'
import Link from 'next/link'
import { countPublicBusinesses } from '@/lib/public-business'
import BusinessList from './BusinessList'
import { absoluteUrl } from '@/lib/site'

const title = '전문 사업자 찾기 | 올수리'
const description =
  '올수리에 등록된 집수리 전문 사업자를 지역과 분야로 찾아보세요. 누수·배관·방수·리모델링 업체를 확인할 수 있습니다.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: absoluteUrl('/business') },
  openGraph: { title, description, url: absoluteUrl('/business') },
}

export const revalidate = 60

export default async function BusinessPage() {
  const total = await countPublicBusinesses()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 py-8 px-4">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">전문 사업자 찾기</h1>
            <p className="text-gray-500 text-sm mt-1">
              올수리에 등록된 전문 업체{' '}
              <span className="font-semibold text-blue-600">{total.toLocaleString()}곳</span>
            </p>
          </div>
          <Link
            href="/requests"
            className="inline-block bg-blue-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            무료 견적 요청하기 →
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <BusinessList initialCount={total} />

        {/* CTA */}
        <div className="mt-12 bg-blue-600 rounded-2xl p-6 text-white text-center">
          <h3 className="font-bold text-lg mb-1">위 업체들에게 한 번에 견적 요청하기</h3>
          <p className="text-blue-100 text-sm mb-4">로그인 없이 3분이면 완료됩니다</p>
          <Link
            href="/requests"
            className="inline-block bg-white text-blue-600 font-semibold px-6 py-2.5 rounded-xl hover:bg-blue-50 transition-colors text-sm"
          >
            무료 견적 요청하기 →
          </Link>
        </div>
      </div>
    </div>
  )
}

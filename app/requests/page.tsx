import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import RequestForm from './RequestForm'
import { getFeaturedBusinesses } from '@/lib/public-business'
import { absoluteUrl } from '@/lib/site'

const title = '무료 견적 요청 | 올수리'
const description =
  '누수·배관·화장실·방수 등 집수리 견적을 앱 설치 없이 요청하세요. 작업이 가능한 전문 업체가 직접 견적서를 보내드립니다.'

export const metadata: Metadata = {
  title,
  description,
  // 카테고리·모드 쿼리 파라미터가 붙어도 한 URL 로 모이도록 고정합니다.
  alternates: { canonical: absoluteUrl('/requests') },
  openGraph: { title, description, url: absoluteUrl('/requests') },
}

export default async function RequestsPage() {
  const featured = await getFeaturedBusinesses()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Page Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">견적 요청</h1>
          <p className="text-gray-500 mt-2">AI로 한 줄만 알려주시거나, 직접 입력할 수 있습니다</p>
          <div className="grid sm:grid-cols-2 gap-3 mt-6 text-left">
            <Link href="/requests/ai" className="rounded-2xl border border-blue-200 bg-blue-50 p-4 hover:border-blue-400">
              <p className="font-bold text-blue-700">AI로 간편 요청하기</p>
              <p className="text-sm text-gray-600 mt-1">무슨 공사인지 몰라도 괜찮아요. 상황을 한 줄로 알려주세요.</p>
            </Link>
            <Link href="/requests?mode=manual" className="rounded-2xl border border-gray-200 bg-white p-4 hover:border-blue-400">
              <p className="font-bold text-gray-900">직접 입력하기</p>
              <p className="text-sm text-gray-600 mt-1">공종과 내용을 직접 작성해 요청합니다.</p>
            </Link>
          </div>
        </div>

        {/* 추천 업체 (관리자 지정 시 표시) */}
        {featured.length > 0 && (
          <div className="mb-8 bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-amber-50 to-yellow-50 px-5 py-3 border-b border-amber-100 flex items-center gap-2">
              <span className="text-yellow-500 text-lg">⭐</span>
              <span className="font-bold text-gray-800 text-sm">이번 달 우수 업체</span>
              <span className="ml-auto text-xs text-gray-400 bg-amber-100 px-2 py-0.5 rounded-full">광고</span>
            </div>
            <div className="divide-y divide-gray-50">
              {featured.map((biz, idx) => (
                <div key={biz.id} className="px-5 py-4 flex items-center gap-3">
                  {/* 순위 */}
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {idx + 1}
                  </div>
                  {/* 아바타 */}
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 font-bold overflow-hidden flex-shrink-0">
                    {biz.avatarUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={biz.avatarUrl} alt={biz.businessName} className="w-full h-full object-cover" />
                      : biz.businessName[0]}
                  </div>
                  {/* 업체 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 text-sm truncate">{biz.businessName}</span>
                      {biz.avgRating !== null && (
                        <span className="flex items-center gap-0.5 text-xs">
                          <span className="text-yellow-400">★</span>
                          <span className="font-semibold text-gray-700">{biz.avgRating.toFixed(1)}</span>
                          <span className="text-gray-400">({biz.reviewCount})</span>
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                      {biz.category}{biz.region ? ` · ${biz.region}` : ''}
                    </div>
                  </div>
                  {/* 연락처 */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {biz.phonenumber && (
                      <a href={`tel:${biz.phonenumber}`}
                        className="flex items-center gap-1 text-blue-600 font-semibold text-sm hover:text-blue-700">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        {biz.phonenumber}
                      </a>
                    )}
                    <Link href={`/business/${biz.userId}`}
                      className="text-xs text-gray-400 hover:text-blue-600 transition-colors">
                      프로필 보기 →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 견적 신청 폼 */}
        <Suspense fallback={<div className="text-center py-10 text-gray-400">로딩 중...</div>}>
          <RequestForm />
        </Suspense>
      </div>
    </div>
  )
}

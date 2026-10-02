import type { Metadata } from 'next'
import { Suspense } from 'react'
import MyOrderClient from './MyOrderClient'
import { absoluteUrl } from '@/lib/site'

export const metadata: Metadata = {
  title: '내 견적 현황 | 올수리',
  description: '견적 요청 시 입력한 전화번호와 비밀번호로 공사 진행 현황을 확인하세요.',
  alternates: { canonical: absoluteUrl('/my-order') },
  // 고객 본인만 조회하는 화면입니다. 검색 결과에 노출될 필요가 없습니다.
  robots: { index: false, follow: true },
}

export default function MyOrderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-xl mx-auto px-4 py-12">
            <h1 className="text-2xl font-bold text-gray-900">내 견적 현황 조회</h1>
            <p className="text-gray-500 mt-2">
              견적 요청 시 입력한 전화번호와 비밀번호로 진행 현황을 확인할 수 있습니다.
            </p>
          </div>
        </div>
      }
    >
      <MyOrderClient />
    </Suspense>
  )
}

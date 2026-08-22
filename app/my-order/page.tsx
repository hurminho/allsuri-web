import type { Metadata } from 'next'
import { Suspense } from 'react'
import MyOrderClient from './MyOrderClient'

export const metadata: Metadata = {
  title: '내 견적 현황 | 올수리',
  description: '견적 요청 시 입력한 전화번호와 비밀번호로 공사 진행 현황을 확인하세요.',
}

export default function MyOrderPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <MyOrderClient />
    </Suspense>
  )
}

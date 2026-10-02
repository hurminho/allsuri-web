import type { Metadata } from 'next'
import Link from 'next/link'
import AiInterview from './AiInterview'
import { absoluteUrl } from '@/lib/site'

const title = '한 줄 견적 요청 AI | 올수리'
const description =
  '무슨 공사인지 몰라도 한 줄로 알려주시면 AI가 필요한 질문만 드린 뒤 견적 요청서를 만들어 드립니다.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: absoluteUrl('/requests/ai') },
  openGraph: { title, description, url: absoluteUrl('/requests/ai') },
}

export default function AiRequestPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <p className="text-blue-600 font-semibold text-sm mb-2">한 줄 견적 요청 AI</p>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">무슨 공사인지 몰라도 괜찮아요</h1>
          <p className="text-gray-500 mt-2">상황을 한 줄로 알려주시면, 필요한 질문만 몇 개 드린 뒤 견적 요청서를 만들어 드립니다.</p>
        </div>
        <AiInterview />
        <p className="text-center text-sm text-gray-400 mt-6">
          <Link href="/requests?mode=manual" className="hover:text-blue-600">직접 입력하기</Link>
        </p>
      </div>
    </div>
  )
}

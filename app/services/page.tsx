import type { Metadata } from 'next'
import Link from 'next/link'
import { GUIDE_GROUPS, guideLinkLabel } from '@/lib/service-guides'
import { absoluteUrl } from '@/lib/site'

const title = '집수리·설비·청소 견적 안내 — 하수구 막힘·누수·보일러·입주청소·에어컨 청소 | 올수리'
const description =
  '하수구 막힘, 누수 탐지, 보일러, 방수 같은 집수리·설비부터 입주청소, 이사청소, 에어컨·세탁기 청소까지 견적 전에 확인할 내용을 정리했습니다.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: absoluteUrl('/services') },
  openGraph: {
    title,
    description,
    url: absoluteUrl('/services'),
  },
}

export default function ServicesIndexPage() {
  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <nav aria-label="현재 위치" className="text-sm text-gray-500 mb-5">
          <Link href="/" className="hover:text-blue-600">홈</Link>
          <span className="mx-1.5">›</span>
          <span className="text-gray-700">설비·청소 안내</span>
        </nav>

        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
          집수리·설비·청소 견적 안내
        </h1>
        <p className="text-gray-600 leading-relaxed mb-8">
          어떤 작업이 필요한지 확실하지 않을 때 증상부터 확인해 보세요. 각 안내에는 위치별 증상,
          지금 사진으로 남겨 둘 것, 사업자가 견적을 내려면 필요한 정보, 금액이 달라지는 조건을
          정리했습니다.
        </p>

        {GUIDE_GROUPS.map((group) => (
          <section key={group.kind} className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 mb-3">{group.title}</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {group.guides.map((guide) => (
                <Link
                  key={guide.slug}
                  href={`/services/${guide.slug}`}
                  className="bg-white border border-gray-200 hover:border-blue-400 hover:shadow-sm rounded-2xl p-5 transition-all"
                >
                  <h3 className="font-bold text-gray-900 mb-1.5">{guideLinkLabel(guide)}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{guide.description}</p>
                  <span className="inline-block text-sm text-blue-600 font-semibold mt-3">자세히 보기 →</span>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center">
          <h2 className="font-bold text-gray-900 mb-2">어떤 공사인지 모르겠다면</h2>
          <p className="text-gray-500 text-sm mb-5">
            상황을 한 줄로 알려 주시면 필요한 질문만 드린 뒤 견적 요청서를 만들어 드립니다.
          </p>
          <Link
            href="/requests/ai"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            한 줄 견적 요청 AI →
          </Link>
        </div>
      </div>
    </div>
  )
}

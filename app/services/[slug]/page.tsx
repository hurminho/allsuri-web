import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SERVICE_GUIDES, getServiceGuide } from '@/lib/service-guides'
import { absoluteUrl, SITE_NAME } from '@/lib/site'

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return SERVICE_GUIDES.map((guide) => ({ slug: guide.slug }))
}

export const dynamicParams = false

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const guide = getServiceGuide(slug)
  if (!guide) return { title: '페이지를 찾을 수 없습니다 | 올수리' }

  const url = absoluteUrl(`/services/${guide.slug}`)
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: url },
    openGraph: {
      title: guide.title,
      description: guide.description,
      url,
      type: 'article',
    },
  }
}

export default async function ServiceGuidePage({ params }: Props) {
  const { slug } = await params
  const guide = getServiceGuide(slug)
  if (!guide) notFound()

  const url = absoluteUrl(`/services/${guide.slug}`)
  const requestHref = `/requests?category=${encodeURIComponent(guide.category)}`

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: `${guide.navLabel} 수리 견적 매칭`,
      serviceType: guide.navLabel,
      description: guide.description,
      url,
      areaServed: { '@type': 'Country', name: '대한민국' },
      provider: {
        '@type': 'Organization',
        name: SITE_NAME,
        url: absoluteUrl('/'),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '홈', item: absoluteUrl('/') },
        { '@type': 'ListItem', position: 2, name: '수리 안내', item: absoluteUrl('/services') },
        { '@type': 'ListItem', position: 3, name: guide.navLabel, item: url },
      ],
    },
  ]

  const others = SERVICE_GUIDES.filter((g) => g.slug !== guide.slug)

  return (
    <div className="bg-gray-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="max-w-3xl mx-auto px-4 py-10">
        <nav aria-label="현재 위치" className="text-sm text-gray-500 mb-5">
          <Link href="/" className="hover:text-blue-600">홈</Link>
          <span className="mx-1.5">›</span>
          <Link href="/services" className="hover:text-blue-600">수리 안내</Link>
          <span className="mx-1.5">›</span>
          <span className="text-gray-700">{guide.navLabel}</span>
        </nav>

        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-snug mb-4">
          {guide.h1}
        </h1>
        <p className="text-gray-600 leading-relaxed mb-8">{guide.intro}</p>

        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mb-10">
          <p className="text-sm text-blue-900 leading-relaxed mb-3">
            증상과 사진을 올려 주시면 {guide.navLabel} 작업이 가능한 사업자가 직접 견적을 보내드립니다.
            요청은 무료이고, 앱 설치나 회원가입은 필요하지 않습니다.
          </p>
          <Link
            href={requestHref}
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            {guide.navLabel} 견적 요청하기 →
          </Link>
        </div>

        {guide.sections.map((section) => (
          <section key={section.heading} className="mb-10">
            <h2 className="text-xl font-bold text-gray-900 mb-3">{section.heading}</h2>
            {section.body && (
              <p className="text-gray-600 leading-relaxed mb-3">{section.body}</p>
            )}
            {section.bullets && (
              <ul className="space-y-2">
                {section.bullets.map((item) => (
                  <li key={item} className="flex gap-2 text-gray-600 leading-relaxed">
                    <span className="text-blue-500 shrink-0">·</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section className="mb-10">
          <h2 className="text-xl font-bold text-gray-900 mb-3">사업자가 견적을 내려면 필요한 정보</h2>
          <p className="text-gray-600 leading-relaxed mb-3">
            아래 내용이 함께 있으면 사업자가 추가 문의 없이 견적을 보낼 수 있습니다.
          </p>
          <ul className="space-y-2">
            {guide.needForQuote.map((item) => (
              <li key={item} className="flex gap-2 text-gray-600 leading-relaxed">
                <span className="text-blue-500 shrink-0">·</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-gray-900 mb-3">금액이 달라지는 조건</h2>
          <p className="text-gray-600 leading-relaxed mb-3">
            올수리는 금액을 대신 정하지 않습니다. 아래 조건에 따라 사업자마다 다른 견적을 보내므로,
            받은 견적서를 비교해 보시는 것이 좋습니다.
          </p>
          <ul className="space-y-2">
            {guide.priceFactors.map((item) => (
              <li key={item} className="flex gap-2 text-gray-600 leading-relaxed">
                <span className="text-blue-500 shrink-0">·</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-gray-500 text-sm leading-relaxed mt-4">
            현장을 보기 전에 금액을 확정하기 어려운 이유도 여기에 있습니다. 같은 증상이라도 원인과
            접근 방법이 다르면 작업 범위가 바뀌기 때문에, 방문 전 금액은 대부분 예상 범위로만
            안내됩니다.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-gray-900 mb-3">올수리에서 요청하는 방법</h2>
          <ol className="space-y-3">
            <li className="flex gap-3 text-gray-600 leading-relaxed">
              <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</span>
              <span>
                <Link href="/requests/ai" className="text-blue-600 font-semibold hover:underline">한 줄 견적 요청 AI</Link>
                에 상황을 한 줄로 적으면 필요한 질문만 추가로 받아 요청서를 만들어 드립니다.
                항목을 직접 채우고 싶으시면{' '}
                <Link href={requestHref} className="text-blue-600 font-semibold hover:underline">견적 요청 폼</Link>
                을 쓰시면 됩니다.
              </span>
            </li>
            <li className="flex gap-3 text-gray-600 leading-relaxed">
              <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</span>
              <span>증상 사진을 함께 올려 주세요. 전체가 보이는 사진과 문제 부위를 가까이 찍은 사진을 같이 올리면 좋습니다.</span>
            </li>
            <li className="flex gap-3 text-gray-600 leading-relaxed">
              <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">3</span>
              <span>연락 받을 전화번호와 비밀번호를 정하면 요청이 접수됩니다.</span>
            </li>
            <li className="flex gap-3 text-gray-600 leading-relaxed">
              <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">4</span>
              <span>
                도착한 견적은{' '}
                <Link href="/my-order" className="text-blue-600 font-semibold hover:underline">내 견적</Link>
                에서 전화번호와 비밀번호로 확인하고 비교할 수 있습니다.
              </span>
            </li>
          </ol>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-gray-900 mb-4">자주 묻는 질문</h2>
          <div className="space-y-4">
            {guide.faqs.map((faq) => (
              <div key={faq.question} className="bg-white border border-gray-200 rounded-2xl p-5">
                <h3 className="font-bold text-gray-900 mb-2">{faq.question}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-gray-900 mb-4">다른 수리 안내</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {others.map((other) => (
              <Link
                key={other.slug}
                href={`/services/${other.slug}`}
                className="bg-white border border-gray-200 hover:border-blue-400 rounded-xl p-4 transition-colors"
              >
                <div className="font-semibold text-gray-900 text-sm mb-1">{other.navLabel} 수리 안내</div>
                <div className="text-xs text-gray-500 leading-relaxed">{other.h1}</div>
              </Link>
            ))}
          </div>
        </section>

        <div className="bg-gray-900 text-white rounded-2xl p-6 text-center">
          <h2 className="text-lg font-bold mb-2">{guide.navLabel} 견적을 받아보세요</h2>
          <p className="text-gray-400 text-sm mb-5">요청은 무료입니다. 앱 설치와 회원가입이 필요하지 않습니다.</p>
          <Link
            href={requestHref}
            className="inline-block bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold px-7 py-3 rounded-xl transition-colors"
          >
            무료 견적 요청하기 →
          </Link>
        </div>
      </article>
    </div>
  )
}

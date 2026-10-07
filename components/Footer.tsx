import Link from 'next/link'
import Image from 'next/image'
import { SERVICE_GUIDES } from '@/lib/service-guides'
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/site'

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300 mt-16">
      <div className="max-w-5xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Image src="/app-icon.png" alt="올수리" width={32} height={32} className="rounded-lg" />
            <span className="text-white font-bold text-lg">올수리</span>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed">
            집수리 전문가와 고객을 연결하는<br />
            견적 매칭 플랫폼
          </p>
        </div>
        <div>
          <h3 className="text-white font-semibold mb-3">서비스</h3>
          <ul className="space-y-2 text-sm">
            <li><Link href="/requests" className="hover:text-white transition-colors">견적 요청</Link></li>
            <li><Link href="/my-order" className="hover:text-white transition-colors">내 견적</Link></li>
            <li><Link href="/business" className="hover:text-white transition-colors">전문 사업자 찾기</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-white font-semibold mb-3">수리 안내</h3>
          <ul className="space-y-2 text-sm">
            {SERVICE_GUIDES.map((guide) => (
              <li key={guide.slug}>
                <Link href={`/services/${guide.slug}`} className="hover:text-white transition-colors">
                  {guide.navLabel} 수리 안내
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-white font-semibold mb-3">앱 다운로드</h3>
          <p className="text-sm text-gray-400 mb-3">사업자라면 앱으로 더 편리하게</p>
          <div className="flex flex-col gap-2">
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded-lg text-center transition-colors"
            >
              App Store
            </a>
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded-lg text-center transition-colors"
            >
              Google Play
            </a>
          </div>
        </div>
      </div>
      <div className="border-t border-gray-800 py-4 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} 올수리. All rights reserved.
      </div>
    </footer>
  )
}

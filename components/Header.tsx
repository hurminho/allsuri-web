'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1.5">
          <Image src="/app-icon.png" alt="올수리" width={36} height={36} className="rounded-xl" />
          <span className="text-xl font-bold text-blue-600">올수리</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
          <Link href="/services" className="hover:text-blue-600 transition-colors">수리 안내</Link>
          <Link href="/requests" className="hover:text-blue-600 transition-colors">견적 요청</Link>
          <Link href="/my-order" className="hover:text-blue-600 transition-colors font-semibold">내 견적</Link>
          <Link
            href="/requests/ai"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            한 줄 견적 요청 AI
          </Link>
        </nav>

        {/* Mobile menu button */}
        <button
          className="md:hidden p-2 text-gray-500 hover:text-gray-700"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="메뉴 열기"
        >
          {menuOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 flex flex-col gap-3 text-sm font-medium text-gray-700">
          <Link href="/services" className="py-2 hover:text-blue-600" onClick={() => setMenuOpen(false)}>수리 안내</Link>
          <Link href="/requests" className="py-2 hover:text-blue-600" onClick={() => setMenuOpen(false)}>견적 요청</Link>
          <Link href="/my-order" className="py-2 text-blue-600 font-semibold hover:text-blue-700" onClick={() => setMenuOpen(false)}>내 견적</Link>
          <Link
            href="/requests/ai"
            className="bg-blue-600 text-white text-center py-2 rounded-lg hover:bg-blue-700"
            onClick={() => setMenuOpen(false)}
          >
            한 줄 견적 요청 AI
          </Link>
        </div>
      )}
    </header>
  )
}

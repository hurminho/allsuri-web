import type { Metadata } from 'next'
import ConsentClient from './ConsentClient'
import { absoluteUrl } from '@/lib/site'

export const metadata: Metadata = {
  title: '소식·혜택 받기 | 올수리',
  description: '올수리 새 기능·이벤트·혜택 소식 수신 동의와 철회.',
  alternates: { canonical: absoluteUrl('/consent') },
  // 회원 본인만 쓰는 화면입니다.
  robots: { index: false, follow: false },
}

export default function ConsentPage() {
  return <ConsentClient />
}

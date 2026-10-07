import { NextResponse } from 'next/server'
import { listPublicBusinesses } from '@/lib/public-business'

// 공개 사업자 목록 (사업자 찾기 페이지의 '더 보기'). 공개 컬럼만 내려줍니다.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const page = Math.max(0, Number.parseInt(searchParams.get('page') || '0', 10) || 0)
  const size = Math.min(50, Math.max(1, Number.parseInt(searchParams.get('size') || '20', 10) || 20))
  const result = await listPublicBusinesses(page, size)
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  })
}

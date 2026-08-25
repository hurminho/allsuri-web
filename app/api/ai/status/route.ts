import { NextResponse } from 'next/server'
import { openaiConfig } from '@/lib/openai-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 키 값·접두사는 반환하지 않는다. 설정 여부만 확인용. */
export async function GET() {
  const { configured, model } = openaiConfig()
  return NextResponse.json({
    configured,
    model,
    endpoint: '/api/ai/order-interview',
  })
}

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  customerOrderUrl,
  sendSms,
  smsBidAwarded,
  smsBidReceived,
  smsWorkDoneReview,
} from '@/lib/solapi-sms'

export const runtime = 'nodejs'

function authorized(req: NextRequest): boolean {
  const expected = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!expected) return false
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return false
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/**
 * 앱(api.allsuri.app)에서 입찰 문자를 위임받기 위한 내부 API.
 * Solapi 키가 웹 Netlify에만 있는 경우를 커버합니다.
 */
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const type = String(body?.type || '')
    const to = String(body?.to || '')
    if (!to) {
      return NextResponse.json({ ok: false, error: 'to required' }, { status: 400 })
    }

    let text = ''
    if (type === 'bid_received') {
      text = smsBidReceived({
        orderTitle: String(body.orderTitle || '견적 요청'),
        businessName: String(body.businessName || '사업자'),
        priceLabel: String(body.priceLabel || '협의'),
        ratingLabel: String(body.ratingLabel || '아직 없음'),
        link: customerOrderUrl(to),
      })
    } else if (type === 'awarded') {
      text = smsBidAwarded({
        orderTitle: String(body.orderTitle || '견적 요청'),
        businessName: String(body.businessName || '사업자'),
        phoneLabel: String(body.phoneLabel || '웹에서 확인'),
        link: customerOrderUrl(to),
      })
    } else if (type === 'work_done') {
      text = smsWorkDoneReview({
        orderTitle: String(body.orderTitle || '견적 요청'),
        link: customerOrderUrl(to),
      })
    } else {
      return NextResponse.json({ ok: false, error: 'unknown type' }, { status: 400 })
    }

    const result = await sendSms(to, text)
    return NextResponse.json(result, { status: result.ok ? 200 : 502 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[internal/sms]', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

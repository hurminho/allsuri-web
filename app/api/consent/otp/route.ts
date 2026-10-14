import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { sendSms } from '@/lib/solapi-sms'
import { userIdsByPhone } from '@/lib/consent-users'
import { OTP_TTL_MS, clientIp, hashCode, hashPhone, newOtpCode, normalizeKoreanMobile } from '@/lib/marketing-consent'

// 동의 페이지 본인 확인용 인증번호 발송.
// 가입 여부를 알려 주지 않도록, 회원이 아닌 번호에도 같은 응답을 줍니다(문자는 회원 번호에만 보냄).
const SENT_MESSAGE = '가입된 번호라면 인증번호를 보냈어요. 5분 안에 입력해 주세요.'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { phone?: string }
  const digits = normalizeKoreanMobile(body.phone)
  if (!digits) return NextResponse.json({ error: '휴대폰 번호를 확인해 주세요.' }, { status: 400 })

  const phoneHash = hashPhone(digits)
  const ip = clientIp(req.headers)
  const now = Date.now()

  // 남용 막기: 번호당 1분에 1번·하루 5번, 접속 주소당 1시간에 20번
  const [{ count: lastMinute }, { count: lastDay }, { count: ipHour }] = await Promise.all([
    supabaseAdmin.from('phone_otps').select('id', { count: 'exact', head: true })
      .eq('phone_hash', phoneHash).gte('created_at', new Date(now - 60_000).toISOString()),
    supabaseAdmin.from('phone_otps').select('id', { count: 'exact', head: true })
      .eq('phone_hash', phoneHash).gte('created_at', new Date(now - 86_400_000).toISOString()),
    supabaseAdmin.from('phone_otps').select('id', { count: 'exact', head: true })
      .eq('ip', ip).gte('created_at', new Date(now - 3_600_000).toISOString()),
  ])
  if ((lastMinute ?? 0) > 0) return NextResponse.json({ error: '1분 뒤에 다시 받아 주세요.' }, { status: 429 })
  if ((lastDay ?? 0) >= 5 || (ipHour ?? 0) >= 20) {
    return NextResponse.json({ error: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.' }, { status: 429 })
  }

  const id = crypto.randomUUID()
  const code = newOtpCode()
  const { error } = await supabaseAdmin.from('phone_otps').insert({
    id,
    phone_hash: phoneHash,
    code_hash: hashCode(id, code),
    purpose: 'marketing_consent',
    ip,
    expires_at: new Date(now + OTP_TTL_MS).toISOString(),
  })
  if (error) {
    console.error('[consent/otp] 저장 실패:', error.message)
    return NextResponse.json({ error: '잠시 후 다시 시도해 주세요.' }, { status: 500 })
  }

  const userIds = await userIdsByPhone(digits)
  if (userIds.length > 0) {
    const sent = await sendSms(digits, `[올수리] 인증번호 ${code}\n5분 안에 입력해 주세요.`)
    if (!sent.ok && sent.skipped && process.env.NODE_ENV !== 'production') {
      // 로컬 개발: 문자 설정이 없으면 서버 로그로 확인합니다.
      console.info(`[consent/otp] (개발) 인증번호 ${code}`)
    } else if (!sent.ok) {
      console.warn('[consent/otp] 문자 발송 실패:', sent.error)
      return NextResponse.json({ error: '문자를 보내지 못했어요. 잠시 후 다시 시도해 주세요.' }, { status: 502 })
    }
  }

  return NextResponse.json({ ok: true, message: SENT_MESSAGE })
}

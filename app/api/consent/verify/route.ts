import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { userIdsByPhone } from '@/lib/consent-users'
import { OTP_MAX_ATTEMPTS, OTP_TTL_MS, hashCode, hashPhone, normalizeKoreanMobile } from '@/lib/marketing-consent'

// 인증번호 확인 후 동의 상태 저장. 동의 일자·이력·처리 결과 안내는 DB 트리거가 합니다.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    phone?: string
    code?: string
    consent?: boolean
    night?: boolean
  }
  const digits = normalizeKoreanMobile(body.phone)
  const code = String(body.code ?? '').replace(/[^0-9]/g, '')
  if (!digits || code.length !== 6) {
    return NextResponse.json({ error: '휴대폰 번호와 인증번호 6자리를 확인해 주세요.' }, { status: 400 })
  }
  if (typeof body.consent !== 'boolean') {
    return NextResponse.json({ error: '받을지 여부를 골라 주세요.' }, { status: 400 })
  }

  const { data: otp } = await supabaseAdmin
    .from('phone_otps')
    .select('id, code_hash, attempts, expires_at')
    .eq('phone_hash', hashPhone(digits))
    .eq('purpose', 'marketing_consent')
    .is('consumed_at', null)
    .gte('created_at', new Date(Date.now() - OTP_TTL_MS).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!otp || new Date(otp.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: '인증번호가 만료됐어요. 다시 받아 주세요.' }, { status: 400 })
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    return NextResponse.json({ error: '여러 번 틀렸어요. 인증번호를 다시 받아 주세요.' }, { status: 429 })
  }
  if (hashCode(otp.id, code) !== otp.code_hash) {
    await supabaseAdmin.from('phone_otps').update({ attempts: otp.attempts + 1 }).eq('id', otp.id)
    const left = OTP_MAX_ATTEMPTS - otp.attempts - 1
    return NextResponse.json({ error: `인증번호가 맞지 않아요. (남은 횟수 ${left}번)` }, { status: 400 })
  }
  await supabaseAdmin.from('phone_otps').update({ consumed_at: new Date().toISOString() }).eq('id', otp.id)

  const userIds = await userIdsByPhone(digits)
  if (userIds.length === 0) {
    return NextResponse.json({ error: '올수리에 등록된 번호가 아니에요. 앱에 등록한 번호로 다시 시도해 주세요.' }, { status: 404 })
  }

  const consent = body.consent
  const { error } = await supabaseAdmin
    .from('users')
    .update({
      marketing_consent: consent,
      marketing_night_consent: consent && body.night === true,
      marketing_consent_channel: 'web',
      marketing_consent_asked_at: new Date().toISOString(),
    })
    .in('id', userIds)
  if (error) {
    console.error('[consent/verify] 저장 실패:', error.message)
    return NextResponse.json({ error: '저장하지 못했어요. 잠시 후 다시 시도해 주세요.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, consent, night: consent && body.night === true })
}

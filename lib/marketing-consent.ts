import crypto from 'crypto'

/**
 * 광고성 정보 수신 동의 (웹 동의 페이지 /consent).
 *
 * 앱 사업자 회원은 웹 로그인이 없어서, 전화번호 인증번호로 본인을 확인한 뒤 동의 상태를 바꿉니다.
 * 동의 일자 기록·이력·처리 결과 안내는 DB 트리거가 합니다(database/marketing_consent_2026_10.sql).
 * 안내 문구는 lib/marketing-consent-notice.ts (브라우저에서도 씀).
 */
export const OTP_TTL_MS = 5 * 60 * 1000
export const OTP_MAX_ATTEMPTS = 5

export function normalizeKoreanMobile(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/[^0-9]/g, '')
  return /^01[016789][0-9]{7,8}$/.test(digits) ? digits : null
}

function pepper(): string {
  return process.env.CONSENT_OTP_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

/** 전화번호 원문 대신 저장하는 값 */
export function hashPhone(digits: string): string {
  return crypto.createHmac('sha256', pepper()).update(`phone:${digits}`).digest('hex')
}

export function hashCode(otpId: string, code: string): string {
  return crypto.createHmac('sha256', pepper()).update(`otp:${otpId}:${code}`).digest('hex')
}

export function newOtpCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

export function clientIp(headers: Headers): string {
  return (
    headers.get('x-nf-client-connection-ip') ||
    (headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  )
}

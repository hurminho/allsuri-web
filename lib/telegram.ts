import { absoluteUrl } from './site'
import { formatPhoneDisplay } from './solapi-sms'

const SEND_TIMEOUT_MS = 5000

function runtimeEnv(name: string): string {
  return String((process.env as Record<string, string | undefined>)[name] || '').trim()
}

export type TelegramSendResult = {
  ok: boolean
  skipped?: boolean
  error?: string
}

/** 운영자 개인 텔레그램으로 메시지를 보냅니다. 설정이 없으면 스킵. 실패해도 예외를 던지지 않습니다. */
export async function sendTelegram(text: string): Promise<TelegramSendResult> {
  const token = runtimeEnv('TELEGRAM_BOT_TOKEN')
  const chatId = runtimeEnv('TELEGRAM_CHAT_ID')
  if (!token || !chatId) {
    const missing = [!token && 'TELEGRAM_BOT_TOKEN', !chatId && 'TELEGRAM_CHAT_ID'].filter(Boolean)
    console.warn(`[telegram] 미설정(${missing.join(',')}) - 발송 스킵`)
    return { ok: false, skipped: true, error: `missing ${missing.join(',')}` }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS)
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: controller.signal,
    })
    const result = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = JSON.stringify(result)
      console.warn('[telegram] 발송 실패:', err)
      return { ok: false, error: err }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[telegram] 발송 오류 (무시):', msg)
    return { ok: false, error: msg }
  } finally {
    clearTimeout(timer)
  }
}

function clip(s: string, max: number): string {
  const t = (s || '').trim()
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

// 견적 폼(app/requests/RequestForm.tsx)의 선택지와 같은 값
const URGENCY_LABEL: Record<string, string> = { emergency: '지금 당장(긴급)', today: '오늘 안에', soon: '2~3일 안', normal: '급하지 않아요' }
const PROPERTY_LABEL: Record<string, string> = {
  apartment: '아파트', villa: '빌라·다세대', house: '단독주택', officetel: '오피스텔',
  commercial: '상가·매장', office: '사무실', other: '그 외',
}

/**
 * 새 웹 견적 요청 알림. 앱 오더 등록을 멈춘 동안(WEB_ORDERS_TO_APP=false)은 이 메시지가 유일한 전달 경로라
 * 고객이 쓴 내용을 빠짐없이 담습니다. 텔레그램 한 메시지 한도(4096자) 안에 들도록 길이를 자릅니다.
 */
export function telegramNewWebOrder(opts: {
  orderId: string
  title: string
  category: string
  subcategory?: string | null
  address: string
  visitDate: string
  customerName: string
  customerPhone: string
  customerEmail?: string | null
  description?: string
  urgency?: string | null
  propertyType?: string | null
  aiSummary?: string | null
  estimatedMin?: number | null
  estimatedMax?: number | null
  imageUrls?: string[] | null
  imageCount?: number
  appListed?: boolean
}): string {
  const category = opts.subcategory ? `${opts.category} · ${opts.subcategory}` : opts.category
  const lines = [
    opts.appListed === false ? '🔔 새 견적 요청 (올수리 웹 · 앱 미등록)' : '🔔 새 견적 요청 (올수리 웹)',
    '',
    `[${category}] ${clip(opts.title, 80)}`,
    `📍 ${clip(opts.address, 120)}`,
    `📅 방문 희망: ${opts.visitDate}`,
    `👤 ${clip(opts.customerName, 20)} / ${formatPhoneDisplay(opts.customerPhone)}`,
  ]
  if (opts.customerEmail) lines.push(`✉️ ${clip(opts.customerEmail, 60)}`)
  const extra = [
    opts.urgency ? `급한 정도: ${URGENCY_LABEL[opts.urgency] ?? opts.urgency}` : '',
    opts.propertyType ? `건물: ${PROPERTY_LABEL[opts.propertyType] ?? clip(opts.propertyType, 20)}` : '',
  ].filter(Boolean)
  if (extra.length) lines.push(`⏱ ${extra.join(' · ')}`)
  if (opts.estimatedMin && opts.estimatedMax) {
    lines.push(`💰 예상 비용: ${opts.estimatedMin.toLocaleString('ko-KR')}~${opts.estimatedMax.toLocaleString('ko-KR')}원`)
  }
  if (opts.description) lines.push('', '📝 요청 내용', clip(opts.description, 1500))
  if (opts.aiSummary) lines.push('', '🤖 AI 요약', clip(opts.aiSummary, 400))
  const images = (opts.imageUrls ?? []).filter(Boolean)
  if (images.length) {
    lines.push('', `🖼 사진 ${images.length}장`, ...images.slice(0, 10).map((u, i) => `${i + 1}. ${u}`))
    if (images.length > 10) lines.push(`… 외 ${images.length - 10}장`)
  } else if (opts.imageCount) {
    lines.push(`🖼 사진 ${opts.imageCount}장`)
  }
  lines.push('', absoluteUrl('/admin/orders'), `주문 ID: ${opts.orderId}`)
  return clip(lines.join('\n'), 4000)
}

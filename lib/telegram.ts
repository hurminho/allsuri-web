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

export function telegramNewWebOrder(opts: {
  orderId: string
  title: string
  category: string
  address: string
  visitDate: string
  customerName: string
  customerPhone: string
  description?: string
  imageCount?: number
}): string {
  const lines = [
    '🔔 새 견적 요청 (올수리 웹)',
    '',
    `[${opts.category}] ${clip(opts.title, 60)}`,
    `📍 ${clip(opts.address, 80)}`,
    `📅 방문 희망: ${opts.visitDate}`,
    `👤 ${clip(opts.customerName, 20)} / ${formatPhoneDisplay(opts.customerPhone)}`,
  ]
  if (opts.description) lines.push('', clip(opts.description, 300))
  if (opts.imageCount) lines.push(`🖼 사진 ${opts.imageCount}장`)
  lines.push('', absoluteUrl('/admin/orders'), `주문 ID: ${opts.orderId}`)
  return lines.join('\n')
}

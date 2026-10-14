'use client'

import { useState } from 'react'
import { CONSENT_NOTICE } from '@/lib/marketing-consent-notice'

function formatPhone(raw: string): string {
  const d = raw.replace(/[^0-9]/g, '').slice(0, 11)
  if (d.length < 4) return d
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`
}

type Done = { consent: boolean; night: boolean }

export default function ConsentClient() {
  const [consent, setConsent] = useState<boolean | null>(null)
  const [night, setNight] = useState(false)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState<Done | null>(null)

  async function requestCode() {
    setError(''); setInfo(''); setLoading(true)
    try {
      const res = await fetch('/api/consent/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '인증번호를 보내지 못했어요.')
      setCodeSent(true)
      setInfo(data.message || '인증번호를 보냈어요.')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
  }

  async function save() {
    if (consent === null) { setError('받을지 여부를 먼저 골라 주세요.'); return }
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/consent/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, consent, night: consent && night }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '저장하지 못했어요.')
      setDone({ consent: data.consent, night: data.night })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-xl mx-auto px-4 py-12">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
            <p className="text-4xl mb-3">{done.consent ? '🔔' : '🔕'}</p>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              {done.consent ? '소식·혜택 받기에 동의하셨어요' : '소식·혜택 받기를 그만두셨어요'}
            </h1>
            <p className="text-sm text-gray-600 leading-relaxed">
              {done.consent
                ? `야간(21~08시) 수신: ${done.night ? '동의' : '동의 안 함'}`
                : '앞으로 광고성 문자·푸시를 보내지 않습니다.'}
              <br />처리 결과는 올수리 앱 알림으로도 보내 드려요.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const phoneDigits = phone.replace(/[^0-9]/g, '')

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-4 py-8 pb-20">
        <h1 className="text-2xl font-bold text-gray-900">올수리 소식·혜택 받기</h1>
        <p className="text-sm text-gray-500 mt-1">올수리 사업자 회원 전용 · 언제든 바꿀 수 있어요</p>

        {/* 안내 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mt-5 text-sm text-gray-700 space-y-1.5">
          <p className="font-semibold text-gray-900 mb-2">광고성 정보 수신 동의 (선택)</p>
          <p><span className="text-gray-500">보내는 곳</span> · {CONSENT_NOTICE.sender}</p>
          <p><span className="text-gray-500">내용</span> · {CONSENT_NOTICE.purpose}</p>
          <p><span className="text-gray-500">받는 방법</span> · {CONSENT_NOTICE.channels}</p>
          <p><span className="text-gray-500">이용 정보</span> · {CONSENT_NOTICE.items}</p>
          <p><span className="text-gray-500">보관 기간</span> · {CONSENT_NOTICE.retention}</p>
          <p className="text-gray-500 pt-1">{CONSENT_NOTICE.refusal}</p>
        </div>

        {/* 선택 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mt-4 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="radio" name="consent" className="w-5 h-5" checked={consent === true} onChange={() => setConsent(true)} />
            <span className="font-semibold text-gray-900">받을게요</span>
          </label>
          {consent === true && (
            <label className="flex items-center gap-3 cursor-pointer pl-8 text-sm text-gray-700">
              <input type="checkbox" className="w-4 h-4" checked={night} onChange={(e) => setNight(e.target.checked)} />
              밤 9시~아침 8시에도 받기 (선택)
            </label>
          )}
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="radio" name="consent" className="w-5 h-5" checked={consent === false} onChange={() => setConsent(false)} />
            <span className="font-semibold text-gray-900">안 받을게요 (동의 철회)</span>
          </label>
        </div>

        {/* 본인 확인 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mt-4 space-y-3">
          <p className="font-semibold text-gray-900">본인 확인</p>
          <p className="text-xs text-gray-500">올수리 앱에 등록한 휴대폰 번호로 인증번호를 보내 드려요.</p>
          <div className="flex gap-2">
            <input
              type="tel" inputMode="numeric" autoComplete="tel" placeholder="010-0000-0000"
              value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))}
              className="flex-1 min-w-0 border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={requestCode} disabled={loading || phoneDigits.length < 10}
              className="shrink-0 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-300 text-white text-sm font-semibold px-4 rounded-xl"
            >
              {codeSent ? '다시 받기' : '인증번호 받기'}
            </button>
          </div>
          {codeSent && (
            <input
              type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="인증번호 6자리" maxLength={6}
              value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
          {info && <p className="text-xs text-blue-700">{info}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <button
          onClick={save} disabled={loading || consent === null || code.length !== 6}
          className="w-full mt-5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-3.5 rounded-2xl font-bold transition-colors"
        >
          저장하기
        </button>
      </div>
    </div>
  )
}

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { splitAddressRegion } from '@/lib/address-region'

// 고객 견적 폼 제출:
// 1. orders 테이블에 저장 (B2C 고객 레코드)
// 2. marketplace_listings 테이블에도 저장 (B2B와 동일한 앱 오더 목록)
// 3. 알림 전송:
//    - DB 알림: 전체 사업자에게 단일 INSERT (빠름)
//    - FCM 푸시: fcm_token 보유 사용자에게만 전송 (적은 수 → 빠름)
//    → 응답 반환 전에 동기적으로 실행 (fire-and-forget 안 씀)
//    → FCM은 8초 타임아웃으로 timeout 보호

const ALLSURIAPP_API_URL = process.env.ALLSURIAPP_API_URL || 'https://api.allsuri.app'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

type UserRow = { id: string }

async function sendWebOrderNotifications(
  listingId: string, title: string, category: string, address: string
) {
  const regionShort = address.split(' ').slice(0, 2).join(' ')
  const notifTitle = '새 고객 오더 등록'
  const notifBody = `[${category}] ${title} · ${regionShort}`
  const now = new Date().toISOString()

  // 전체 사용자 & FCM 토큰 보유 사용자를 병렬 조회
  const [allRes, fcmRes] = await Promise.all([
    supabaseAdmin.from('users').select('id').limit(500),
    supabaseAdmin.from('users').select('id').not('fcm_token', 'is', null).limit(300),
  ])

  const allIds = (allRes.data || []).map((u: UserRow) => u.id)
  const fcmIds = (fcmRes.data || []).map((u: UserRow) => u.id)

  console.log(`[submit] 전체 사용자: ${allIds.length}명, FCM 토큰 보유: ${fcmIds.length}명`)

  // ① DB 알림: 전체 사용자 일괄 INSERT (단 1회 요청, 매우 빠름)
  if (allIds.length > 0) {
    const { error } = await supabaseAdmin.from('notifications').insert(
      allIds.map(uid => ({
        userid: uid, title: notifTitle, body: notifBody,
        type: 'new_web_order', isread: false, createdat: now,
      }))
    )
    if (error) console.warn('[submit] DB 알림 저장 실패:', error.message)
    else console.log(`[submit] ✅ DB 알림 ${allIds.length}명 저장 완료`)
  }

  // ② FCM 푸시: fcm_token 보유 사용자에게만 전송 (skipDbInsert=true → 중복 DB 저장 방지)
  if (fcmIds.length > 0 && SERVICE_ROLE_KEY) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000) // 8s 타임아웃
    try {
      const res = await fetch(
        `${ALLSURIAPP_API_URL}/.netlify/functions/notifications-send-bulk`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            userIds: fcmIds,
            title: notifTitle,
            body: notifBody,
            data: { type: 'new_web_order', listingId },
            skipDbInsert: true,  // DB 알림은 위에서 이미 저장
          }),
          signal: controller.signal,
        }
      )
      clearTimeout(timer)
      if (res.ok) {
        const r = await res.json() as { sent?: number; total?: number; failed?: number }
        console.log(`[submit] ✅ FCM 발송 완료: sent=${r.sent}/${r.total}, failed=${r.failed}`)
      } else {
        console.warn(`[submit] ⚠️ FCM bulk 오류 (${res.status}):`, await res.text())
      }
    } catch (e: unknown) {
      clearTimeout(timer)
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[submit] FCM 발송 실패/타임아웃 (DB 알림은 저장됨):', msg)
    }
  }
}

// ── 가격 엔진 v1 컬럼 (비파괴 마이그레이션 database/price_engine_v1.sql) ────────
// 마이그레이션이 아직 실행되지 않은 환경에서도 견적 접수가 절대 실패하지 않도록,
// 컬럼 부재 오류가 나면 기존 컬럼만으로 재시도합니다.

const MISSING_COLUMN_CODES = new Set(['PGRST204', '42703'])

function isMissingColumnError(err: { code?: string | null; message?: string | null } | null): boolean {
  if (!err) return false
  if (err.code && MISSING_COLUMN_CODES.has(err.code)) return true
  const msg = String(err.message || '')
  return /could not find the .* column|column .* does not exist|schema cache/i.test(msg)
}

function textOrNull(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return s ? s : null
}

function textArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const out = v.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 20)
  return out.length ? out : null
}

function intOrNull(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

function numberOrNull(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** 값이 있는 키만 남깁니다(빈 값으로 기존 컬럼을 덮어쓰지 않기 위해). */
function definedOnly(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue
    out[k] = v
  }
  return out
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      title, description, address, addressDetail,
      visitDate, category, customerName, customerPhone,
      customerEmail, pin, imageUrls,
    } = body

    if (!title || !category || !address || !visitDate || !customerName || !customerPhone) {
      return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 })
    }
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: '4자리 숫자 비밀번호가 필요합니다.' }, { status: 400 })
    }

    const normalizedPhone = customerPhone.replace(/[-\s]/g, '')
    const fullAddress = addressDetail ? `${address} ${addressDetail}` : address
    const now = new Date().toISOString()

    // ── 1. orders 테이블에 저장 ──────────────────────────────────────
    const baseOrderPayload = {
      title,
      description,
      address: fullAddress,
      visitDate,
      status: 'pending',
      category,
      customerName,
      customerPhone: normalizedPhone,
      customerEmail: customerEmail || null,
      isAnonymous: true,
      images: imageUrls || [],
      webPassword: pin,
      createdAt: now,
    }

    // 주소에서 시·도 / 시·군·구를 서버에서 직접 뽑습니다(클라이언트 입력을 신뢰하지 않음).
    const region = splitAddressRegion(fullAddress)

    const priceColumns = definedOnly({
      tradeId: textOrNull(body.tradeId),
      subcategory: textOrNull(body.subcategory),
      symptomTags: textArray(body.symptomTags),
      locationLevel1: region.locationLevel1,
      locationLevel2: region.locationLevel2,
      propertyType: textOrNull(body.propertyType),
      urgency: textOrNull(body.urgency),
      aiSummary: textOrNull(body.aiSummary),
      aiMissingFields: textArray(body.aiMissingFields),
      aiConfidence: numberOrNull(body.aiConfidence),
      priceEngineVersion: textOrNull(body.priceEngineVersion),
      priceState: textOrNull(body.priceState),
      estimatedMin: intOrNull(body.estimatedMin),
      estimatedMax: intOrNull(body.estimatedMax),
      priceConfidenceLevel: textOrNull(body.priceConfidenceLevel),
      priceEvidenceCount: intOrNull(body.priceEvidenceCount),
      priceFactors: textArray(body.priceFactors),
    })

    let orderRow: { id: string } | null = null
    let orderError: { code?: string | null; message?: string | null } | null = null

    {
      const first = await supabaseAdmin
        .from('orders')
        .insert({ ...baseOrderPayload, ...priceColumns })
        .select('id')
        .single()
      orderRow = first.data as { id: string } | null
      orderError = first.error

      if (orderError && isMissingColumnError(orderError)) {
        console.warn(
          '[submit] ⚠️ 가격 엔진 컬럼이 orders 테이블에 없습니다. 기존 컬럼만으로 다시 저장합니다. ' +
            'database/price_engine_v1.sql 을 실행해 주세요. (원인: ' + orderError.message + ')'
        )
        const retry = await supabaseAdmin
          .from('orders')
          .insert(baseOrderPayload)
          .select('id')
          .single()
        orderRow = retry.data as { id: string } | null
        orderError = retry.error
      }
    }

    if (orderError || !orderRow) {
      console.error('[submit] orders 저장 실패:', orderError)
      return NextResponse.json(
        { error: `견적 저장 실패: ${orderError?.message || '알 수 없는 오류'}` },
        { status: 500 }
      )
    }

    const orderId = orderRow.id

    // ── 2. marketplace_listings 에도 저장 ────────────────────────────
    // 사업자가 앱 오더 목록에서 볼 수 있도록
    // posted_by = null 허용 → DB에서 ALTER COLUMN posted_by DROP NOT NULL 필수
    const listingPayload = {
      title,
      description: description + (customerName ? `\n\n[웹 고객: ${customerName}]` : ''),
      posted_by: null,
      status: 'open',
      region: address,
      category,
      budget_amount: 0,
      media_urls: imageUrls || [],
      createdat: now,
      updatedat: now,
      web_order_id: orderId,
    }

    const { data: listing, error: listingError } = await supabaseAdmin
      .from('marketplace_listings')
      .insert(listingPayload)
      .select('id')
      .single()

    if (listingError) {
      // web_order_id 컬럼 미존재 시 (SQL 미실행) → 없이 재시도
      if (
        listingError.code === '42703' ||
        listingError.message?.includes('web_order_id') ||
        listingError.message?.includes('column')
      ) {
        const { web_order_id: _omit, ...payloadWithoutWebOrderId } = listingPayload
        const { data: listing2, error: listingError2 } = await supabaseAdmin
          .from('marketplace_listings')
          .insert(payloadWithoutWebOrderId)
          .select('id')
          .single()

        if (listingError2) {
          console.error('[submit] marketplace_listings 저장 실패 (fallback):', listingError2)
          return NextResponse.json({
            success: true,
            orderId,
            listingId: null,
            warning: `앱 오더 등록 실패 (DB SQL 실행 필요): ${listingError2.message}`,
          })
        }

        const listingId = (listing2 as { id: string } | null)?.id ?? null
        if (listingId) {
          try { await sendWebOrderNotifications(listingId, title, category, fullAddress) } catch { /* 무시 */ }
        }
        return NextResponse.json({
          success: true, orderId, listingId,
          message: '견적 요청이 접수되었습니다.',
        })
      }

      const errDetail = `code=${listingError.code} msg=${listingError.message} hint=${listingError.hint || ''} details=${listingError.details || ''}`
      console.error('[submit] marketplace_listings 저장 실패:', errDetail)
      return NextResponse.json({
        success: true,
        orderId,
        listingId: null,
        warning: `앱 오더 등록 실패: ${errDetail}`,
      })
    }

    const listingId = (listing as { id: string } | null)?.id ?? null

    // ── 3. 알림 전송 (동기 실행: DB 알림 + FCM 푸시)
    // DB 알림은 반드시 저장, FCM은 8초 타임아웃으로 보호 → 502 없음
    if (listingId) {
      try {
        await sendWebOrderNotifications(listingId, title, category, fullAddress)
      } catch (e: unknown) {
        // 알림 실패는 응답에 영향 없음
        console.warn('[submit] 알림 전송 오류 (무시):', e instanceof Error ? e.message : String(e))
      }
    }

    return NextResponse.json({
      success: true,
      orderId,
      listingId,
      message: '견적 요청이 접수되었습니다.',
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[submit] 오류:', msg)
    return NextResponse.json({ error: '서버 오류: ' + msg }, { status: 500 })
  }
}

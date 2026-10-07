import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { splitAddressRegion } from '@/lib/address-region'

// 고객 견적 폼 제출:
// 1. orders 테이블에 저장 (B2C 고객 레코드)
// 2. marketplace_listings 테이블에도 저장 (B2B와 동일한 앱 오더 목록)
// 3. 알림: 승인된 사업자에게 notifications INSERT.
//    푸시(FCM)는 notifications INSERT 웹훅(send-push-webhook)이 한 건씩 보냅니다.
//    → 응답 반환 전에 동기적으로 실행 (fire-and-forget 안 씀)

type UserRow = { id: string }

const NOTIFY_PAGE = 1000
const NOTIFY_MAX = 5000
const INSERT_CHUNK = 500

/** 알림 대상: 승인된 사업자 전체. 예전에는 users 앞쪽 500명(고객·관리자 포함)에게 보내 실제 사업자가 빠졌습니다. */
async function approvedBusinessIds(): Promise<string[]> {
  const ids: string[] = []
  for (let from = 0; from < NOTIFY_MAX; from += NOTIFY_PAGE) {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('role', 'business')
      .eq('businessstatus', 'approved')
      .order('id')
      .range(from, from + NOTIFY_PAGE - 1)
    if (error) {
      console.warn('[submit] 알림 대상 조회 실패:', error.message)
      break
    }
    const rows = (data || []) as UserRow[]
    ids.push(...rows.map((u) => u.id))
    if (rows.length < NOTIFY_PAGE) break
  }
  return ids
}

async function sendWebOrderNotifications(
  listingId: string, title: string, category: string, address: string
) {
  const regionShort = address.split(' ').slice(0, 2).join(' ')
  const notifTitle = '새 고객 오더 등록'
  const notifBody = `[${category}] ${title} · ${regionShort}`
  const now = new Date().toISOString()

  const ids = await approvedBusinessIds()
  console.log(`[submit] 알림 대상 사업자: ${ids.length}명 (listing=${listingId})`)

  let saved = 0
  for (let i = 0; i < ids.length; i += INSERT_CHUNK) {
    const part = ids.slice(i, i + INSERT_CHUNK)
    const { error } = await supabaseAdmin.from('notifications').insert(
      part.map((uid) => ({
        userid: uid, title: notifTitle, body: notifBody,
        type: 'new_web_order', isread: false, createdat: now,
      }))
    )
    if (error) {
      console.warn('[submit] DB 알림 저장 실패:', error.message)
      break
    }
    saved += part.length
  }
  console.log(`[submit] ✅ DB 알림 ${saved}명 저장 (푸시는 웹훅이 발송)`)
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
        const payloadWithoutWebOrderId = { ...listingPayload } as Record<string, unknown>
        delete payloadWithoutWebOrderId.web_order_id
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

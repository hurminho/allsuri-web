import { supabaseAdmin } from '@/lib/supabase-server'

/** 전화번호(숫자만)로 올수리 회원 ID 찾기. 번호 형식이 섞여 있어 DB 함수로 맞춥니다. */
export async function userIdsByPhone(digits: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin.rpc('allsuri_users_by_phone', { p_digits: digits })
  if (error) {
    console.warn('[consent] 회원 조회 실패:', error.message)
    return []
  }
  const rows = Array.isArray(data) ? data : []
  return rows
    .map((row: unknown) =>
      typeof row === 'string' ? row : String((row as Record<string, unknown>)?.allsuri_users_by_phone ?? ''),
    )
    .filter(Boolean)
}

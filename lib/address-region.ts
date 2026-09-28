// 주소 문자열 → 시·도 / 시·군·구.
// 가격 엔진(normalizeRegionLevel1 / normalizeRegionLevel2)과 같은 표기를 쓰도록 맞췄습니다.
// 순수 함수이며 네트워크를 쓰지 않습니다.

const REGION_LEVEL1: { canonical: string; pattern: RegExp }[] = [
  { canonical: '서울', pattern: /서울/ },
  { canonical: '부산', pattern: /부산/ },
  { canonical: '대구', pattern: /대구/ },
  { canonical: '인천', pattern: /인천/ },
  { canonical: '광주', pattern: /광주/ },
  { canonical: '대전', pattern: /대전/ },
  { canonical: '울산', pattern: /울산/ },
  { canonical: '세종', pattern: /세종/ },
  { canonical: '경기', pattern: /경기/ },
  { canonical: '강원', pattern: /강원/ },
  { canonical: '충북', pattern: /충북|충청북/ },
  { canonical: '충남', pattern: /충남|충청남/ },
  { canonical: '전북', pattern: /전북|전라북/ },
  { canonical: '전남', pattern: /전남|전라남/ },
  { canonical: '경북', pattern: /경북|경상북/ },
  { canonical: '경남', pattern: /경남|경상남/ },
  { canonical: '제주', pattern: /제주/ },
]

export function regionLevel1(address: unknown): string | null {
  const raw = String(address ?? '').trim()
  if (!raw) return null
  const hit = REGION_LEVEL1.find((r) => r.pattern.test(raw))
  return hit ? hit.canonical : null
}

export function regionLevel2(address: unknown): string | null {
  const raw = String(address ?? '').trim()
  if (!raw) return null
  const matches = raw.match(/([가-힣]{2,10}(?:시|군|구))/g)
  if (!matches) return null
  const first = matches.find((m) => !REGION_LEVEL1.some((r) => r.pattern.test(m)))
  return first || matches[0] || null
}

export type AddressRegion = {
  locationLevel1: string | null
  locationLevel2: string | null
}

/** "경기 성남시 분당구 …" → { locationLevel1: '경기', locationLevel2: '성남시' } */
export function splitAddressRegion(address: unknown): AddressRegion {
  return {
    locationLevel1: regionLevel1(address),
    locationLevel2: regionLevel2(address),
  }
}

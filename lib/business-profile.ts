export type PersonNameFields = {
  name?: string | null
  businessname?: string | null
  representative_name?: string | null
}

/** 사장님 성함: representative_name → name(상호명과 다를 때) → name */
export function resolvePersonName(profile: PersonNameFields): string {
  const rep = (profile.representative_name || '').trim()
  const name = (profile.name || '').trim()
  const biz = (profile.businessname || '').trim()
  if (rep) return rep
  if (name && name !== biz) return name
  return name
}

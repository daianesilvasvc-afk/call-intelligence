export interface SDR {
  name: string
  email: string
}

export const SDRS: SDR[] = [
  { name: 'Adriele', email: 'adriele.podiumeducacao@gmail.com' },
  { name: 'Luan',    email: 'luan.podiumeducacao@gmail.com' },
  { name: 'Nátali',  email: 'natalihelenapodium@gmail.com' },
]

function normalize(s: string) { return s.toLowerCase().split('@')[0] }
const SDR_USERNAMES = new Set(SDRS.map(s => normalize(s.email)))

export function isSdr(emailOrUsername: string): boolean {
  if (!emailOrUsername) return false
  return SDR_USERNAMES.has(normalize(emailOrUsername))
}

export function getSdrName(emailOrUsername: string): string | null {
  const key = normalize(emailOrUsername)
  return SDRS.find(s => normalize(s.email) === key)?.name ?? null
}

// Phone lookup kept for Wavoip route compatibility (unused with 3C)
export function isSdrPhone(_phone: string): boolean { return false }
export function getSdrNameByPhone(_phone: string): string | null { return null }

export interface SDR {
  name: string
  email: string
}

export const SDRS: SDR[] = [
  { name: 'Edrius Vieira',           email: 'edrius.podiumedu@gmail.com' },
  { name: 'Fernanda Piemonte',       email: 'fernanda.podiumeducacao@gmail.com' },
  { name: 'João Madeira',            email: 'joao.podiumeducacao@gmail.com' },
  { name: 'Kauai Moro',              email: 'kauairmoro@gmail.com' },
  { name: 'Kevin Amaro de Sousa',    email: 'keevin.amaro@gmail.com' },
  { name: 'Nátali Helena',           email: 'natalihelenapodium@gmail.com' },
  { name: 'Thiago Palivoda',         email: 'palivodalocalizar@gmail.com' },
  { name: 'Samuel',                  email: 'samuel.podiumeducacao@gmail.com' },
  { name: 'Lais',                    email: 'laispodiumeducacao@gmail.com' },
]

// Match both full email (edrius.podiumedu@gmail.com) and username (edrius.podiumedu)
// because API4COM sometimes returns only the username portion
function normalize(s: string) { return s.toLowerCase().split('@')[0] }

const SDR_USERNAMES = new Set(SDRS.map(s => normalize(s.email)))

export function isSdr(emailOrUsername: string): boolean {
  if (!emailOrUsername) return false
  return SDR_USERNAMES.has(normalize(emailOrUsername))
}

// Returns SDR name by email or username
export function getSdrName(emailOrUsername: string): string | null {
  const key = normalize(emailOrUsername)
  const found = SDRS.find(s => normalize(s.email) === key)
  return found?.name ?? null
}

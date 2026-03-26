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

// Set of emails for fast O(1) lookup
export const SDR_EMAILS = new Set(SDRS.map(s => s.email.toLowerCase()))

// Returns SDR name by email, or null if not an SDR
export function getSdrName(email: string): string | null {
  const found = SDRS.find(s => s.email.toLowerCase() === email.toLowerCase())
  return found?.name ?? null
}

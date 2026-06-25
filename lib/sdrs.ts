export interface SDR {
  name: string
  email: string
  // WhatsApp number used on Wavoip (format: 5511912345678 — country + area + number, no spaces/dashes)
  phone?: string
}

export const SDRS: SDR[] = [
  { name: 'Nátali Helena',           email: 'natalihelenapodium@gmail.com',            phone: '' },
  { name: 'Fernanda Piemonte',       email: 'fernanda.podiumeducacao@gmail.com',       phone: '' },
  { name: 'Kevin Amaro de Sousa',    email: 'keevin.amaro@gmail.com',                  phone: '' },
  { name: 'Samuel',                  email: 'samuel.podiumeducacao@gmail.com',         phone: '' },
  { name: 'Matheos',                 email: 'matheos.podiumeducacao@gmail.com',        phone: '' },
  { name: 'Amanda',                  email: 'amanda.podiumeducacao@gmail.com',         phone: '' },
  { name: 'Maicon',                  email: 'maiconoliveira.podiumeducacao@gmail.com', phone: '' },
  { name: 'Edrius Vieira',           email: 'edrius.podiumedu@gmail.com',              phone: '' },
]

// --- Email-based lookup (legacy / admin use) ---

function normalize(s: string) { return s.toLowerCase().split('@')[0] }

const SDR_USERNAMES = new Set(SDRS.map(s => normalize(s.email)))

export function isSdr(emailOrUsername: string): boolean {
  if (!emailOrUsername) return false
  return SDR_USERNAMES.has(normalize(emailOrUsername))
}

export function getSdrName(emailOrUsername: string): string | null {
  const key = normalize(emailOrUsername)
  const found = SDRS.find(s => normalize(s.email) === key)
  return found?.name ?? null
}

// --- Phone-based lookup (Wavoip integration) ---

function normalizePhone(p: string) { return p.replace(/\D/g, '') }

const SDR_PHONES = new Map(
  SDRS.filter(s => s.phone).map(s => [normalizePhone(s.phone!), s.name])
)

export function isSdrPhone(phone: string): boolean {
  return SDR_PHONES.has(normalizePhone(phone))
}

export function getSdrNameByPhone(phone: string): string | null {
  return SDR_PHONES.get(normalizePhone(phone)) ?? null
}

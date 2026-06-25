export interface SDR {
  name: string
  email: string
  // Número de ramal ou DID do SDR no Wavoip (formato: 5511912345678 — DDI + DDD + número, sem espaços)
  phone?: string
}

export const SDRS: SDR[] = [
  { name: 'Edrius Vieira',           email: 'edrius.podiumedu@gmail.com',              phone: '2001' },
  { name: 'Nátali Helena',           email: 'natalihelenapodium@gmail.com',            phone: '2002' },
  { name: 'Fernanda Piemonte',       email: 'fernanda.podiumeducacao@gmail.com',       phone: '2003' },
  { name: 'Maicon',                  email: 'maiconoliveira.podiumeducacao@gmail.com', phone: '2004' },
  { name: 'Samuel',                  email: 'samuel.podiumeducacao@gmail.com',         phone: '2005' },
  { name: 'Matheos',                 email: 'matheos.podiumeducacao@gmail.com',        phone: '2006' },
  { name: 'Amanda',                  email: 'amanda.podiumeducacao@gmail.com',         phone: '2007' },
  { name: 'Kevin Amaro de Sousa',    email: 'keevin.amaro@gmail.com',                  phone: '2009' },
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

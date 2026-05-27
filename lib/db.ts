import { createClient, type Client, type InValue } from '@libsql/client'

let _client: Client | null = null
let _initPromise: Promise<void> | null = null

function getClient(): Client {
  if (!_client) {
    _client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
  }
  return _client
}

async function getDb(): Promise<Client> {
  const client = getClient()
  if (!_initPromise) {
    _initPromise = client.batch([
      `CREATE TABLE IF NOT EXISTS calls (
          id TEXT PRIMARY KEY,
          call_id TEXT UNIQUE,
          caller TEXT,
          called TEXT,
          direction TEXT,
          started_at TEXT,
          ended_at TEXT,
          duration INTEGER,
          record_url TEXT,
          transcript TEXT,
          summary TEXT,
          closer_briefing TEXT,
          follow_ups TEXT,
          sentiment TEXT,
          key_points TEXT,
          whatsapp_msg TEXT,
          qualification TEXT,
          status TEXT DEFAULT 'pending',
          error TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )`,
      `CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT
        )`,
    ], 'write').then(() => {})
  }
  await _initPromise
  return client
}

export type CallStatus = 'pending' | 'processing' | 'done' | 'error'

export interface Call {
  id: string
  call_id: string
  caller: string
  called: string
  direction: string
  started_at: string
  ended_at: string
  duration: number
  record_url: string
  transcript: string | null
  summary: string | null
  closer_briefing: string | null
  follow_ups: string | null
  sentiment: string | null
  key_points: string | null
  whatsapp_msg: string | null
  qualification: string | null
  status: CallStatus
  error: string | null
  created_at: string
}

// --- Calls ---

export async function upsertCall(
  call: Omit<Call, 'created_at' | 'transcript' | 'summary' | 'closer_briefing' | 'follow_ups' | 'sentiment' | 'key_points' | 'whatsapp_msg' | 'qualification' | 'error'>
): Promise<void> {
  const db = await getDb()
  await db.execute({
    sql: `INSERT INTO calls (id, call_id, caller, called, direction, started_at, ended_at, duration, record_url, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(call_id) DO UPDATE SET
            caller=excluded.caller, called=excluded.called, direction=excluded.direction,
            started_at=excluded.started_at, ended_at=excluded.ended_at,
            duration=excluded.duration, record_url=excluded.record_url`,
    args: [call.id, call.call_id, call.caller, call.called, call.direction,
           call.started_at, call.ended_at, call.duration, call.record_url, call.status],
  })
}

export async function updateCallAnalysis(id: string, data: {
  transcript?: string
  summary?: string
  closer_briefing?: string
  follow_ups?: string
  sentiment?: string
  key_points?: string
  whatsapp_msg?: string
  qualification?: string
  status: CallStatus
  error?: string
}): Promise<void> {
  const db = await getDb()
  await db.execute({
    sql: `UPDATE calls SET
            transcript = COALESCE(?, transcript),
            summary = COALESCE(?, summary),
            closer_briefing = COALESCE(?, closer_briefing),
            follow_ups = COALESCE(?, follow_ups),
            sentiment = COALESCE(?, sentiment),
            key_points = COALESCE(?, key_points),
            whatsapp_msg = COALESCE(?, whatsapp_msg),
            qualification = COALESCE(?, qualification),
            status = ?, error = ?
          WHERE id = ?`,
    args: [
      data.transcript ?? null, data.summary ?? null, data.closer_briefing ?? null,
      data.follow_ups ?? null, data.sentiment ?? null, data.key_points ?? null,
      data.whatsapp_msg ?? null, data.qualification ?? null,
      data.status, data.error ?? null, id,
    ],
  })
}

export async function getCalls(limit = 100, offset = 0, sdr?: string, date?: string): Promise<Call[]> {
  const db = await getDb()
  const conditions: string[] = []
  const args: InValue[] = []

  if (sdr) {
    conditions.push('(caller = ? OR called = ?)')
    args.push(sdr, sdr)
  }
  if (date) {
    conditions.push('date(started_at) = ?')
    args.push(date)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  args.push(limit, offset)

  const result = await db.execute({
    sql: `SELECT * FROM calls ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`,
    args,
  })
  return result.rows as unknown as Call[]
}

export async function getCallById(id: string): Promise<Call | null> {
  const db = await getDb()
  const result = await db.execute({
    sql: 'SELECT * FROM calls WHERE id = ?',
    args: [id],
  })
  return (result.rows[0] ?? null) as unknown as Call | null
}

export async function getCallByCallId(callId: string): Promise<Call | null> {
  const db = await getDb()
  const result = await db.execute({
    sql: 'SELECT * FROM calls WHERE call_id = ?',
    args: [callId],
  })
  return (result.rows[0] ?? null) as unknown as Call | null
}

export async function getStats(sdr?: string, date?: string) {
  const db = await getDb()

  async function count(extra: string, ...extraArgs: InValue[]): Promise<number> {
    const conditions: string[] = []
    const args: InValue[] = []
    if (sdr) { conditions.push('(caller = ? OR called = ?)'); args.push(sdr, sdr) }
    if (date) { conditions.push('date(started_at) = ?'); args.push(date) }
    if (extra) { conditions.push(extra); args.push(...extraArgs) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const result = await db.execute({
      sql: `SELECT COUNT(*) as c FROM calls ${where}`,
      args,
    })
    return Number(result.rows[0]?.c ?? 0)
  }

  const [total, today, done, processing] = await Promise.all([
    count(''),
    count("date(started_at) = date('now')"),
    count("status = 'done'"),
    count("status IN ('pending','processing')"),
  ])

  return { total, today, done, processing }
}

// --- Settings ---

const ENV_MAP: Record<string, string> = {
  api4com_token: 'API4COM_TOKEN',
  groq_api_key: 'GROQ_API_KEY',
}

export async function getSetting(key: string): Promise<string | null> {
  const envKey = ENV_MAP[key]
  if (envKey && process.env[envKey]) return process.env[envKey]!
  const db = await getDb()
  const result = await db.execute({
    sql: 'SELECT value FROM settings WHERE key = ?',
    args: [key],
  })
  return (result.rows[0]?.value as string) ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb()
  await db.execute({
    sql: `INSERT INTO settings (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [key, value],
  })
}

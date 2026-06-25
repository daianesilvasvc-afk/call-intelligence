// Direct Turso HTTP API — no SDK, no native binaries, works on any serverless platform

function dbUrl() {
  return (process.env.TURSO_DATABASE_URL ?? '').replace('libsql://', 'https://')
}

type SqlVal =
  | { type: 'null' }
  | { type: 'integer'; value: string }
  | { type: 'real'; value: string }
  | { type: 'text'; value: string }

function toSql(v: unknown): SqlVal {
  if (v === null || v === undefined) return { type: 'null' }
  if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' }
  if (typeof v === 'bigint') return { type: 'integer', value: String(v) }
  if (typeof v === 'number') {
    return Number.isInteger(v)
      ? { type: 'integer', value: String(v) }
      : { type: 'real', value: String(v) }
  }
  return { type: 'text', value: String(v) }
}

function fromSql(v: SqlVal): unknown {
  if (v.type === 'null') return null
  if (v.type === 'integer') return parseInt(v.value, 10)
  if (v.type === 'real') return parseFloat(v.value)
  return v.value
}

async function execute(sql: string, args: unknown[] = []): Promise<{ rows: Record<string, unknown>[]; rowsAffected: number }> {
  const res = await fetch(`${dbUrl()}/v2/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.TURSO_AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        { type: 'execute', stmt: { sql, args: args.map(toSql) } },
        { type: 'close' },
      ],
    }),
  })

  if (!res.ok) throw new Error(`Turso ${res.status}: ${(await res.text()).slice(0, 200)}`)

  const data = await res.json() as { results: Array<{ type: string; response?: { result?: { cols: { name: string }[]; rows: SqlVal[][]; affected_row_count: number } }; error?: { message: string } }> }
  const r = data.results[0]
  if (r.type === 'error') throw new Error(`Turso: ${r.error?.message}`)

  const result = r.response!.result!
  const cols = result.cols.map(c => c.name)
  const rows = result.rows.map(row => {
    const obj: Record<string, unknown> = {}
    row.forEach((val, i) => { obj[cols[i]] = fromSql(val) })
    return obj
  })
  return { rows, rowsAffected: result.affected_row_count }
}

async function executeBatch(statements: { sql: string; args?: unknown[] }[]): Promise<void> {
  const res = await fetch(`${dbUrl()}/v2/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.TURSO_AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        ...statements.map(s => ({ type: 'execute', stmt: { sql: s.sql, args: (s.args ?? []).map(toSql) } })),
        { type: 'close' },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Turso batch ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

let _initPromise: Promise<void> | null = null

function ensureSchema(): Promise<void> {
  if (!_initPromise) {
    _initPromise = (async () => {
      await executeBatch([
        {
          sql: `CREATE TABLE IF NOT EXISTS calls (
            id TEXT PRIMARY KEY, call_id TEXT UNIQUE, caller TEXT, called TEXT,
            direction TEXT, started_at TEXT, ended_at TEXT, duration INTEGER,
            record_url TEXT, transcript TEXT, summary TEXT, closer_briefing TEXT,
            follow_ups TEXT, sentiment TEXT, key_points TEXT, whatsapp_msg TEXT,
            qualification TEXT, status TEXT DEFAULT 'pending', error TEXT,
            created_at TEXT DEFAULT (datetime('now'))
          )`,
        },
        { sql: `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)` },
      ])
      // Migration: add nepq_analysis column to existing tables
      try {
        await execute(`ALTER TABLE calls ADD COLUMN nepq_analysis TEXT`)
      } catch { /* column already exists — safe to ignore */ }
    })()
  }
  return _initPromise
}

// --- Types ---

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
  nepq_analysis: string | null
  status: CallStatus
  error: string | null
  created_at: string
}

// --- Calls ---

export async function upsertCall(
  call: Omit<Call, 'created_at' | 'transcript' | 'summary' | 'closer_briefing' | 'follow_ups' | 'sentiment' | 'key_points' | 'whatsapp_msg' | 'qualification' | 'nepq_analysis' | 'error'>
): Promise<void> {
  await ensureSchema()
  await execute(
    `INSERT INTO calls (id, call_id, caller, called, direction, started_at, ended_at, duration, record_url, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(call_id) DO UPDATE SET
       caller=excluded.caller, called=excluded.called, direction=excluded.direction,
       started_at=excluded.started_at, ended_at=excluded.ended_at,
       duration=excluded.duration, record_url=excluded.record_url`,
    [call.id, call.call_id, call.caller, call.called, call.direction,
     call.started_at, call.ended_at, call.duration, call.record_url, call.status]
  )
}

export async function updateCallAnalysis(id: string, data: {
  transcript?: string; summary?: string; closer_briefing?: string; follow_ups?: string
  sentiment?: string; key_points?: string; whatsapp_msg?: string; qualification?: string
  nepq_analysis?: string; status: CallStatus; error?: string
}): Promise<void> {
  await ensureSchema()
  await execute(
    `UPDATE calls SET
       transcript = COALESCE(?, transcript), summary = COALESCE(?, summary),
       closer_briefing = COALESCE(?, closer_briefing), follow_ups = COALESCE(?, follow_ups),
       sentiment = COALESCE(?, sentiment), key_points = COALESCE(?, key_points),
       whatsapp_msg = COALESCE(?, whatsapp_msg), qualification = COALESCE(?, qualification),
       nepq_analysis = COALESCE(?, nepq_analysis),
       status = ?, error = ?
     WHERE id = ?`,
    [data.transcript ?? null, data.summary ?? null, data.closer_briefing ?? null,
     data.follow_ups ?? null, data.sentiment ?? null, data.key_points ?? null,
     data.whatsapp_msg ?? null, data.qualification ?? null, data.nepq_analysis ?? null,
     data.status, data.error ?? null, id]
  )
}

export async function getCalls(limit = 100, offset = 0, sdr?: string, date?: string): Promise<Call[]> {
  await ensureSchema()
  const conditions: string[] = []
  const args: unknown[] = []
  if (sdr) { conditions.push('(caller = ? OR called = ?)'); args.push(sdr, sdr) }
  if (date) { conditions.push('date(started_at) = ?'); args.push(date) }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  args.push(limit, offset)
  const { rows } = await execute(`SELECT * FROM calls ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`, args)
  return rows as unknown as Call[]
}

export async function getCallById(id: string): Promise<Call | null> {
  await ensureSchema()
  const { rows } = await execute('SELECT * FROM calls WHERE id = ?', [id])
  return (rows[0] ?? null) as unknown as Call | null
}

export async function getCallByCallId(callId: string): Promise<Call | null> {
  await ensureSchema()
  const { rows } = await execute('SELECT * FROM calls WHERE call_id = ?', [callId])
  return (rows[0] ?? null) as unknown as Call | null
}

export async function getStats(sdr?: string, date?: string) {
  await ensureSchema()

  async function count(extra: string, ...extraArgs: unknown[]): Promise<number> {
    const conditions: string[] = []
    const args: unknown[] = []
    if (sdr) { conditions.push('(caller = ? OR called = ?)'); args.push(sdr, sdr) }
    if (date) { conditions.push('date(started_at) = ?'); args.push(date) }
    if (extra) { conditions.push(extra); args.push(...extraArgs) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const { rows } = await execute(`SELECT COUNT(*) as c FROM calls ${where}`, args)
    return Number(rows[0]?.c ?? 0)
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
  wavoip_token: 'WAVOIP_TOKEN',
  groq_api_key: 'GROQ_API_KEY',
}

export async function clearPendingCalls(): Promise<number> {
  await ensureSchema()
  const { rowsAffected } = await execute(`DELETE FROM calls WHERE status = 'pending'`)
  return rowsAffected
}

export async function clearAllCalls(): Promise<number> {
  await ensureSchema()
  const { rowsAffected } = await execute(`DELETE FROM calls`)
  return rowsAffected
}

// --- Settings ---

export async function getSetting(key: string): Promise<string | null> {
  const envKey = ENV_MAP[key]
  if (envKey && process.env[envKey]) return process.env[envKey]!
  await ensureSchema()
  const { rows } = await execute('SELECT value FROM settings WHERE key = ?', [key])
  return (rows[0]?.value as string) ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  await ensureSchema()
  await execute(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  )
}

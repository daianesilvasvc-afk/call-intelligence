import Database from 'better-sqlite3'
import path from 'path'

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'calls.db')

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    const fs = require('fs')
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    initSchema(db)
  }
  return db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS calls (
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
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `)
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

export function upsertCall(call: Omit<Call, 'created_at' | 'transcript' | 'summary' | 'closer_briefing' | 'follow_ups' | 'sentiment' | 'key_points' | 'whatsapp_msg' | 'qualification' | 'error'>): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO calls (id, call_id, caller, called, direction, started_at, ended_at, duration, record_url, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(call_id) DO UPDATE SET
      caller=excluded.caller, called=excluded.called, direction=excluded.direction,
      started_at=excluded.started_at, ended_at=excluded.ended_at,
      duration=excluded.duration, record_url=excluded.record_url
  `).run(call.id, call.call_id, call.caller, call.called, call.direction,
    call.started_at, call.ended_at, call.duration, call.record_url, call.status)
}

export function updateCallAnalysis(id: string, data: {
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
}): void {
  const db = getDb()
  // Migrations for new columns
  try { db.exec(`ALTER TABLE calls ADD COLUMN whatsapp_msg TEXT`) } catch {}
  try { db.exec(`ALTER TABLE calls ADD COLUMN qualification TEXT`) } catch {}
  db.prepare(`
    UPDATE calls SET
      transcript = COALESCE(?, transcript),
      summary = COALESCE(?, summary),
      closer_briefing = COALESCE(?, closer_briefing),
      follow_ups = COALESCE(?, follow_ups),
      sentiment = COALESCE(?, sentiment),
      key_points = COALESCE(?, key_points),
      whatsapp_msg = COALESCE(?, whatsapp_msg),
      qualification = COALESCE(?, qualification),
      status = ?, error = ?
    WHERE id = ?
  `).run(
    data.transcript ?? null, data.summary ?? null, data.closer_briefing ?? null,
    data.follow_ups ?? null, data.sentiment ?? null, data.key_points ?? null,
    data.whatsapp_msg ?? null, data.qualification ?? null,
    data.status, data.error ?? null, id
  )
}

export function getCalls(limit = 100, offset = 0, sdr?: string, date?: string): Call[] {
  const conditions: string[] = []
  const params: unknown[] = []

  if (sdr) {
    conditions.push('(caller = ? OR called = ?)')
    params.push(sdr, sdr)
  }
  if (date) {
    conditions.push("date(started_at) = ?")
    params.push(date)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  params.push(limit, offset)
  return getDb().prepare(`
    SELECT * FROM calls ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?
  `).all(...params) as Call[]
}

export function getCallById(id: string): Call | null {
  return getDb().prepare('SELECT * FROM calls WHERE id = ?').get(id) as Call | null
}

export function getCallByCallId(callId: string): Call | null {
  return getDb().prepare('SELECT * FROM calls WHERE call_id = ?').get(callId) as Call | null
}

export function getStats(sdr?: string, date?: string) {
  const db = getDb()

  function count(extra: string, ...args: unknown[]) {
    const conditions: string[] = []
    const params: unknown[] = []
    if (sdr) { conditions.push('(caller = ? OR called = ?)'); params.push(sdr, sdr) }
    if (date) { conditions.push('date(started_at) = ?'); params.push(date) }
    if (extra) { conditions.push(extra); params.push(...args) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    return (db.prepare(`SELECT COUNT(*) as c FROM calls ${where}`).get(...params) as any).c as number
  }

  return {
    total:      count(''),
    today:      count("date(started_at) = date('now')"),
    done:       count("status = 'done'"),
    processing: count("status IN ('pending','processing')"),
  }
}

// --- Settings ---

// Env var names for each setting key (Railway/production)
const ENV_MAP: Record<string, string> = {
  api4com_token: 'API4COM_TOKEN',
  groq_api_key: 'GROQ_API_KEY',
}

export function getSetting(key: string): string | null {
  // Check environment variable first (Railway production)
  const envKey = ENV_MAP[key]
  if (envKey && process.env[envKey]) return process.env[envKey]!
  // Fall back to database (local dev via settings UI)
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as any
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  getDb().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

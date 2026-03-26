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
  status: CallStatus
  error: string | null
  created_at: string
}

// --- Calls ---

export function upsertCall(call: Omit<Call, 'created_at' | 'transcript' | 'summary' | 'closer_briefing' | 'follow_ups' | 'sentiment' | 'key_points' | 'error'>): void {
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
  status: CallStatus
  error?: string
}): void {
  const db = getDb()
  db.prepare(`
    UPDATE calls SET
      transcript = COALESCE(?, transcript),
      summary = COALESCE(?, summary),
      closer_briefing = COALESCE(?, closer_briefing),
      follow_ups = COALESCE(?, follow_ups),
      sentiment = COALESCE(?, sentiment),
      key_points = COALESCE(?, key_points),
      status = ?, error = ?
    WHERE id = ?
  `).run(
    data.transcript ?? null, data.summary ?? null, data.closer_briefing ?? null,
    data.follow_ups ?? null, data.sentiment ?? null, data.key_points ?? null,
    data.status, data.error ?? null, id
  )
}

export function getCalls(limit = 100, offset = 0, sdr?: string): Call[] {
  if (sdr) {
    return getDb().prepare(`
      SELECT * FROM calls WHERE caller = ? OR called = ?
      ORDER BY started_at DESC LIMIT ? OFFSET ?
    `).all(sdr, sdr, limit, offset) as Call[]
  }
  return getDb().prepare(`
    SELECT * FROM calls ORDER BY started_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset) as Call[]
}

export function getCallById(id: string): Call | null {
  return getDb().prepare('SELECT * FROM calls WHERE id = ?').get(id) as Call | null
}

export function getCallByCallId(callId: string): Call | null {
  return getDb().prepare('SELECT * FROM calls WHERE call_id = ?').get(callId) as Call | null
}

export function getStats(sdr?: string) {
  const db = getDb()
  if (sdr) {
    const args = [sdr, sdr]
    const total = (db.prepare(`SELECT COUNT(*) as c FROM calls WHERE (caller = ? OR called = ?)`).get(...args) as any).c
    const today = (db.prepare(`SELECT COUNT(*) as c FROM calls WHERE (caller = ? OR called = ?) AND date(started_at) = date('now')`).get(...args) as any).c
    const done = (db.prepare(`SELECT COUNT(*) as c FROM calls WHERE (caller = ? OR called = ?) AND status = 'done'`).get(...args) as any).c
    const processing = (db.prepare(`SELECT COUNT(*) as c FROM calls WHERE (caller = ? OR called = ?) AND status IN ('pending','processing')`).get(...args) as any).c
    return { total, today, done, processing }
  }
  const total = (db.prepare('SELECT COUNT(*) as c FROM calls').get() as any).c
  const today = (db.prepare(`SELECT COUNT(*) as c FROM calls WHERE date(started_at) = date('now')`).get() as any).c
  const done = (db.prepare(`SELECT COUNT(*) as c FROM calls WHERE status = 'done'`).get() as any).c
  const processing = (db.prepare(`SELECT COUNT(*) as c FROM calls WHERE status IN ('pending','processing')`).get() as any).c
  return { total, today, done, processing }
}

// --- Settings ---

export function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as any
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  getDb().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

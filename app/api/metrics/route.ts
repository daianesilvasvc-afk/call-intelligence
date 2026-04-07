import { NextRequest, NextResponse } from 'next/server'
import { getSetting } from '@/lib/db'
import { fetchAllCalls } from '@/lib/api4com'
import { isSdr, getSdrName, SDRS } from '@/lib/sdrs'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = getSetting('api4com_token')
  if (!token) return NextResponse.json({ error: 'token not set' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const today = new Date().toISOString().slice(0, 10)
  const startDate = searchParams.get('startDate') || today
  const endDate   = searchParams.get('endDate')   || today

  try {
    // Fetch ALL calls (no duration/recording filter) for accurate HitRate
    const calls = await fetchAllCalls(token, 20, { startDate, endDate })

    // Group by SDR + date
    type Row = {
      sdr: string
      date: string
      total: number
      connected: number   // duration > 0
      over50s: number     // duration > 50
      over3min: number    // duration >= 180
      totalDuration: number
      numbers: Set<string>
    }

    const map = new Map<string, Row>()

    for (const c of calls) {
      const identifier = isSdr(c.email) ? c.email : (isSdr(c.first_name) ? c.first_name : null)
      if (!identifier) continue

      const sdrName = getSdrName(identifier) ?? identifier
      const date = c.started_at.slice(0, 10)
      const key = `${sdrName}::${date}`

      if (!map.has(key)) {
        map.set(key, { sdr: sdrName, date, total: 0, connected: 0, over50s: 0, over3min: 0, totalDuration: 0, numbers: new Set() })
      }

      const row = map.get(key)!
      row.total++
      if (c.duration > 0)   row.connected++
      if (c.duration > 50)  row.over50s++
      if (c.duration >= 180) row.over3min++
      row.totalDuration += c.duration
      if (c.to) row.numbers.add(c.to)
    }

    const rows = Array.from(map.values())
      .map(r => ({
        sdr:           r.sdr,
        date:          r.date,
        total:         r.total,
        connected:     r.connected,
        over50s:       r.over50s,
        over3min:      r.over3min,
        hitrate:       r.total > 0 ? +(r.connected / r.total * 100).toFixed(1) : 0,
        hitrate50:     r.total > 0 ? +(r.over50s   / r.total * 100).toFixed(1) : 0,
        hitrate3min:   r.total > 0 ? +(r.over3min  / r.total * 100).toFixed(1) : 0,
        tma:           r.connected > 0 ? Math.round(r.totalDuration / r.connected) : 0,
        totalDuration: r.totalDuration,
        numDiscado:    r.numbers.size,
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.sdr.localeCompare(b.sdr))

    return NextResponse.json({ rows, startDate, endDate })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

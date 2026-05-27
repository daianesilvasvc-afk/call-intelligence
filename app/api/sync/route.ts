import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getSetting, upsertCall, getCallByCallId } from '@/lib/db'
import { fetchAllCalls } from '@/lib/api4com'
import { isSdr, getSdrName } from '@/lib/sdrs'

export async function POST(req: NextRequest) {
  const token = await getSetting('api4com_token')
  if (!token) {
    return NextResponse.json({ error: 'API4COM token não configurado' }, { status: 400 })
  }

  let startDate: string | undefined
  let endDate: string | undefined
  try {
    const body = await req.json().catch(() => ({}))
    startDate = body.startDate
    endDate   = body.endDate
  } catch { /* no body */ }

  if (!startDate) {
    const past = new Date()
    past.setDate(past.getDate() - 7)
    startDate = past.toISOString().slice(0, 10)
  }
  if (!endDate) {
    endDate = new Date().toISOString().slice(0, 10)
  }

  try {
    const calls = await fetchAllCalls(token, 20, { startDate, endDate }, 2000)

    let imported = 0
    let skipped = 0
    let notSdr = 0

    for (const c of calls) {
      const sdrIdentifier = isSdr(c.email) ? c.email : (isSdr(c.first_name) ? c.first_name : null)
      if (!sdrIdentifier) { notSdr++; continue }
      if (!c.record_url) { skipped++; continue }
      if (c.duration < 180) { skipped++; continue }

      const existing = await getCallByCallId(c.id)
      if (existing) { skipped++; continue }

      const apiName = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email
      const sdrName = getSdrName(sdrIdentifier) ?? apiName

      await upsertCall({
        id: randomUUID(),
        call_id: c.id,
        caller: c.call_type === 'outbound' ? sdrName : c.from,
        called: c.call_type === 'outbound' ? c.to : sdrName,
        direction: c.call_type,
        started_at: c.started_at,
        ended_at: c.ended_at,
        duration: c.duration,
        record_url: c.record_url,
        status: 'pending',
      })
      imported++
    }

    return NextResponse.json({
      ok: true, imported, skipped, notSdr,
      total: calls.length, startDate, endDate,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getSetting, upsertCall, getCallByCallId } from '@/lib/db'
import { fetchAllCalls } from '@/lib/api4com'
import { SDR_EMAILS, getSdrName } from '@/lib/sdrs'

export async function POST() {
  const token = getSetting('api4com_token')
  if (!token) {
    return NextResponse.json({ error: 'API4COM token não configurado' }, { status: 400 })
  }

  try {
    const calls = await fetchAllCalls(token, 5)

    let imported = 0
    let skipped = 0
    let notSdr = 0

    for (const c of calls) {
      // Only import calls from the registered SDR team
      if (!c.email || !SDR_EMAILS.has(c.email.toLowerCase())) {
        notSdr++
        continue
      }

      if (!c.record_url) { skipped++; continue }
      if (c.duration < 180) { skipped++; continue }

      const existing = getCallByCallId(c.id)
      if (existing) { skipped++; continue }

      // Use official SDR name (from our list) rather than whatever the API returns
      const apiName = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email
      const sdrName = getSdrName(c.email) ?? apiName

      upsertCall({
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

    return NextResponse.json({ ok: true, imported, skipped, notSdr, total: calls.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

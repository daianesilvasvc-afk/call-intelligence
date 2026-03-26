import { NextResponse } from 'next/server'
import { getSetting } from '@/lib/db'
import { fetchAllCalls } from '@/lib/api4com'
import { isSdr, getSdrName } from '@/lib/sdrs'

export async function GET() {
  const token = getSetting('api4com_token')
  if (!token) return NextResponse.json({ error: 'token not set' }, { status: 400 })

  const calls = await fetchAllCalls(token, 20)

  // Count by SDR email (raw from API)
  const byEmail: Record<string, { total: number; withRecording: number; over3min: number; wouldImport: number }> = {}

  for (const c of calls) {
    const key = c.email || '(sem email)'
    if (!byEmail[key]) byEmail[key] = { total: 0, withRecording: 0, over3min: 0, wouldImport: 0 }
    byEmail[key].total++
    if (c.record_url) byEmail[key].withRecording++
    if (c.duration >= 180) byEmail[key].over3min++
    if (isSdr(c.email) && c.record_url && c.duration >= 180) byEmail[key].wouldImport++
  }

  // Summary for SDRs
  const sdrRows = Object.entries(byEmail)
    .filter(([email]) => isSdr(email))
    .map(([email, counts]) => ({ email, name: getSdrName(email), ...counts }))
    .sort((a, b) => b.total - a.total)

  const nonSdrTotal = Object.entries(byEmail)
    .filter(([email]) => !isSdr(email))
    .reduce((sum, [, c]) => sum + c.total, 0)

  return NextResponse.json({
    totalFetched: calls.length,
    nonSdrIgnored: nonSdrTotal,
    sdrs: sdrRows,
  })
}

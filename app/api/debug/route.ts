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
    const sdrId = isSdr(c.email) ? c.email : (isSdr(c.first_name) ? c.first_name : null)
    const key = sdrId || c.email || '(sem email)'
    if (!byEmail[key]) byEmail[key] = { total: 0, withRecording: 0, over3min: 0, wouldImport: 0 }
    byEmail[key].total++
    if (c.record_url) byEmail[key].withRecording++
    if (c.duration >= 180) byEmail[key].over3min++
    if (sdrId && c.record_url && c.duration >= 180) byEmail[key].wouldImport++
  }

  // Summary for SDRs
  const sdrRows = Object.entries(byEmail)
    .filter(([email]) => isSdr(email))
    .map(([email, counts]) => ({ email, name: getSdrName(email), ...counts }))
    .sort((a, b) => b.total - a.total)

  const nonSdrTotal = Object.entries(byEmail)
    .filter(([email]) => !isSdr(email))
    .reduce((sum, [, c]) => sum + c.total, 0)

  // Top unknown emails (to identify missing SDRs)
  const unknownEmails: Record<string, number> = {}
  for (const c of calls) {
    if (!isSdr(c.email)) {
      const key = c.email || '(sem email)'
      unknownEmails[key] = (unknownEmails[key] || 0) + 1
    }
  }
  const topUnknown = Object.entries(unknownEmails)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([email, count]) => ({ email, count }))

  // Sample records from the main account email to find agent names
  const mainAccountSamples = calls
    .filter(c => c.email === 'victorzanellad@gmail.com')
    .slice(0, 20)
    .map(c => ({
      email: c.email,
      first_name: c.first_name,
      last_name: c.last_name,
      duration: c.duration,
      hasRecording: !!c.record_url,
    }))

  return NextResponse.json({
    totalFetched: calls.length,
    nonSdrIgnored: nonSdrTotal,
    sdrs: sdrRows,
    topUnknownEmails: topUnknown,
    mainAccountSamples,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { getCalls, getStats } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const sdr = searchParams.get('sdr') || undefined
    const calls = getCalls(limit, offset, sdr)
    const stats = getStats(sdr)

    return NextResponse.json({ calls, stats })
  } catch (err) {
    console.error('Error fetching calls:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

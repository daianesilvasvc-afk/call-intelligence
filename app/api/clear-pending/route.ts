import { NextResponse } from 'next/server'
import { clearPendingCalls } from '@/lib/db'

export async function POST() {
  const deleted = await clearPendingCalls()
  return NextResponse.json({ ok: true, deleted })
}

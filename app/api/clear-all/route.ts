import { NextResponse } from 'next/server'
import { clearAllCalls } from '@/lib/db'

export async function POST() {
  const deleted = await clearAllCalls()
  return NextResponse.json({ ok: true, deleted })
}

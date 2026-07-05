import { NextRequest, NextResponse } from 'next/server'
import { getSetting, setSetting } from '@/lib/db'

export async function GET() {
  const groq_api_key = await getSetting('groq_api_key')
  return NextResponse.json({
    groq_api_key: groq_api_key ? '***saved***' : null,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const ops: Promise<void>[] = []
  if (body.groq_api_key) ops.push(setSetting('groq_api_key', body.groq_api_key))
  await Promise.all(ops)
  return NextResponse.json({ ok: true })
}

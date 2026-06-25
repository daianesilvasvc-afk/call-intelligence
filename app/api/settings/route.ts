import { NextRequest, NextResponse } from 'next/server'
import { getSetting, setSetting } from '@/lib/db'

export async function GET() {
  const [wavoip_token, groq_api_key] = await Promise.all([
    getSetting('wavoip_token'),
    getSetting('groq_api_key'),
  ])
  return NextResponse.json({
    wavoip_token: wavoip_token ? '***saved***' : null,
    groq_api_key: groq_api_key ? '***saved***' : null,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const ops: Promise<void>[] = []
  if (body.wavoip_token) ops.push(setSetting('wavoip_token', body.wavoip_token))
  if (body.groq_api_key) ops.push(setSetting('groq_api_key', body.groq_api_key))
  await Promise.all(ops)
  return NextResponse.json({ ok: true })
}

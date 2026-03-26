import { NextRequest, NextResponse } from 'next/server'
import { getSetting, setSetting } from '@/lib/db'

export async function GET() {
  return NextResponse.json({
    api4com_token: getSetting('api4com_token') ? '***saved***' : null,
    groq_api_key: getSetting('groq_api_key') ? '***saved***' : null,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  if (body.api4com_token) setSetting('api4com_token', body.api4com_token)
  if (body.groq_api_key) setSetting('groq_api_key', body.groq_api_key)

  return NextResponse.json({ ok: true })
}

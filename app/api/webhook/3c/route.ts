import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('[3c-webhook] payload:', JSON.stringify(body, null, 2))
    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[3c-webhook] error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', service: '3c-webhook' })
}

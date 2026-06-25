import { NextRequest, NextResponse, after } from 'next/server'
import { randomUUID } from 'crypto'
import { upsertCall, updateCallAnalysis, getCallByCallId } from '@/lib/db'
import { transcribeAudio } from '@/lib/transcribe'
import { analyzeCall } from '@/lib/analyze'
import { isSdrPhone, getSdrNameByPhone } from '@/lib/sdrs'
import { buildRecordUrl } from '@/lib/wavoip'
import type { WavoipWebhookPayload, WavoipCallEvent, WavoipRecordEvent } from '@/lib/wavoip'

export const maxDuration = 60

// Forward every event to the original destination in parallel (fire-and-forget)
const FORWARD_URL = 'https://inngest-prod.podiumeducacao.com.br/webhooks/wavoip'

function forwardEvent(body: unknown, headers: Headers) {
  const forwardHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
  // Preserve any auth/signature headers Wavoip sends
  for (const key of ['authorization', 'x-wavoip-signature', 'x-webhook-secret']) {
    const val = headers.get(key)
    if (val) forwardHeaders[key] = val
  }
  fetch(FORWARD_URL, {
    method: 'POST',
    headers: forwardHeaders,
    body: JSON.stringify(body),
  }).catch(err => console.error('[forward] Error:', err))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as WavoipWebhookPayload

    // Forward to original destination before processing (non-blocking)
    forwardEvent(body, req.headers)

    if (body.type === 'CALL') return handleCallEvent(body as WavoipCallEvent)
    if (body.type === 'RECORD') return handleRecordEvent(body as WavoipRecordEvent)

    return NextResponse.json({ received: true, skipped: 'device_event' })
  } catch (err) {
    console.error('Wavoip webhook error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

async function handleCallEvent(body: WavoipCallEvent): Promise<NextResponse> {
  if (body.status !== 'ENDED') {
    return NextResponse.json({ received: true, skipped: 'not_ended' })
  }

  const duration = body.duration ?? 0
  if (duration < 120) {
    return NextResponse.json({ received: true, skipped: 'too_short' })
  }

  // No recording possible
  if (body.record_status === 'DISABLED' || body.record_status === 'EMPTY_RECORDING') {
    return NextResponse.json({ received: true, skipped: 'no_recording' })
  }

  const callId = String(body.whatsapp_call_id)
  const existing = await getCallByCallId(callId)
  if (existing) {
    return NextResponse.json({ received: true, skipped: 'duplicate' })
  }

  // Identify SDR by phone number
  const sdrPhone = isSdrPhone(body.caller) ? body.caller : (isSdrPhone(body.receiver) ? body.receiver : null)
  const sdrName = sdrPhone ? getSdrNameByPhone(sdrPhone) : null

  const outbound = body.direction === 'OUTCOMING'
  const caller = outbound ? (sdrName ?? body.caller) : body.caller
  const called = outbound ? body.receiver : (sdrName ?? body.receiver)

  const endedAt = new Date()
  const startedAt = new Date(endedAt.getTime() - duration * 1000)

  const id = randomUUID()
  const recordUrl = buildRecordUrl(body.whatsapp_call_id)

  await upsertCall({
    id,
    call_id: callId,
    caller,
    called,
    direction: outbound ? 'outbound' : 'inbound',
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration,
    record_url: recordUrl,
    status: 'pending',
  })

  // If recording is already ready, trigger analysis immediately
  if (body.record_status === 'READY') {
    triggerAnalysis(id, recordUrl, caller, called, duration, outbound ? 'outbound' : 'inbound')
  }

  return NextResponse.json({ received: true, id })
}

async function handleRecordEvent(body: WavoipRecordEvent): Promise<NextResponse> {
  if (body.record_status !== 'READY') {
    return NextResponse.json({ received: true, skipped: 'not_ready' })
  }

  const callId = String(body.whatsapp_call_id)
  const call = await getCallByCallId(callId)
  if (!call) {
    return NextResponse.json({ received: true, skipped: 'call_not_found' })
  }

  // Already processed
  if (call.status === 'done' || call.status === 'processing') {
    return NextResponse.json({ received: true, skipped: 'already_processed' })
  }

  const recordUrl = body.record_url ?? buildRecordUrl(body.whatsapp_call_id)
  triggerAnalysis(call.id, recordUrl, call.caller, call.called, call.duration, call.direction)

  return NextResponse.json({ received: true, id: call.id })
}

function triggerAnalysis(
  id: string,
  recordUrl: string,
  caller: string,
  called: string,
  duration: number,
  direction: string,
) {
  after(async () => {
    try {
      await updateCallAnalysis(id, { status: 'processing' })

      console.log(`[${id}] Transcribing ${recordUrl}`)
      const transcript = await transcribeAudio(recordUrl)

      console.log(`[${id}] Analyzing transcript`)
      const analysis = await analyzeCall(transcript, { caller, called, duration, direction })

      await updateCallAnalysis(id, {
        transcript,
        summary: analysis.summary,
        closer_briefing: analysis.closer_briefing,
        follow_ups: JSON.stringify(analysis.follow_ups),
        sentiment: analysis.sentiment,
        key_points: JSON.stringify(analysis.key_points),
        whatsapp_msg: analysis.whatsapp_msg,
        qualification: JSON.stringify(analysis.qualification),
        nepq_analysis: JSON.stringify(analysis.nepq_analysis),
        status: 'done',
      })

      console.log(`[${id}] Done`)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error(`[${id}] Error:`, errorMsg)
      await updateCallAnalysis(id, { status: 'error', error: errorMsg })
    }
  })
}

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'wavoip-webhook' })
}

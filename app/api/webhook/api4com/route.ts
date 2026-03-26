import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { upsertCall, updateCallAnalysis } from '@/lib/db'
import { transcribeAudio } from '@/lib/transcribe'
import { analyzeCall } from '@/lib/analyze'

// API4COM webhook payload structure
interface Api4ComWebhookPayload {
  version?: string
  eventType?: string
  callId: string
  direction: 'inbound' | 'outbound'
  caller: string
  called: string
  startedAt: string
  endedAt: string
  duration: number
  hangupCause?: string
  recordUrl?: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Api4ComWebhookPayload

    // Only process calls that have a recording
    if (!body.recordUrl) {
      return NextResponse.json({ received: true, skipped: 'no_recording' })
    }

    // Only process completed calls
    if (body.eventType && body.eventType !== 'channel-hangup') {
      return NextResponse.json({ received: true, skipped: 'not_hangup' })
    }

    const id = randomUUID()

    // Save call to DB immediately as pending
    upsertCall({
      id,
      call_id: body.callId,
      caller: body.caller,
      called: body.called,
      direction: body.direction,
      started_at: body.startedAt,
      ended_at: body.endedAt,
      duration: body.duration,
      record_url: body.recordUrl,
      status: 'pending',
    })

    // Process asynchronously (don't block the webhook response)
    processCall(id, body).catch(err => {
      console.error(`Failed to process call ${id}:`, err)
    })

    return NextResponse.json({ received: true, id })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

async function processCall(id: string, call: Api4ComWebhookPayload) {
  try {
    // Mark as processing
    updateCallAnalysis(id, { status: 'processing' })

    // Step 1: Transcribe audio with Whisper
    console.log(`[${id}] Transcribing audio from ${call.recordUrl}`)
    const transcript = await transcribeAudio(call.recordUrl!)

    // Step 2: Analyze with Claude
    console.log(`[${id}] Analyzing transcript with Claude`)
    const analysis = await analyzeCall(transcript, {
      caller: call.caller,
      called: call.called,
      duration: call.duration,
      direction: call.direction,
    })

    // Step 3: Save results
    updateCallAnalysis(id, {
      transcript,
      summary: analysis.summary,
      closer_briefing: analysis.closer_briefing,
      follow_ups: JSON.stringify(analysis.follow_ups),
      sentiment: analysis.sentiment,
      key_points: JSON.stringify(analysis.key_points),
      status: 'done',
    })

    console.log(`[${id}] Call processed successfully`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`[${id}] Error processing call:`, errorMsg)
    updateCallAnalysis(id, {
      status: 'error',
      error: errorMsg,
    })
  }
}

// Health check
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'api4com-webhook' })
}

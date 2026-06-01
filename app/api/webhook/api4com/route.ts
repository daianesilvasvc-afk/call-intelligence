import { NextRequest, NextResponse, after } from 'next/server'
import { randomUUID } from 'crypto'
import { upsertCall, updateCallAnalysis } from '@/lib/db'
import { transcribeAudio } from '@/lib/transcribe'
import { analyzeCall } from '@/lib/analyze'

export const maxDuration = 60

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

    if (!body.recordUrl) {
      return NextResponse.json({ received: true, skipped: 'no_recording' })
    }

    if (body.duration < 180) {
      return NextResponse.json({ received: true, skipped: 'too_short' })
    }

    const id = randomUUID()

    await upsertCall({
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

    after(async () => {
      try {
        await updateCallAnalysis(id, { status: 'processing' })

        console.log(`[${id}] Transcribing audio from ${body.recordUrl}`)
        const transcript = await transcribeAudio(body.recordUrl!)

        console.log(`[${id}] Analyzing transcript`)
        const analysis = await analyzeCall(transcript, {
          caller: body.caller,
          called: body.called,
          duration: body.duration,
          direction: body.direction,
        })

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

        console.log(`[${id}] Call processed successfully`)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.error(`[${id}] Error processing call:`, errorMsg)
        await updateCallAnalysis(id, { status: 'error', error: errorMsg })
      }
    })

    return NextResponse.json({ received: true, id })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'api4com-webhook' })
}

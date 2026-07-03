import { NextRequest, NextResponse, after } from 'next/server'
import { randomUUID } from 'crypto'
import { upsertCall, updateCallAnalysis, getCallByCallId, getSetting } from '@/lib/db'
import { transcribeAudio } from '@/lib/transcribe'
import { analyzeCall } from '@/lib/analyze'

export const maxDuration = 60

const SDR_NAMES = new Set(['Adriele', 'Luan', 'Nátali'])

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('[3c-webhook] payload:', JSON.stringify(body, null, 2))

    const event = body['call-history-was-created']
    if (!event) return NextResponse.json({ received: true, skipped: 'not_call_history' })

    const h = event.callHistory

    // billed_time = duração real da chamada em segundos; calling_time = tempo de ring
    const duration = h.billed_time ?? h.speaking_time ?? 0
    if (duration < 120) {
      return NextResponse.json({ received: true, skipped: 'too_short', duration })
    }

    if (!h.recorded) {
      return NextResponse.json({ received: true, skipped: 'no_recording' })
    }

    const agentName: string | null = h.agent?.name ?? null
    if (!agentName || !SDR_NAMES.has(agentName)) {
      return NextResponse.json({ received: true, skipped: 'unknown_agent', agentName })
    }

    const callId: string = h._id
    const telephonyId: string = h.telephony_id

    const existing = await getCallByCallId(telephonyId)
    if (existing) return NextResponse.json({ received: true, skipped: 'duplicate' })

    const leadName: string = h.mailing_data?.identifier ?? h.number
    const leadPhone: string = h.number
    const callDate = new Date(h.call_date)
    const endedAt = new Date(callDate.getTime() + duration * 1000)

    const id = randomUUID()
    const recordUrl = `https://app.3c.plus/api/v1/calls/${callId}/recording`

    await upsertCall({
      id,
      call_id: telephonyId,
      caller: agentName,
      called: `${leadName} · ${leadPhone}`,
      direction: 'outbound',
      started_at: callDate.toISOString(),
      ended_at: endedAt.toISOString(),
      duration,
      record_url: recordUrl,
      status: 'pending',
    })

    triggerAnalysis(id, recordUrl, agentName, `${leadName} · ${leadPhone}`, duration, 'outbound')

    return NextResponse.json({ received: true, id })
  } catch (err) {
    console.error('[3c-webhook] error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
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

      const apiToken = await getSetting('threec_api_token')
      const headers: Record<string, string> = apiToken
        ? { Authorization: `Bearer ${apiToken}` }
        : {}

      console.log(`[${id}] Transcribing ${recordUrl}`)
      const transcript = await transcribeAudio(recordUrl, headers)

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
  return NextResponse.json({ status: 'ok', service: '3c-webhook' })
}

import { NextRequest, NextResponse } from 'next/server'
import { getCalls, updateCallAnalysis } from '@/lib/db'
import { transcribeAudio } from '@/lib/transcribe'
import { analyzeCall } from '@/lib/analyze'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const limit = Math.min(parseInt(body?.limit ?? '3', 10), 5)

    // Reseta 'processing' presos → pending (travados de rodadas anteriores)
    const processing = await getCalls(20, 0)
    const stuckProcessing = processing.filter(c => c.status === 'processing')
    for (const c of stuckProcessing) {
      await updateCallAnalysis(c.id, { status: 'pending' })
    }

    // Busca os N mais antigos em pending ou error
    const allCalls = await getCalls(200, 0)
    const toProcess = allCalls
      .filter(c => c.status === 'pending' || c.status === 'error')
      .filter(c => c.record_url)
      .sort((a, b) => a.started_at.localeCompare(b.started_at))
      .slice(0, limit)

    if (!toProcess.length) {
      return NextResponse.json({ processed: 0, message: 'Nenhuma ligação pendente' })
    }

    const results: { id: string; status: string; error?: string }[] = []

    for (const call of toProcess) {
      try {
        await updateCallAnalysis(call.id, { status: 'processing' })

        const transcript = await transcribeAudio(call.record_url)
        const analysis = await analyzeCall(transcript, {
          caller: call.caller,
          called: call.called,
          duration: call.duration,
          direction: call.direction as 'inbound' | 'outbound',
        })

        await updateCallAnalysis(call.id, {
          transcript,
          summary:          analysis.summary,
          closer_briefing:  analysis.closer_briefing,
          follow_ups:       JSON.stringify(analysis.follow_ups),
          sentiment:        analysis.sentiment,
          key_points:       JSON.stringify(analysis.key_points),
          whatsapp_msg:     analysis.whatsapp_msg,
          qualification:    JSON.stringify(analysis.qualification),
          status: 'done',
        })

        results.push({ id: call.id, status: 'done' })
        console.log(`[reprocess] ${call.id} done`)
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        await updateCallAnalysis(call.id, { status: 'error', error })
        results.push({ id: call.id, status: 'error', error })
        console.error(`[reprocess] ${call.id} error:`, error)
      }
    }

    const pendingLeft = allCalls.filter(c => c.status === 'pending' || c.status === 'error').length - results.filter(r => r.status === 'done').length

    return NextResponse.json({
      processed: results.filter(r => r.status === 'done').length,
      failed:    results.filter(r => r.status === 'error').length,
      pendingLeft: Math.max(0, pendingLeft),
      results,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[reprocess] fatal:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// GET retorna quantas estão pendentes
export async function GET() {
  const calls = await getCalls(500, 0)
  const pending   = calls.filter(c => c.status === 'pending').length
  const processing = calls.filter(c => c.status === 'processing').length
  const error     = calls.filter(c => c.status === 'error').length
  return NextResponse.json({ pending, processing, error, total: calls.length })
}

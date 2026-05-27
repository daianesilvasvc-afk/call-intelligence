import { NextRequest, NextResponse, after } from 'next/server'
import { getCallById, updateCallAnalysis, getSetting } from '@/lib/db'
import { transcribeAudio } from '@/lib/transcribe'
import { analyzeCall } from '@/lib/analyze'

export const maxDuration = 60

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const call = await getCallById(id)

  if (!call) return NextResponse.json({ error: 'Ligação não encontrada' }, { status: 404 })
  if (call.status === 'processing') return NextResponse.json({ error: 'Já está sendo processada' }, { status: 409 })
  if (!call.record_url) return NextResponse.json({ error: 'Sem gravação disponível' }, { status: 400 })

  const groqKey = await getSetting('groq_api_key')
  if (!groqKey) return NextResponse.json({ error: 'Groq API key não configurada' }, { status: 400 })

  process.env.GROQ_API_KEY = groqKey

  await updateCallAnalysis(id, { status: 'processing' })

  after(async () => {
    try {
      const transcript = await transcribeAudio(call.record_url)
      const analysis = await analyzeCall(transcript, {
        caller: call.caller,
        called: call.called,
        duration: call.duration,
        direction: call.direction,
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
        status: 'done',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await updateCallAnalysis(id, { status: 'error', error: msg })
    }
  })

  return NextResponse.json({ ok: true, status: 'processing' })
}

import { NextRequest, NextResponse } from 'next/server'
import { getCallById, updateCallAnalysis, getSetting } from '@/lib/db'
import { transcribeAudio } from '@/lib/transcribe'
import { analyzeCall } from '@/lib/analyze'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const call = getCallById(id)

  if (!call) return NextResponse.json({ error: 'Ligação não encontrada' }, { status: 404 })
  if (call.status === 'processing') return NextResponse.json({ error: 'Já está sendo processada' }, { status: 409 })
  if (!call.record_url) return NextResponse.json({ error: 'Sem gravação disponível' }, { status: 400 })

  const groqKey = getSetting('groq_api_key')
  if (!groqKey) return NextResponse.json({ error: 'Groq API key não configurada' }, { status: 400 })

  // Set env for this request (Groq SDK reads from env)
  process.env.GROQ_API_KEY = groqKey

  // Mark as processing immediately
  updateCallAnalysis(id, { status: 'processing' })

  // Process in background
  processCall(id, call.record_url, {
    caller: call.caller,
    called: call.called,
    duration: call.duration,
    direction: call.direction,
  }).catch(console.error)

  return NextResponse.json({ ok: true, status: 'processing' })
}

async function processCall(
  id: string,
  recordUrl: string,
  meta: { caller: string; called: string; duration: number; direction: string }
) {
  try {
    const transcript = await transcribeAudio(recordUrl)
    const analysis = await analyzeCall(transcript, meta)

    updateCallAnalysis(id, {
      transcript,
      summary: analysis.summary,
      closer_briefing: analysis.closer_briefing,
      follow_ups: JSON.stringify(analysis.follow_ups),
      sentiment: analysis.sentiment,
      key_points: JSON.stringify(analysis.key_points),
      whatsapp_msg: analysis.whatsapp_msg,
      status: 'done',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    updateCallAnalysis(id, { status: 'error', error: msg })
  }
}

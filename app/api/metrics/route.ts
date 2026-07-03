import { NextRequest, NextResponse } from 'next/server'
import { getCallsInRange } from '@/lib/db'

export const dynamic = 'force-dynamic'

type NepqJson = {
  score_script?: number
  investigacao?: { nota?: number | string }
  sonho?: { nota?: number | string }
  solucao?: { nota?: number | string }
  agendamento?: { nota?: number | string }
  temperatura?: { classificacao?: string }
  bant?: { score?: number }
}

type QualJson = {
  generated_meeting?: boolean
}

function parseNota(v: number | string | undefined): number | null {
  if (v === undefined || v === null || v === 'NA') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function avg(nums: number[]): number {
  if (!nums.length) return 0
  return +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const today = new Date().toISOString().slice(0, 10)
  const startDate = searchParams.get('startDate') || today
  const endDate = searchParams.get('endDate') || today

  try {
    const calls = await getCallsInRange(startDate, endDate)

    const done = calls.filter(c => c.status === 'done')
    const errors = calls.filter(c => c.status === 'error')
    const totalCalls = calls.length
    const errorRate = totalCalls > 0 ? Math.round(errors.length / totalCalls * 100) : 0
    const avgTma = done.length > 0
      ? Math.round(done.reduce((s, c) => s + c.duration, 0) / done.length)
      : 0

    const parsed = done.map(c => {
      let nepq: NepqJson = {}
      let qual: QualJson = {}
      try { if (c.nepq_analysis) nepq = JSON.parse(c.nepq_analysis) } catch { /* */ }
      try { if (c.qualification) qual = JSON.parse(c.qualification) } catch { /* */ }
      return { call: c, nepq, qual }
    })

    const withScore = parsed.filter(p => typeof p.nepq.score_script === 'number' && p.nepq.score_script > 0)

    const avgScore = Math.round(avg(withScore.map(p => p.nepq.score_script!)))
    const agendTotal = parsed.filter(p => p.qual.generated_meeting === true).length
    const taxaAgendamento = done.length > 0 ? Math.round(agendTotal / done.length * 100) : 0

    const bantNums = parsed.map(p => p.nepq.bant?.score).filter((s): s is number => typeof s === 'number')
    const avgBant = avg(bantNums)

    function avgCriterio(key: keyof Pick<NepqJson, 'investigacao' | 'sonho' | 'solucao' | 'agendamento'>) {
      const notas = parsed.map(p => parseNota(p.nepq[key]?.nota)).filter((n): n is number => n !== null && n > 0)
      return avg(notas)
    }

    const tempCount: Record<string, number> = { FRIO: 0, MORNO: 0, QUENTE: 0, 'PRONTO PRA COMPRAR': 0 }
    for (const { nepq } of parsed) {
      const t = nepq.temperatura?.classificacao
      if (t && t in tempCount) tempCount[t]++
    }
    const tempTotal = Object.values(tempCount).reduce((a, b) => a + b, 0)
    const temperatura = Object.fromEntries(
      Object.entries(tempCount).map(([k, v]) => [k, tempTotal > 0 ? Math.round(v / tempTotal * 100) : 0])
    )

    const sentCount: Record<string, number> = { positivo: 0, neutro: 0, negativo: 0 }
    for (const { call } of parsed) {
      if (call.sentiment && call.sentiment in sentCount) sentCount[call.sentiment]++
    }
    const sentTotal = Object.values(sentCount).reduce((a, b) => a + b, 0)
    const sentiment = Object.fromEntries(
      Object.entries(sentCount).map(([k, v]) => [k, sentTotal > 0 ? Math.round(v / sentTotal * 100) : 0])
    )

    const sdrMap = new Map<string, { total: number; scores: number[]; agend: number; durations: number[] }>()
    for (const { call, nepq, qual } of parsed) {
      const sdr = call.caller
      if (!sdrMap.has(sdr)) sdrMap.set(sdr, { total: 0, scores: [], agend: 0, durations: [] })
      const row = sdrMap.get(sdr)!
      row.total++
      row.durations.push(call.duration)
      if (typeof nepq.score_script === 'number' && nepq.score_script > 0) row.scores.push(nepq.score_script)
      if (qual.generated_meeting) row.agend++
    }

    const bySdr = Array.from(sdrMap.entries())
      .map(([sdr, d]) => ({
        sdr,
        total: d.total,
        avgScore: Math.round(avg(d.scores)),
        agendamentos: d.agend,
        avgTma: d.durations.length > 0 ? Math.round(avg(d.durations)) : 0,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)

    return NextResponse.json({
      totalCalls,
      errorRate,
      avgTma,
      avgScore,
      taxaAgendamento,
      avgBant,
      avgNotas: {
        investigacao: avgCriterio('investigacao'),
        sonho: avgCriterio('sonho'),
        solucao: avgCriterio('solucao'),
        agendamento: avgCriterio('agendamento'),
      },
      temperatura,
      sentiment,
      bySdr,
      startDate,
      endDate,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

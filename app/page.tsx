'use client'

import { useState, useEffect, useCallback, Suspense, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { Call } from '@/lib/db'
import { SDRS } from '@/lib/sdrs'

interface Stats { total: number; today: number; done: number; processing: number }
interface ApiResponse { calls: Call[]; stats: Stats }
interface Settings { wavoip_token: string | null; groq_api_key: string | null }
interface MetricRow {
  sdr: string; date: string
  total: number; connected: number; over50s: number; over3min: number
  hitrate: number; hitrate50: number; hitrate3min: number
  tma: number; totalDuration: number; numDiscado: number
}

function formatDuration(s: number) {
  return `${Math.floor(s / 60)}m ${s % 60}s`
}
function formatDate(d: string) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return null
  const map: Record<string, { label: string; cls: string }> = {
    positivo: { label: '😊 Positivo', cls: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' },
    neutro: { label: '😐 Neutro', cls: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' },
    negativo: { label: '😟 Negativo', cls: 'bg-red-500/20 text-red-400 border border-red-500/30' },
  }
  const s = map[sentiment] || map.neutro
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Aguardando', cls: 'bg-gray-700 text-gray-400' },
    processing: { label: '⏳ Analisando...', cls: 'bg-blue-500/20 text-blue-400 animate-pulse' },
    done: { label: '✓ Pronto', cls: 'bg-emerald-500/20 text-emerald-400' },
    error: { label: 'Erro', cls: 'bg-red-500/20 text-red-400' },
  }
  const s = map[status] || map.pending
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>
}

// ─── Settings Modal ─────────────────────────────────────────────────────────
function SettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [token, setToken] = useState('')
  const [groq, setGroq] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!groq) { setError('Informe a chave Groq'); return }
    setSaving(true)
    setError('')
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wavoip_token: token || undefined, groq_api_key: groq }),
      })
      onSaved()
      onClose()
    } catch {
      setError('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhook/3c`
    : '/api/webhook/3c'

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="font-semibold text-white">Configurações</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <div className="p-6 space-y-5">
          <div className="bg-gray-950 border border-gray-700 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-400 mb-1.5">URL do Webhook — 3C</p>
            <p className="text-xs font-mono text-emerald-400 break-all">{webhookUrl}</p>
            <p className="text-xs text-gray-600 mt-1.5">
              3C → Configurações → Webhooks
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">
              API Key — Groq <span className="text-emerald-400 font-normal">(gratuito)</span>
            </label>
            <input
              type="password"
              value={groq}
              onChange={e => setGroq(e.target.value)}
              placeholder="gsk_..."
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-gray-600 mt-1">
              console.groq.com → API Keys → Create key (grátis)
            </p>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            onClick={save}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-xl py-2.5 transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Copy button ─────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className="text-xs px-3 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-600/30 transition-colors font-medium"
    >
      {copied ? '✓ Copiado!' : '📋 Copiar mensagem'}
    </button>
  )
}

// ─── Call Detail Modal ───────────────────────────────────────────────────────
// ─── Qualification Badge ──────────────────────────────────────────────────────
function QBool({ value, label }: { value: boolean | null; label: string }) {
  const icon = value === true ? '✅' : value === false ? '❌' : '⚠️'
  const cls = value === true
    ? 'text-emerald-400'
    : value === false
    ? 'text-red-400'
    : 'text-yellow-400'
  return (
    <span className={`text-sm ${cls}`}>{icon} {label}</span>
  )
}

// ─── NEPQ helpers ─────────────────────────────────────────────────────────────
function NotaBadge({ nota }: { nota: number | 'NA' | null }) {
  if (nota === null || nota === undefined) return null
  const n = nota === 'NA' ? 'NA' : Number(nota)
  const cls = n === 'NA' ? 'bg-gray-700 text-gray-400'
    : n >= 5 ? 'bg-emerald-500/25 text-emerald-300'
    : n >= 4 ? 'bg-blue-500/25 text-blue-300'
    : n >= 3 ? 'bg-yellow-500/25 text-yellow-300'
    : n >= 1 ? 'bg-red-500/25 text-red-300'
    : 'bg-gray-700/50 text-gray-500'
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>
      {n === 'NA' ? 'NA' : `${n}/5`}
    </span>
  )
}

function BantBadge({ status }: { status: string | null }) {
  if (!status) return null
  const cls = status === 'CONFIRMADO' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
    : status === 'PARCIAL' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
    : status === 'DESQUALIFICADO' ? 'bg-red-500/20 text-red-400 border-red-500/40'
    : 'bg-gray-700 text-gray-400 border-gray-600'
  return <span className={`text-xs font-bold px-2 py-0.5 rounded border ${cls}`}>{status}</span>
}

function TempBadge({ temp }: { temp: string | null }) {
  if (!temp) return null
  const map: Record<string, string> = {
    'FRIO': '❄️ FRIO',
    'MORNO': '🌤 MORNO',
    'QUENTE': '🔥 QUENTE',
    'PRONTO PRA COMPRAR': '✅ PRONTO PRA COMPRAR',
  }
  const cls = temp === 'FRIO' ? 'bg-blue-500/20 text-blue-300'
    : temp === 'MORNO' ? 'bg-yellow-500/20 text-yellow-300'
    : temp === 'QUENTE' ? 'bg-orange-500/20 text-orange-300'
    : 'bg-emerald-500/20 text-emerald-300'
  return <span className={`text-xs font-bold px-3 py-1 rounded-full ${cls}`}>{map[temp] ?? temp}</span>
}

function NepqCriterionBlock({
  label, criterion
}: {
  label: string
  criterion: { nota: number | 'NA'; trecho_principal?: string | null; trecho_oferta?: string | null; feedback: string; sugestao: string | null; prolixidade?: boolean }
}) {
  const trecho = ('trecho_principal' in criterion ? criterion.trecho_principal : null)
    ?? ('trecho_oferta' in criterion ? criterion.trecho_oferta : null)
  return (
    <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
        <NotaBadge nota={criterion.nota} />
      </div>
      {trecho && (
        <p className="text-xs text-gray-400 italic border-l-2 border-gray-600 pl-2 leading-relaxed">{trecho}</p>
      )}
      <p className="text-xs text-gray-300 leading-relaxed">{criterion.feedback}</p>
      {criterion.sugestao && (
        <p className="text-xs text-blue-400 leading-relaxed">🛠 {criterion.sugestao}</p>
      )}
    </div>
  )
}

function CallModal({ call, onClose }: { call: Call; onClose: () => void }) {
  const followUps: string[] = call.follow_ups ? JSON.parse(call.follow_ups) : []
  const keyPoints: string[] = call.key_points ? JSON.parse(call.key_points) : []
  const q = call.qualification ? JSON.parse(call.qualification) : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nepq: any = call.nepq_analysis ? JSON.parse(call.nepq_analysis) : null

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-3xl my-8">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div>
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h2 className="text-lg font-semibold text-white">
                {call.direction === 'outbound' ? `→ ${call.called}` : `← ${call.caller}`}
              </h2>
              <SentimentBadge sentiment={call.sentiment} />
            </div>
            <p className="text-sm text-gray-500">{formatDate(call.started_at)} · {formatDuration(call.duration)}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
        </div>
        <div className="p-6 space-y-6">
          {call.summary && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Resumo</h3>
              <p className="text-gray-300 leading-relaxed">{call.summary}</p>
            </section>
          )}

          {call.whatsapp_msg && (
            <section className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                  💬 WhatsApp · Confirmação Imediata
                </h3>
                <CopyButton text={call.whatsapp_msg} />
              </div>
              <pre className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap font-sans">{call.whatsapp_msg}</pre>
            </section>
          )}

          {keyPoints.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Pontos-chave</h3>
              <ul className="space-y-1.5">
                {keyPoints.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-300 text-sm">
                    <span className="text-blue-400 mt-0.5">•</span>{p}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {/* ── NEPQ + BANT Analysis ── */}
          {nepq && (
            <section className="space-y-4">
              {/* Score + Temperatura */}
              <div className="flex items-center justify-between bg-gray-800/60 border border-gray-700 rounded-xl px-5 py-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">📊 Score do Script</p>
                  <p className={`text-2xl font-bold ${
                    nepq.score_script >= 80 ? 'text-emerald-400'
                    : nepq.score_script >= 60 ? 'text-yellow-400'
                    : 'text-red-400'
                  }`}>{nepq.score_script}%</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">🌡 Temperatura</p>
                  <TempBadge temp={nepq.temperatura?.classificacao} />
                </div>
              </div>

              {/* Critérios NEPQ */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Critérios NEPQ</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {nepq.investigacao && <NepqCriterionBlock label="1 · Investigação da Dor" criterion={nepq.investigacao} />}
                  {nepq.sonho && <NepqCriterionBlock label="2 · Descoberta do Sonho" criterion={nepq.sonho} />}
                  {nepq.solucao && <NepqCriterionBlock label="3 · Apresentação da Solução" criterion={nepq.solucao} />}
                  {nepq.agendamento && <NepqCriterionBlock label="4 · Agendamento" criterion={{ ...nepq.agendamento, trecho_principal: nepq.agendamento.trecho_oferta }} />}
                </div>
              </div>

              {/* Ponto de perda */}
              {nepq.agendamento?.perda_agendamento?.ocorreu && (
                <div className="bg-red-950/40 border border-red-700/50 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-red-400 uppercase tracking-wider">🚨 Ponto de Perda do Agendamento</p>
                  {nepq.agendamento.perda_agendamento.minutagem && (
                    <p className="text-xs text-red-300">⏱ {nepq.agendamento.perda_agendamento.minutagem}</p>
                  )}
                  {nepq.agendamento.perda_agendamento.o_que_aconteceu && (
                    <p className="text-xs text-gray-300">{nepq.agendamento.perda_agendamento.o_que_aconteceu}</p>
                  )}
                  {nepq.agendamento.perda_agendamento.trecho && (
                    <p className="text-xs text-gray-400 italic border-l-2 border-red-700/60 pl-2">{nepq.agendamento.perda_agendamento.trecho}</p>
                  )}
                  {nepq.agendamento.perda_agendamento.causa_raiz && (
                    <p className="text-xs text-red-300">📌 {nepq.agendamento.perda_agendamento.causa_raiz}</p>
                  )}
                  {nepq.agendamento.perda_agendamento.o_que_deveria && (
                    <p className="text-xs text-blue-400">🛠 {nepq.agendamento.perda_agendamento.o_que_deveria}</p>
                  )}
                </div>
              )}

              {/* Prolixidade */}
              {nepq.prolixidade?.detectada && nepq.prolixidade.momentos?.length > 0 && (
                <div className="bg-orange-950/30 border border-orange-700/40 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider">⚠️ Prolixidade Detectada</p>
                  {nepq.prolixidade.momentos.map((m: { minutagem: string; descricao: string; impacto: string; sugestao: string }, i: number) => (
                    <div key={i} className="space-y-1">
                      <p className="text-xs text-orange-300 font-medium">⏱ {m.minutagem}</p>
                      <p className="text-xs text-gray-300">{m.descricao}</p>
                      {m.impacto && <p className="text-xs text-gray-400">Impacto: {m.impacto}</p>}
                      {m.sugestao && <p className="text-xs text-blue-400">🛠 {m.sugestao}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* BANT */}
              {nepq.bant && (
                <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">⚖️ Qualificação BANT</p>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      nepq.bant.score === 4 ? 'bg-emerald-500/20 text-emerald-400'
                      : nepq.bant.score === 3 ? 'bg-blue-500/20 text-blue-400'
                      : nepq.bant.score === 2 ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-red-500/20 text-red-400'
                    }`}>{nepq.bant.score}/4</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { key: 'B', label: 'Budget', pilar: nepq.bant.budget },
                      { key: 'A', label: 'Authority', pilar: nepq.bant.authority },
                      { key: 'N', label: 'Need', pilar: nepq.bant.need },
                      { key: 'T', label: 'Timeline', pilar: nepq.bant.timeline },
                    ].map(({ key, label, pilar }) => (
                      <div key={key} className="bg-gray-900/60 rounded-lg p-2 space-y-1.5">
                        <p className="text-xs text-gray-500">{key} — {label}</p>
                        <BantBadge status={pilar?.status} />
                        {pilar?.trecho && (
                          <p className="text-xs text-gray-500 italic leading-relaxed border-l border-gray-700 pl-1.5">{pilar.trecho}</p>
                        )}
                        {pilar?.observacao && (
                          <p className="text-xs text-gray-400">{pilar.observacao}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  {nepq.bant.recomendacao && (
                    <div className="bg-gray-900/60 rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-1">📌 Recomendação para o Closer</p>
                      <p className="text-xs text-gray-300">{nepq.bant.recomendacao}</p>
                    </div>
                  )}
                </div>
              )}

              {/* DISC + Temperatura detalhada */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {nepq.disc && (
                  <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">🧠 Perfil DISC</p>
                    <span className="inline-block text-xs font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">{nepq.disc.perfil}</span>
                    <p className="text-xs text-gray-300 leading-relaxed">{nepq.disc.explicacao}</p>
                    {nepq.disc.orientacoes && (
                      <p className="text-xs text-blue-400 leading-relaxed">🎯 {nepq.disc.orientacoes}</p>
                    )}
                    {nepq.disc.trechos?.map((t: string, i: number) => (
                      <p key={i} className="text-xs text-gray-500 italic border-l border-gray-700 pl-2">{t}</p>
                    ))}
                  </div>
                )}
                {nepq.temperatura && (
                  <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">🌡 Temperatura do Lead</p>
                    <TempBadge temp={nepq.temperatura.classificacao} />
                    <p className="text-xs text-gray-300 leading-relaxed">{nepq.temperatura.nivel_consciencia}</p>
                    {nepq.temperatura.espontaneidade && (
                      <p className="text-xs text-gray-400 leading-relaxed">{nepq.temperatura.espontaneidade}</p>
                    )}
                    {nepq.temperatura.observacoes && (
                      <p className="text-xs text-yellow-400 leading-relaxed">⚠️ {nepq.temperatura.observacoes}</p>
                    )}
                    {nepq.temperatura.citacoes?.map((c: string, i: number) => (
                      <p key={i} className="text-xs text-gray-500 italic border-l border-gray-700 pl-2">{c}</p>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {call.closer_briefing && (
            <section className="bg-blue-950/30 border border-blue-800/40 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-4">📋 Briefing NEPQ para o Closer</h3>
              <div className="space-y-3">
                {call.closer_briefing.split('\n\n').map((block, i) => {
                  const isSection = /^[💼💡🎯❗✅]/.test(block)
                  if (isSection) {
                    const [title, ...rest] = block.split('\n')
                    return (
                      <div key={i} className="bg-gray-900/60 rounded-lg p-3">
                        <p className="text-sm font-semibold text-white mb-1">{title}</p>
                        <p className="text-gray-300 text-sm leading-relaxed">{rest.join('\n')}</p>
                      </div>
                    )
                  }
                  return <p key={i} className="text-gray-300 text-sm leading-relaxed italic">{block}</p>
                })}
              </div>
            </section>
          )}
          {q && (
            <section className="bg-gray-900/60 border border-gray-700 rounded-xl p-5 space-y-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">🔍 Qualificação do Lead</h3>

              {/* Validações rápidas */}
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <QBool value={q.cnpj_validated} label="CNPJ validado" />
                <QBool value={q.revenue_validated} label="Faturamento validado" />
                <QBool value={q.team_size_validated} label="Equipe validada" />
                {q.revenue_below_10k === true && (
                  <QBool value={q.cash_reserve_validated} label="Caixa para investir validado" />
                )}
              </div>

              {/* Alerta crítico */}
              {q.revenue_below_10k === true && q.cash_reserve_validated !== true && (
                <div className="bg-red-950/40 border border-red-700/50 rounded-lg px-4 py-2.5 text-sm text-red-300 font-medium">
                  ⚠️ REGRA CRÍTICA: Faturamento abaixo de R$10k — caixa para investir não validado
                </div>
              )}

              {/* Citação do budget quando faturamento < R$10k */}
              {q.revenue_below_10k === true && q.cash_reserve_citation && (
                <div className="bg-gray-800/40 rounded-lg px-4 py-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">📌 Evidência — validação do budget</p>
                  <p className="text-xs text-gray-300 italic leading-relaxed border-l-2 border-yellow-600/60 pl-3">
                    {q.cash_reserve_citation}
                  </p>
                </div>
              )}

              {/* Desqualificação */}
              {q.disqualification_reason && (
                <div className="bg-red-950/40 border border-red-700/50 rounded-lg px-4 py-2.5">
                  <p className="text-xs text-red-400 font-semibold uppercase mb-1">Motivo de Desqualificação</p>
                  <p className="text-red-300 text-sm">{q.disqualification_reason}</p>
                </div>
              )}

              {/* Grid de dados */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-0.5">💰 Faturamento mensal</p>
                  <p className="text-white text-sm font-medium">{q.monthly_revenue}</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-0.5">👥 Tamanho da equipe</p>
                  <p className="text-white text-sm font-medium">{q.team_size}</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-0.5">📅 Gerou agendamento?</p>
                  <p className={`text-sm font-medium ${q.generated_meeting ? 'text-emerald-400' : 'text-red-400'}`}>
                    {q.generated_meeting ? '✅ Sim' : '❌ Não'}
                    {q.meeting_note ? ` — ${q.meeting_note}` : ''}
                  </p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-0.5">📊 Maturidade do barbeiro</p>
                  <p className="text-white text-sm font-medium">{q.maturity_level}</p>
                  {q.maturity_justification && (
                    <p className="text-gray-500 text-xs mt-0.5">{q.maturity_justification}</p>
                  )}
                </div>
              </div>

              {/* Queixas */}
              {q.main_complaints?.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">😣 Principal queixa / dificuldade</p>
                  <ul className="space-y-1">
                    {q.main_complaints.map((c: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                        <span className="text-orange-400 mt-0.5">→</span>{c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Decisor */}
              <div className="border border-gray-700 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-2">🧠 Decisor na ligação</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`text-sm font-bold px-3 py-1 rounded-full border ${
                    q.decision_maker === 'CONFIRMADO'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      : q.decision_maker === 'PARCIAL'
                      ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
                      : q.decision_maker === 'DESQUALIFICADO'
                      ? 'bg-red-500/20 text-red-400 border-red-500/40'
                      : 'bg-gray-700 text-gray-400 border-gray-600'
                  }`}>
                    {q.decision_maker}
                  </span>
                  {q.decision_maker_note && (
                    <p className="text-gray-400 text-sm">{q.decision_maker_note}</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {followUps.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Próximos Passos</h3>
              <div className="space-y-2">
                {followUps.map((fu, i) => (
                  <div key={i} className="flex items-start gap-3 bg-gray-800/50 rounded-lg p-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                    <p className="text-gray-300 text-sm">{fu}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
          {call.transcript && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Transcrição completa</h3>
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 max-h-60 overflow-y-auto">
                <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap">{call.transcript}</p>
              </div>
            </section>
          )}
          {call.error && (
            <section className="bg-red-950/30 border border-red-800/40 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1">Erro</h3>
              <p className="text-red-300 text-sm font-mono">{call.error}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Call Row ────────────────────────────────────────────────────────────────
function CallRow({ call, onAnalyze, onView }: {
  call: Call
  onAnalyze: (id: string) => void
  onView: (call: Call) => void
}) {
  const isOut = call.direction === 'outbound'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-sm font-medium text-white">
            {isOut ? `→ ${call.called}` : `← ${call.caller}`}
          </span>
          <StatusBadge status={call.status} />
          <SentimentBadge sentiment={call.sentiment} />
        </div>
        <p className="text-xs text-gray-500">
          {formatDate(call.started_at)} · {formatDuration(call.duration)} · {isOut ? 'Ativa' : 'Receptiva'}
        </p>
        {call.summary && (
          <p className="text-sm text-gray-400 mt-1 line-clamp-1">{call.summary}</p>
        )}
      </div>
      <div className="flex-shrink-0">
        {call.status === 'pending' && (
          <button
            onClick={() => onAnalyze(call.id)}
            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            Analisar
          </button>
        )}
        {call.status === 'done' && (
          <button
            onClick={() => onView(call)}
            className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            Ver resumo
          </button>
        )}
        {call.status === 'error' && (
          <button
            onClick={() => onAnalyze(call.id)}
            className="text-xs bg-red-900/50 hover:bg-red-800/50 text-red-400 px-3 py-1.5 rounded-lg transition-colors"
          >
            Tentar novamente
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Metrics View ────────────────────────────────────────────────────────────
function fmtSec(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

function HitBadge({ value }: { value: number }) {
  const cls = value >= 30 ? 'bg-emerald-500/20 text-emerald-400' : value >= 15 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>{value.toFixed(1)}%</span>
}

function MetricsView({ rows, loading, startDate, endDate, onStartChange, onEndChange, onFetch }: {
  rows: MetricRow[] | null
  loading: boolean
  startDate: string
  endDate: string
  onStartChange: (v: string) => void
  onEndChange: (v: string) => void
  onFetch: () => void
}) {
  return (
    <div>
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        <span className="text-xs text-gray-500 font-medium">Período:</span>
        <input type="date" value={startDate} onChange={e => onStartChange(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 [color-scheme:dark]" />
        <span className="text-xs text-gray-500">até</span>
        <input type="date" value={endDate} onChange={e => onEndChange(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 [color-scheme:dark]" />
        <button onClick={onFetch} disabled={loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
          {loading ? '⏳ Carregando...' : '↻ Carregar métricas'}
        </button>
      </div>

      {!rows && !loading && (
        <p className="text-center text-gray-500 py-20">Selecione o período e clique em "Carregar métricas"</p>
      )}
      {loading && <p className="text-center text-gray-500 py-20">Carregando...</p>}

      {rows && rows.length === 0 && (
        <p className="text-center text-gray-500 py-20">Nenhuma ligação encontrada no período</p>
      )}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/60">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Data</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">SDR</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Total</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Atend. &gt;50s</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Atend. &gt;3min</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">HitRate</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">HR &gt;50s</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">HR &gt;3min</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">TMA</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">T. Total</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">N. Discado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-900/40 transition-colors">
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                    {new Date(r.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 text-white font-medium">{r.sdr}</td>
                  <td className="px-4 py-3 text-right text-white font-bold">{r.total}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{r.over50s}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{r.over3min}</td>
                  <td className="px-4 py-3 text-center"><HitBadge value={r.hitrate} /></td>
                  <td className="px-4 py-3 text-center"><HitBadge value={r.hitrate50} /></td>
                  <td className="px-4 py-3 text-center"><HitBadge value={r.hitrate3min} /></td>
                  <td className="px-4 py-3 text-right text-gray-300 font-mono">{fmtSec(r.tma)}</td>
                  <td className="px-4 py-3 text-right text-gray-300 font-mono">{fmtSec(r.totalDuration)}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{r.numDiscado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500">Carregando...</div>}>
      <Dashboard />
    </Suspense>
  )
}

function Dashboard() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeSdr = searchParams.get('sdr') || ''
  const activeDate = searchParams.get('date') || ''

  const [data, setData] = useState<ApiResponse | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const todayStr = new Date().toISOString().slice(0, 10)
  const [syncStart, setSyncStart] = useState(todayStr)
  const [syncEnd, setSyncEnd] = useState(todayStr)
  const [activeTab, setActiveTab] = useState<'calls' | 'metrics'>('calls')
  const [showSettings, setShowSettings] = useState(false)
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set())
  const [metrics, setMetrics] = useState<MetricRow[] | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [metricsStart, setMetricsStart] = useState(todayStr)
  const [metricsEnd, setMetricsEnd] = useState(todayStr)
  const [reprocessing, setReprocessing] = useState(false)
  const [reprocessResult, setReprocessResult] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)
  const [dateInput, setDateInput] = useState(activeDate)

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (activeSdr) params.set('sdr', activeSdr)
      if (activeDate) params.set('date', activeDate)
      const qs = params.toString() ? `?${params.toString()}` : ''
      const [callsRes, settingsRes] = await Promise.all([
        fetch(`/api/calls${qs}`),
        fetch('/api/settings'),
      ])
      if (callsRes.ok) setData(await callsRes.json())
      if (settingsRes.ok) setSettings(await settingsRes.json())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [activeSdr, activeDate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: syncStart, endDate: syncEnd }),
      })
      const json = await res.json()
      if (json.error) {
        setSyncResult(`Erro: ${json.error}`)
      } else {
        const parts = [`✓ ${json.imported} novas importadas`]
        if (json.skipped > 0) parts.push(`${json.skipped} já existentes`)
        if (json.notSdr > 0) parts.push(`${json.notSdr} ignoradas`)
        setSyncResult(parts.join(' · '))
        fetchData()
      }
    } catch {
      setSyncResult('Erro de conexão')
    } finally {
      setSyncing(false)
    }
  }

  async function handleReprocess() {
    setReprocessing(true)
    setReprocessResult(null)
    try {
      const res = await fetch('/api/reprocess-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 3 }),
      })
      const json = await res.json()
      if (json.error) {
        setReprocessResult(`Erro: ${json.error}`)
      } else if (json.processed === 0 && json.failed === 0) {
        setReprocessResult('Nenhuma ligação pendente')
      } else {
        const parts = []
        if (json.processed > 0) parts.push(`✓ ${json.processed} processadas`)
        if (json.failed > 0) parts.push(`✗ ${json.failed} com erro`)
        if (json.pendingLeft > 0) parts.push(`${json.pendingLeft} ainda pendentes`)
        setReprocessResult(parts.join(' · '))
        fetchData()
      }
    } catch {
      setReprocessResult('Erro de conexão')
    } finally {
      setReprocessing(false)
    }
  }

  async function handleClearPending() {
    if (!confirm(`Deletar todos os ${stats?.processing ?? ''} pendentes? Essa ação não pode ser desfeita.`)) return
    setClearing(true)
    try {
      await fetch('/api/clear-pending', { method: 'POST' })
      fetchData()
    } finally {
      setClearing(false)
    }
  }

  async function handleClearAll() {
    if (!confirm('Deletar TODO o histórico de ligações? Essa ação não pode ser desfeita.')) return
    setClearingAll(true)
    try {
      await fetch('/api/clear-all', { method: 'POST' })
      fetchData()
    } finally {
      setClearingAll(false)
    }
  }

  async function fetchMetrics() {
    setMetricsLoading(true)
    try {
      const res = await fetch(`/api/metrics?startDate=${metricsStart}&endDate=${metricsEnd}`)
      const json = await res.json()
      if (json.rows) setMetrics(json.rows)
    } finally {
      setMetricsLoading(false)
    }
  }

  async function handleAnalyze(id: string) {
    setAnalyzingIds(prev => new Set(prev).add(id))
    try {
      await fetch(`/api/calls/${id}/analyze`, { method: 'POST' })
    } finally {
      setAnalyzingIds(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  function buildUrl(sdr: string, date: string) {
    const p = new URLSearchParams()
    if (sdr) p.set('sdr', sdr)
    if (date) p.set('date', date)
    return p.toString() ? `/?${p.toString()}` : '/'
  }

  const isConfigured = settings?.groq_api_key
  const calls = data?.calls ?? []
  const stats = data?.stats
  const hasProcessing = calls.some(c => c.status === 'processing')

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">CI</div>
            <div>
              <h1 className="font-semibold text-white">Call Intelligence</h1>
              <p className="text-xs text-gray-500">Transcrição e análise por IA · 100% gratuito</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasProcessing && <span className="text-xs text-blue-400 animate-pulse">● Processando</span>}
            <button
              onClick={() => setShowSettings(true)}
              className="text-xs text-gray-500 hover:text-gray-300 px-3 py-1.5 rounded-lg border border-gray-800 hover:border-gray-600 transition-colors"
            >
              ⚙ Configurações
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Tab switcher */}
        <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
          <button
            onClick={() => setActiveTab('calls')}
            className={`text-sm px-4 py-1.5 rounded-lg font-medium transition-colors ${activeTab === 'calls' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Ligações
          </button>
          <button
            onClick={() => setActiveTab('metrics')}
            className={`text-sm px-4 py-1.5 rounded-lg font-medium transition-colors ${activeTab === 'metrics' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Métricas
          </button>
        </div>

        {/* Metrics tab */}
        {activeTab === 'metrics' && (
          <MetricsView
            rows={metrics}
            loading={metricsLoading}
            startDate={metricsStart}
            endDate={metricsEnd}
            onStartChange={setMetricsStart}
            onEndChange={setMetricsEnd}
            onFetch={fetchMetrics}
          />
        )}

        {activeTab === 'calls' && <>
        {/* Filters */}
        <div className="flex flex-col gap-3 mb-6">
          {/* SDR filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => router.push(buildUrl('', activeDate))}
              className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                !activeSdr
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
              }`}
            >
              Todos
            </button>
            {SDRS.map(sdr => (
              <button
                key={sdr.email}
                onClick={() => router.push(buildUrl(sdr.name, activeDate))}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                  activeSdr === sdr.name
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
                }`}
              >
                {sdr.name.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* Date filter */}
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={activeDate}
              onChange={e => setDateInput(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 [color-scheme:dark]"
            />
            <button
              onClick={() => { router.push(buildUrl(activeSdr, dateInput)); fetchData() }}
              className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg transition-colors font-medium"
            >
              Buscar
            </button>
            {activeDate && (
              <button
                onClick={() => { setDateInput(''); router.push(buildUrl(activeSdr, '')); fetchData() }}
                className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1.5 rounded-lg border border-gray-800 hover:border-gray-600 transition-colors"
              >
                ✕ Limpar data
              </button>
            )}
          </div>
        </div>

        {/* Setup banner */}
        {!loading && !isConfigured && (
          <div className="bg-blue-950/30 border border-blue-800/40 rounded-2xl p-6 mb-8 text-center">
            <p className="text-blue-300 font-medium mb-1">Configure as credenciais para começar</p>
            <p className="text-blue-400/70 text-sm mb-4">Você precisará de uma chave Groq gratuita e configurar o webhook no Wavoip</p>
            <button
              onClick={() => setShowSettings(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2 rounded-xl transition-colors"
            >
              Configurar agora
            </button>
          </div>
        )}

        {/* Stats */}
        {stats && stats.total > 0 && (
          <div className="mb-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total', value: stats.total },
                { label: 'Hoje', value: stats.today },
                { label: 'Analisadas', value: stats.done },
                { label: 'Aguardando', value: stats.processing },
              ].map(s => (
                <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                  <p className="text-2xl font-bold text-white">{s.value}</p>
                </div>
              ))}
            </div>
            {/* Botão reprocessar: só aparece quando há pendentes */}
            {stats.processing > 0 && (
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={handleReprocess}
                  disabled={reprocessing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ background: '#1e2d45', color: '#93c5fd', border: '1px solid #2d4a6e' }}
                >
                  {reprocessing ? (
                    <>
                      <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      Processando…
                    </>
                  ) : (
                    <>⟳ Reprocessar pendentes ({stats.processing})</>
                  )}
                </button>
                <button
                  onClick={handleClearPending}
                  disabled={clearing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ background: '#2d1a1a', color: '#f87171', border: '1px solid #5a2a2a' }}
                >
                  {clearing ? 'Deletando...' : '🗑 Limpar pendentes'}
                </button>
                <button
                  onClick={handleClearAll}
                  disabled={clearingAll}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ background: '#2d1a1a', color: '#f87171', border: '1px solid #5a2a2a' }}
                >
                  {clearingAll ? 'Deletando...' : '🗑 Limpar histórico'}
                </button>
                {reprocessResult && (
                  <span className="text-xs text-gray-400">{reprocessResult}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Webhook info bar */}
        {isConfigured && (
          <div className="flex items-center gap-3 mb-6 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
            <span className="text-xs text-gray-500 shrink-0">Webhook ativo:</span>
            <span className="text-xs font-mono text-emerald-400 truncate">/api/webhook/3c</span>
            <span className="ml-auto text-xs text-gray-600">As ligações chegam automaticamente pelo 3C</span>
          </div>
        )}

        {/* Calls list */}
        {loading ? (
          <p className="text-center text-gray-500 py-20">Carregando...</p>
        ) : calls.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-3">📞</p>
            <p className="text-gray-400 font-medium">Nenhuma ligação ainda</p>
            <p className="text-gray-600 text-sm mt-1">
              {isConfigured ? 'Aguardando ligações pelo webhook do 3C' : 'Configure as credenciais primeiro'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {calls.map(call => (
              <CallRow
                key={call.id}
                call={analyzingIds.has(call.id) ? { ...call, status: 'processing' } : call}
                onAnalyze={handleAnalyze}
                onView={setSelectedCall}
              />
            ))}
          </div>
        )}
        </>}
      </main>

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} onSaved={fetchData} />
      )}
      {selectedCall && (
        <CallModal call={selectedCall} onClose={() => setSelectedCall(null)} />
      )}
    </div>
  )
}

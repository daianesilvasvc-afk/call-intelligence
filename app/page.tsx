'use client'

import { useState, useEffect, useCallback, Suspense, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { Call } from '@/lib/db'
import { SDRS } from '@/lib/sdrs'

interface Stats { total: number; today: number; done: number; processing: number }
interface ApiResponse { calls: Call[]; stats: Stats }
interface Settings { api4com_token: string | null; groq_api_key: string | null }

function formatDuration(s: number) {
  return `${Math.floor(s / 60)}m ${s % 60}s`
}
function formatDate(d: string) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
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
    if (!token || !groq) { setError('Preencha os dois campos'); return }
    setSaving(true)
    setError('')
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api4com_token: token, groq_api_key: groq }),
      })
      onSaved()
      onClose()
    } catch {
      setError('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="font-semibold text-white">Configurações</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">
              API Token — API4COM
            </label>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Bearer token da API4COM"
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-gray-600 mt-1">
              Painel API4COM → Usuários → Tokens de acesso
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
function CallModal({ call, onClose }: { call: Call; onClose: () => void }) {
  const followUps: string[] = call.follow_ups ? JSON.parse(call.follow_ups) : []
  const keyPoints: string[] = call.key_points ? JSON.parse(call.key_points) : []

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
  const [showSettings, setShowSettings] = useState(false)
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set())

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
    const t = setInterval(fetchData, 8000)
    return () => clearInterval(t)
  }, [fetchData])

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const json = await res.json()
      if (json.error) {
        setSyncResult(`Erro: ${json.error}`)
      } else {
        const parts = [`✓ ${json.imported} novas ligações importadas`]
        if (json.skipped > 0) parts.push(`${json.skipped} já existentes`)
        if (json.notSdr > 0) parts.push(`${json.notSdr} de outros usuários ignoradas`)
        setSyncResult(parts.join(' · '))
        fetchData()
      }
    } catch {
      setSyncResult('Erro de conexão')
    } finally {
      setSyncing(false)
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

  const isConfigured = settings?.api4com_token && settings?.groq_api_key
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
              onChange={e => router.push(buildUrl(activeSdr, e.target.value))}
              className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 [color-scheme:dark]"
            />
            {activeDate && (
              <button
                onClick={() => router.push(buildUrl(activeSdr, ''))}
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
            <p className="text-blue-400/70 text-sm mb-4">Você precisará do token da API4COM e de uma chave Groq gratuita</p>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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
        )}

        {/* Sync bar */}
        {isConfigured && (
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors flex items-center gap-2"
            >
              {syncing ? '⏳ Sincronizando...' : '↻ Sincronizar ligações da API4COM'}
            </button>
            {syncResult && <p className="text-sm text-gray-400">{syncResult}</p>}
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
              {isConfigured ? 'Clique em "Sincronizar" para buscar suas ligações' : 'Configure as credenciais primeiro'}
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

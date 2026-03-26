import Groq from 'groq-sdk'

function getGroq() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY })
}

export interface CallAnalysis {
  summary: string
  closer_briefing: string
  follow_ups: string[]
  sentiment: 'positivo' | 'neutro' | 'negativo'
  key_points: string[]
}

export async function analyzeCall(
  transcript: string,
  callMeta: { caller: string; called: string; duration: number; direction: string }
): Promise<CallAnalysis> {
  const min = Math.floor(callMeta.duration / 60)
  const sec = callMeta.duration % 60

  const prompt = `Você é um especialista em análise de ligações comerciais de SDR com expertise na metodologia NEPQ (Neuro-Emotional Persuasion Questioning).

Analise a transcrição abaixo e retorne APENAS um JSON válido (sem markdown, sem texto fora do JSON):

Metadados:
- De: ${callMeta.caller} | Para: ${callMeta.called}
- Duração: ${min}min ${sec}s | ${callMeta.direction === 'outbound' ? 'Ligação ativa' : 'Ligação receptiva'}

Transcrição:
${transcript}

JSON esperado:
{
  "summary": "Resumo em 2-4 frases do que aconteceu na ligação",
  "closer_briefing": "Parágrafo inicial com perfil completo do lead (nome, cargo, contexto identificado).\\n\\n💼 Estrutura Atual da Barbearia:\\n[descreva o que foi identificado sobre a estrutura atual do negócio do lead — número de cadeiras, profissionais, modelo de atendimento, ferramentas usadas hoje, etc.]\\n\\n💡 Desempenho Atual e Indicadores:\\n[descreva o que o lead compartilhou sobre resultados atuais — faturamento mencionado, ticket médio, volume de clientes, principais desafios operacionais ou financeiros]\\n\\n🎯 Objetivo com a Reunião:\\n[qual é a expectativa do lead para a videochamada? O que ele quer resolver ou entender? Qual promessa ou dor motivou o agendamento?]\\n\\n❗ Ponto de Atenção:\\n[principais objeções, resistências, pontos sensíveis ou riscos identificados na ligação que o closer deve estar preparado para contornar]\\n\\n✅ Oportunidade para o Closer:\\n[qual é o principal gancho de vendas? Qual dor ou desejo foi mais forte? Como o closer deve abrir a reunião para criar conexão imediata com esse lead?]",
  "follow_ups": ["ação de follow-up 1", "ação de follow-up 2", "ação de follow-up 3"],
  "sentiment": "positivo",
  "key_points": ["ponto-chave 1", "ponto-chave 2", "ponto-chave 3"]
}

IMPORTANTE: O campo "sentiment" deve ser exatamente uma dessas palavras: positivo, neutro ou negativo.
Substitua os textos entre colchetes [ ] pelo conteúdo real extraído da transcrição.
Se alguma informação não foi mencionada na ligação, escreva "Não mencionado na ligação".`

  const response = await getGroq().chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 2048,
  })

  const text = response.choices[0]?.message?.content?.trim() ?? ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`JSON não encontrado na resposta: ${text.slice(0, 200)}`)

  const analysis = JSON.parse(jsonMatch[0]) as CallAnalysis
  if (!analysis.summary || !analysis.closer_briefing || !Array.isArray(analysis.follow_ups)) {
    throw new Error('Estrutura de análise inválida')
  }

  return analysis
}

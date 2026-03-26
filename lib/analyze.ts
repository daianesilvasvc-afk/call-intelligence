import Groq from 'groq-sdk'

function getGroq() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY })
}

export interface Qualification {
  cnpj_validated: boolean | null
  revenue_validated: boolean | null
  team_size_validated: boolean | null
  revenue_below_10k: boolean | null
  cash_reserve_validated: boolean | null
  disqualification_reason: string | null
  monthly_revenue: string
  team_size: string
  main_complaints: string[]
  generated_meeting: boolean
  meeting_note: string
  maturity_level: 'Baixo (Operacional)' | 'Médio (Dono de Cadeira)' | 'Alto (Empreendedor)' | 'Não identificado'
  maturity_justification: string
  decision_maker: 'CONFIRMADO' | 'PARCIAL' | 'NÃO MAPEADO' | 'DESQUALIFICADO'
  decision_maker_note: string
}

export interface CallAnalysis {
  summary: string
  closer_briefing: string
  follow_ups: string[]
  sentiment: 'positivo' | 'neutro' | 'negativo'
  key_points: string[]
  whatsapp_msg: string
  qualification: Qualification
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
  "summary": "Resumo em 2-4 frases do que aconteceu na ligação, destacando o perfil do lead, principal dor relatada e resultado do agendamento.",

  "closer_briefing": "Parágrafo inicial com perfil completo do lead (nome, cargo, contexto identificado).\\n\\n💼 Estrutura Atual da Barbearia:\\n[descreva o que foi identificado sobre a estrutura atual do negócio do lead — número de cadeiras, profissionais, modelo de atendimento, ferramentas usadas hoje, etc.]\\n\\n💰 Momento Financeiro:\\n[faturamento mencionado ou estimado, ticket médio, volume de clientes, se está crescendo ou estagnado, principais perdas financeiras identificadas — ex: falta de recorrência, dependência do dono, baixo ticket, inadimplência, etc.]\\n\\n😣 Dores Principais (NEPQ):\\n[liste as dores emocionais e práticas verbalizadas pelo lead — use as próprias palavras dele sempre que possível. Inclua dores de problema (o que incomoda hoje), dores de implicação (consequências que ele já percebe) e dores de solução (o que ele quer alcançar). Priorize as mais fortes.]\\n\\n🎯 Objetivo com a Reunião:\\n[qual é a expectativa do lead para a videochamada? O que ele quer resolver ou entender? Qual promessa ou dor motivou o agendamento?]\\n\\n❗ Ponto de Atenção:\\n[principais objeções, resistências, pontos sensíveis ou riscos identificados na ligação que o closer deve estar preparado para contornar]\\n\\n✅ Oportunidade para o Closer:\\n[qual é o principal gancho de vendas? Qual dor ou desejo foi mais forte? Como o closer deve abrir a reunião para criar conexão imediata com esse lead?]",

  "whatsapp_msg": "Oi [primeiro nome do lead]! Confirmado aqui 👇\\n📅 [dia da semana], [data por extenso] às [horário]\\n👤 Você vai conversar com o [Nome do Especialista]\\n🔗 [link Google Meet]\\n\\nO [Nome do Especialista] é especialista em estruturação de barbearias — ele já ajudou donos exatamente no cenário que você me descreveu a criar previsibilidade e sair da dependência total da própria presença.\\n\\nEle vai chegar preparado pra falar especificamente sobre [insira aqui a dor principal do lead extraída da ligação, de forma direta e pessoal] — não é uma apresentação, é uma conversa sobre o seu negócio.\\n\\nQualquer coisa antes, me chama aqui. Ele vai estar te esperando! 🤝",

  "follow_ups": ["ação de follow-up 1", "ação de follow-up 2", "ação de follow-up 3"],
  "sentiment": "positivo",
  "key_points": ["ponto-chave 1", "ponto-chave 2", "ponto-chave 3"],

  "qualification": {
    "cnpj_validated": true,
    "revenue_validated": true,
    "team_size_validated": false,
    "revenue_below_10k": false,
    "cash_reserve_validated": null,
    "disqualification_reason": null,
    "monthly_revenue": "R$ 25.000",
    "team_size": "4 barbeiros",
    "main_complaints": ["dificuldade para reter clientes", "depende da presença do dono"],
    "generated_meeting": true,
    "meeting_note": "Reunião agendada para quinta-feira às 14h",
    "maturity_level": "Médio (Dono de Cadeira)",
    "maturity_justification": "Tem visão de crescimento mas ainda opera no operacional",
    "decision_maker": "CONFIRMADO",
    "decision_maker_note": "É o dono e demonstrou autonomia total para decidir"
  }
}

REGRAS IMPORTANTES:
- "sentiment" deve ser exatamente: positivo, neutro ou negativo.
- No campo "whatsapp_msg": substitua APENAS [primeiro nome do lead], [dia da semana], [data por extenso], [horário] e [dor principal do lead] com o que foi extraído da transcrição. Mantenha [Nome do Especialista] e [link Google Meet] como estão (serão preenchidos manualmente).
- Se data/horário do agendamento não foi mencionado na ligação, deixe como [data e horário a confirmar].
- Se alguma informação do briefing não foi mencionada, escreva "Não mencionado na ligação".
- Use as próprias palavras do lead nas dores — não generalize.
- No campo "qualification":
  • cnpj_validated/revenue_validated/team_size_validated: true se o SDR perguntou e obteve resposta, false se perguntou mas não obteve, null se não perguntou.
  • revenue_below_10k: true se faturamento mencionado < R$10.000, false se >= R$10.000, null se não mencionado.
  • cash_reserve_validated: true/false se o SDR perguntou sobre caixa (apenas quando revenue_below_10k = true), null nos demais casos.
  • disqualification_reason: null se lead está qualificado, caso contrário descreva o motivo.
  • monthly_revenue: valor exato mencionado ou "não identificado".
  • team_size: número mencionado ou "não citado".
  • main_complaints: array com as dificuldades reais relatadas (mínimo 1, máximo 5).
  • generated_meeting: true se agendamento confirmado, false se não.
  • maturity_level: exatamente um de: "Baixo (Operacional)", "Médio (Dono de Cadeira)", "Alto (Empreendedor)", "Não identificado".
  • decision_maker: exatamente um de: "CONFIRMADO", "PARCIAL", "NÃO MAPEADO", "DESQUALIFICADO".`

  const response = await getGroq().chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 2500,
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

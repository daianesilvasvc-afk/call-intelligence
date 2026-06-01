import Groq from 'groq-sdk'

function getGroq() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY })
}

// ─── Qualification (backward compat with existing UI) ─────────────────────────
export interface Qualification {
  cnpj_validated: boolean | null
  revenue_validated: boolean | null
  team_size_validated: boolean | null
  revenue_below_10k: boolean | null
  cash_reserve_validated: boolean | null
  cash_reserve_citation: string | null
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

// ─── NEPQ + BANT Analysis ─────────────────────────────────────────────────────
export interface BantPilar {
  status: 'CONFIRMADO' | 'PARCIAL' | 'NÃO MAPEADO' | 'DESQUALIFICADO'
  trecho: string | null
  observacao: string
}

export interface NepqAnalysis {
  score_script: number
  investigacao: {
    nota: number | 'NA'
    minutagem: string | null
    trecho_principal: string | null
    problemas_identificados: string[]
    trecho_desdobramento: string | null
    dor_espontanea: boolean | null
    aprofundamento: string
    feedback: string
    sugestao: string | null
  }
  sonho: {
    nota: number | 'NA'
    minutagem: string | null
    trecho_principal: string | null
    sonhos_identificados: string[]
    trecho_desdobramento: string | null
    aprofundamento: string
    feedback: string
    sugestao: string | null
  }
  solucao: {
    nota: number | 'NA'
    minutagem: string | null
    trecho_retomada_dor: string | null
    trecho_entregavel: string | null
    trecho_desdobramento: string | null
    feedback: string
    sugestao: string | null
  }
  agendamento: {
    nota: number | 'NA'
    minutagem: string | null
    trecho_oferta: string | null
    agendamento_gerado: boolean
    fechamento_qualidade: string | null
    feedback: string
    sugestao: string | null
    perda_agendamento: {
      ocorreu: boolean
      minutagem: string | null
      o_que_aconteceu: string | null
      trecho: string | null
      causa_raiz: string | null
      o_que_deveria: string | null
    }
  }
  bant: {
    budget: BantPilar
    authority: BantPilar
    need: BantPilar & { dor_espontanea: boolean | null }
    timeline: BantPilar
    score: number
    recomendacao: string
  }
  disc: {
    perfil: 'DOMINANTE' | 'INFLUENTE' | 'ESTÁVEL' | 'CONFORME' | 'MISTO'
    explicacao: string
    orientacoes: string
    trechos: string[]
  }
  temperatura: {
    classificacao: 'FRIO' | 'MORNO' | 'QUENTE' | 'PRONTO PRA COMPRAR'
    nivel_consciencia: string
    motivo: string
    espontaneidade: string
    citacoes: string[]
    observacoes: string
  }
  prolixidade: {
    detectada: boolean
    momentos: Array<{ minutagem: string; descricao: string; impacto: string; sugestao: string }>
  }
}

export interface CallAnalysis {
  summary: string
  closer_briefing: string
  follow_ups: string[]
  sentiment: 'positivo' | 'neutro' | 'negativo'
  key_points: string[]
  whatsapp_msg: string
  qualification: Qualification
  nepq_analysis: NepqAnalysis
}

// ─── Main function ────────────────────────────────────────────────────────────
export async function analyzeCall(
  transcript: string,
  callMeta: { caller: string; called: string; duration: number; direction: string }
): Promise<CallAnalysis> {
  const min = Math.floor(callMeta.duration / 60)
  const sec = callMeta.duration % 60

  const prompt = `Você é um analista especialista em pré-vendas treinado no método NEPQ (Neuro-Emotional Persuasion Questioning) e BANT. Sua missão é avaliar a performance do SDR com base na transcrição da ligação e gerar um relatório estruturado, objetivo e acionável.

Você NÃO é um agente de elogios. Você é um auditor de qualidade. Identifique falhas reais com precisão. Notas altas são exceção — exigem evidência explícita na transcrição.

━━━ REGRAS GLOBAIS ━━━

REGRA 1 — ESPONTANEIDADE DA DOR
Deixe claro o que o lead disse de forma ESPONTÂNEA versus INDUZIDO pelo SDR. Dores induzidas reduzem a validade do critério e a nota. Resposta a pergunta fechada = induzida. Verbalização após pergunta aberta ou sem provocação = espontânea.

REGRA 2 — LINHA LÓGICA
Todos os critérios devem estar conectados ao MESMO problema principal identificado. Se a dor principal muda entre critérios, isso é inconsistência — indique explicitamente.

REGRA 3 — CITAÇÕES OBRIGATÓRIAS
Todo trecho citado deve ser LITERAL, máx. 30 palavras. Formato: "🟢 SDR [MM:SS]: \"frase\"" ou "🟣 CLIENTE [MM:SS]: \"frase\"". Ausência de trecho = ausência de evidência. NÃO cite trechos vagos como prova de execução.

REGRA 4 — LIGAÇÃO INTERROMPIDA
Se a ligação cair antes do fim do script: atribua "NA" para etapas não iniciadas. Calcule o Score proporcional apenas sobre as etapas realizadas.

REGRA 7 — RIGOR ANTI-LENIÊNCIA
→ Nota 5: evidência explícita de profundidade, personalização real e conexão clara com a situação do lead.
→ Nota 4: execução correta com trecho que prova, com apenas UM ponto faltante identificável.
→ Nota 3 ou menos: etapa iniciada mas não aprofundada, executada mecanicamente ou sem personalização.
→ Em dúvida entre duas notas: escolha a MENOR.
→ Etapa genérica (poderia ser dita a qualquer lead): nota máxima 2.
→ Sem trecho que prove a execução: nota 0.
→ Fluência, simpatia e boa dicção NÃO elevam a nota.

REGRA 8 — PROLIXIDADE DO SDR
Identifique e aponte com minutagem se o SDR:
→ Explica o produto antes de entender a dor
→ Repete informação mais de uma vez na mesma etapa
→ Usa mais de 3 frases seguidas sem fazer pergunta
→ Responde objeção com discurso longo em vez de pergunta cirúrgica
→ Preenche silêncio com mais conteúdo em vez de escuta
→ Introdução passa de 60 segundos sem engajar o lead

REGRA 9 — PONTO DE PERDA DO AGENDAMENTO
Se a ligação NÃO gerou agendamento por falha do SDR (não por desqualificação legítima do lead), identifique o momento exato.
Não é falha do SDR: lead sem CNPJ, sem caixa declarado, desqualificado por perfil, ligação caiu.
É falha do SDR: não fez oferta clara, recuou na primeira objeção, não criou urgência, deixou "em aberto", aceitou "vou pensar" sem qualificar.

REGRA SCORE — ANTI-LENIÊNCIA:
→ Cada etapa AUSENTE desconta no mínimo 15% do score total.
→ Etapa genérica sem personalização vale no máximo 50% do peso daquela etapa.
→ Score > 80%: TODAS as etapas realizadas com evidência explícita de personalização.
→ Score > 90%: reservado para ligações onde o SDR conectou todas as etapas à dor real, aplicou BANT completo e agendou com personalização real.

━━━ ESCALA DE NOTAS (todos os critérios) ━━━
5 → Excelência: trecho prova profundidade real, personalização e conexão com contexto do lead.
4 → Bom: evidência clara, faltou profundidade ou personalização em exatamente UM ponto.
3 → Regular: iniciou mas não aprofundou, ou executou mecanicamente.
2 → Fraco: superficial, genérico ou fora de ordem.
1 → Muito fraco: tentativa identificável mas sem resultado prático.
0 → Ausente: etapa não realizada. Sem trecho que evidencie.
NA → Não aplicável (ligação interrompida antes dessa etapa).

━━━ METADADOS DA LIGAÇÃO ━━━
De: ${callMeta.caller} | Para: ${callMeta.called}
Duração: ${min}min ${sec}s | ${callMeta.direction === 'outbound' ? 'Ligação ativa (SDR ligou)' : 'Ligação receptiva (lead ligou)'}

━━━ TRANSCRIÇÃO ━━━
${transcript}

━━━ INSTRUÇÃO DE SAÍDA ━━━
Retorne APENAS um JSON válido (sem markdown, sem texto fora do JSON).

JSON esperado (preencha todos os campos com base na transcrição):

{
  "summary": "Resumo em 2-4 frases: perfil do lead, principal dor relatada, resultado do agendamento.",

  "closer_briefing": "Perfil completo do lead (nome, cargo, contexto).\\n\\n💼 Estrutura Atual:\\n[estrutura do negócio: cadeiras, profissionais, ferramentas usadas]\\n\\n💰 Momento Financeiro:\\n[faturamento, ticket médio, crescimento ou estagnação, perdas]\\n\\n😣 Dores Principais (NEPQ — use as próprias palavras do lead):\\n[dores de problema, implicação e solução identificadas]\\n\\n🎯 Objetivo com a Reunião:\\n[expectativa do lead para a videochamada]\\n\\n❗ Ponto de Atenção:\\n[objeções, resistências, riscos para o closer]\\n\\n✅ Oportunidade para o Closer:\\n[principal gancho de vendas, como abrir a reunião]\\n\\n📊 BANT Resumido:\\n[B: status] | [A: status] | [N: status] | [T: status]\\n\\n🌡 Temperatura: [classificação] — [motivo em 1 frase]",

  "whatsapp_msg": "Oi [primeiro nome do lead]! Confirmado aqui 👇\\n📅 [dia da semana], [data por extenso] às [horário]\\n👤 Você vai conversar com o [Nome do Especialista]\\n🔗 [link Google Meet]\\n\\nO [Nome do Especialista] é especialista em estruturação de barbearias — ele já ajudou donos exatamente no cenário que você me descreveu a criar previsibilidade e sair da dependência total da própria presença.\\n\\nEle vai chegar preparado pra falar especificamente sobre [dor principal do lead extraída da ligação] — não é uma apresentação, é uma conversa sobre o seu negócio.\\n\\nQualquer coisa antes, me chama aqui. Ele vai estar te esperando! 🤝",

  "follow_ups": ["ação de follow-up 1", "ação de follow-up 2", "ação de follow-up 3"],
  "sentiment": "positivo",
  "key_points": ["ponto-chave 1", "ponto-chave 2", "ponto-chave 3"],

  "nepq_analysis": {
    "score_script": 70,

    "investigacao": {
      "nota": 3,
      "minutagem": "02:15",
      "trecho_principal": "🟣 CLIENTE [2:15]: \"frase literal do lead sobre a dor\"",
      "problemas_identificados": ["problema 1 identificado", "problema 2"],
      "trecho_desdobramento": "🟢 SDR [3:00]: \"pergunta de aprofundamento\"",
      "dor_espontanea": true,
      "aprofundamento": "Descrição do que o SDR conseguiu extrair com suas provocações. Se fraco, diga explicitamente.",
      "feedback": "Feedback direto e objetivo. Aponte o erro específico se houver.",
      "sugestao": "Sugestão prática se nota < 5, null se nota = 5."
    },

    "sonho": {
      "nota": 2,
      "minutagem": null,
      "trecho_principal": null,
      "sonhos_identificados": [],
      "trecho_desdobramento": null,
      "aprofundamento": "Não investigado na ligação.",
      "feedback": "Feedback direto.",
      "sugestao": "Sugestão prática."
    },

    "solucao": {
      "nota": 3,
      "minutagem": "07:00",
      "trecho_retomada_dor": "🟢 SDR [7:00]: \"retomada da dor antes de apresentar solução\"",
      "trecho_entregavel": "🟢 SDR [7:30]: \"explicação do entregável\"",
      "trecho_desdobramento": null,
      "feedback": "Feedback direto.",
      "sugestao": "Sugestão prática."
    },

    "agendamento": {
      "nota": 4,
      "minutagem": "09:30",
      "trecho_oferta": "🟢 SDR [9:30]: \"oferta da reunião\"",
      "agendamento_gerado": true,
      "fechamento_qualidade": "Lead confirmou com entusiasmo / por educação / resistente.",
      "feedback": "Feedback direto.",
      "sugestao": null,
      "perda_agendamento": {
        "ocorreu": false,
        "minutagem": null,
        "o_que_aconteceu": null,
        "trecho": null,
        "causa_raiz": null,
        "o_que_deveria": null
      }
    },

    "bant": {
      "budget": {
        "status": "PARCIAL",
        "trecho": "🟣 CLIENTE [3:15]: \"frase sobre faturamento\"",
        "observacao": "Risco ou ponto de atenção para o Closer."
      },
      "authority": {
        "status": "CONFIRMADO",
        "trecho": "🟣 CLIENTE [1:30]: \"frase que demonstra autonomia de decisão\"",
        "observacao": "Orientação para o Closer se necessário."
      },
      "need": {
        "status": "CONFIRMADO",
        "trecho": "🟣 CLIENTE [2:00]: \"frase que verbaliza a necessidade\"",
        "dor_espontanea": true,
        "observacao": "Dor foi espontânea ou induzida? Qual o impacto?"
      },
      "timeline": {
        "status": "PARCIAL",
        "trecho": null,
        "observacao": "Urgência real ou apenas educação social?"
      },
      "score": 3,
      "recomendacao": "Orientação objetiva para o Closer: maior risco e o que investigar imediatamente na reunião."
    },

    "disc": {
      "perfil": "ESTÁVEL",
      "explicacao": "Comportamentos específicos observados que sustentam o perfil — não generalize.",
      "orientacoes": "Como o Closer deve adaptar abordagem, linguagem e cadência de decisão. O que fazer e o que evitar.",
      "trechos": [
        "[1:30] 🟣 CLIENTE: \"frase literal que evidencia o perfil\"",
        "[3:00] 🟣 CLIENTE: \"frase literal que evidencia o perfil\""
      ]
    },

    "temperatura": {
      "classificacao": "MORNO",
      "nivel_consciencia": "O que o lead demonstra saber — ou não saber — sobre seu problema, soluções existentes e o ecossistema Podium.",
      "motivo": "Comportamento observado + urgência percebida + espontaneidade das dores.",
      "espontaneidade": "As dores foram ESPONTÂNEAS ou INDUZIDAS? Justifique com trechos. Impacto na temperatura.",
      "citacoes": [
        "[1:00] 🟣 CLIENTE: \"frase literal\"",
        "[2:00] 🟣 CLIENTE: \"frase literal\""
      ],
      "observacoes": "Ponto de atenção, gatilho a explorar ou risco para o Closer — foco no que o Closer precisa saber."
    },

    "prolixidade": {
      "detectada": false,
      "momentos": []
    }
  },

  "qualification": {
    "cnpj_validated": true,
    "revenue_validated": true,
    "team_size_validated": false,
    "revenue_below_10k": false,
    "cash_reserve_validated": null,
    "cash_reserve_citation": null,
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

REGRAS DE PREENCHIMENTO:

Campos gerais:
- "sentiment": exatamente positivo, neutro ou negativo.
- "whatsapp_msg": substitua APENAS [primeiro nome do lead], [dia da semana], [data por extenso], [horário] e [dor principal do lead]. Mantenha [Nome do Especialista] e [link Google Meet] como estão.
- Se data/horário não mencionado na ligação: deixe como [data e horário a confirmar].
- Se informação não mencionada na ligação: use null ou "Não mencionado na ligação".

Critérios NEPQ (investigacao, sonho, solucao, agendamento):
- "nota": 0-5 ou "NA". Em dúvida entre dois valores: escolha o MENOR.
- Trechos LITERAIS da transcrição, máx. 30 palavras, com minutagem.
- "sugestao": null se nota = 5, obrigatório se nota < 5.

BANT:
- "status": exatamente CONFIRMADO, PARCIAL, NÃO MAPEADO ou DESQUALIFICADO.
- CONFIRMADO exige trecho explícito e voluntário do lead — não vale inferência.
- Resposta a pergunta fechada = PARCIAL no máximo.
- Informação implícita no contexto = NÃO MAPEADO.
- "score": soma dos pilares CONFIRMADOS (0-4).
- "need.dor_espontanea": true se a dor foi verbalizada sem sugestão direta do SDR.

DISC:
- "perfil": exatamente DOMINANTE, INFLUENTE, ESTÁVEL, CONFORME ou MISTO.
- Sustente com mínimo 2 trechos concretos com minutagem.
- "trechos": array com pelo menos 2 itens.

Temperatura:
- "classificacao": exatamente FRIO, MORNO, QUENTE ou PRONTO PRA COMPRAR.
- Receptividade ≠ Temperatura. Lead agradável pode ser FRIO.
- Dor induzida = temperatura rebaixada. Máximo MORNO se dor foi induzida.
- Agendamento confirmado NÃO eleva a temperatura.
- "citacoes": array com mínimo 2 itens obrigatórios.
- Em dúvida entre MORNO e QUENTE: escolha MORNO. Entre QUENTE e PRONTO: escolha QUENTE.

Prolixidade:
- "momentos": array de objetos com minutagem, descricao, impacto e sugestao. Vazio se não detectada.

Perda de agendamento (dentro de "agendamento"):
- "perda_agendamento.ocorreu": true apenas se o agendamento não foi gerado POR FALHA DO SDR.
- Não preencher como falha: lead sem CNPJ/caixa, desqualificado por perfil, ligação caiu.

Qualification (backward compat):
- "cnpj_validated/revenue_validated/team_size_validated": true se SDR perguntou e obteve resposta, false se perguntou mas não obteve, null se não perguntou.
- "revenue_below_10k": true se faturamento < R$10.000, false se >= R$10.000, null se não mencionado.
- "cash_reserve_validated": true/false apenas quando revenue_below_10k = true, null nos demais.
- "cash_reserve_citation": SOMENTE quando revenue_below_10k = true. Trecho LITERAL (máx. 30 palavras) onde o SDR pergunta e/ou lead responde sobre caixa para investir. null se SDR não perguntou.
- "decision_maker": exatamente CONFIRMADO, PARCIAL, NÃO MAPEADO ou DESQUALIFICADO.
- "maturity_level": exatamente Baixo (Operacional), Médio (Dono de Cadeira), Alto (Empreendedor) ou Não identificado.`

  const response = await getGroq().chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 5000,
  })

  const text = response.choices[0]?.message?.content?.trim() ?? ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`JSON não encontrado na resposta: ${text.slice(0, 200)}`)

  const analysis = JSON.parse(jsonMatch[0]) as CallAnalysis
  if (!analysis.summary || !analysis.closer_briefing || !Array.isArray(analysis.follow_ups)) {
    throw new Error('Estrutura de análise inválida')
  }
  if (!analysis.nepq_analysis) {
    throw new Error('Análise NEPQ ausente na resposta')
  }

  return analysis
}

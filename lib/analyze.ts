import Groq from 'groq-sdk'

function getGroq() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY })
}

// ─── Qualification ────────────────────────────────────────────────────────────
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
  score_justificativa: string
  sdr_feedback_intro: string
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
  resumo_lider: string
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
// Groq free tier: 12,000 TPM. Prompt alone is ~5,000 tokens + output 6,000 = 11,000 reserved.
// Transcript budget: ~3,500 tokens ≈ 12,000 chars. Keep start + end (most relevant for NEPQ).
function truncateTranscript(text: string, maxChars = 12000): string {
  if (text.length <= maxChars) return text
  const head = Math.floor(maxChars * 0.65)
  const tail = maxChars - head
  return text.slice(0, head) + '\n\n[... trecho central omitido por limite de tamanho ...]\n\n' + text.slice(-tail)
}

export async function analyzeCall(
  transcript: string,
  callMeta: { caller: string; called: string; duration: number; direction: string }
): Promise<CallAnalysis> {
  const min = Math.floor(callMeta.duration / 60)
  const sec = callMeta.duration % 60
  const safeTranscript = truncateTranscript(transcript)

  const prompt = `AGENTE DE ANÁLISE DE LIGAÇÕES — PRÉ-VENDAS PODIUM
MÉTODO NEPQ + BANT v4.1 — FEEDBACK DE LÍDER + BRIEFING DO CLOSER

Você é um analista especialista em pré-vendas treinado no método NEPQ.
Sua missão é avaliar a performance do SDR com base na transcrição da
ligação e gerar DOIS produtos distintos em um único relatório JSON:

1. FEEDBACK PARA O SDR — escrito na voz de um líder de pré-vendas
   experiente falando diretamente com seu liderado. Brutalmente direto,
   técnico e com dica prática de melhoria em cada etapa.

2. RESUMO PARA O CLOSER — briefing estruturado de preparação para a
   videochamada de vendas. 100% orientado à oportunidade, zero crítica
   ao SDR, zero ressalva que diminua o valor do lead.

Você NÃO é um agente de elogios. Você é um auditor de qualidade.
Notas altas são exceção — exigem evidência explícita na transcrição.

━━━ REGRA ABSOLUTA — ANTI-INVENÇÃO (LER ANTES DE TUDO) ━━━

❌ PROIBIDO inventar, inferir, assumir ou completar qualquer dado que NÃO
   esteja explicitamente dito na transcrição.
❌ PROIBIDO usar expressões como "provavelmente", "parece que", "pelo
   contexto", "pode ser que", "aparentemente".
❌ PROIBIDO atribuir dores, sonhos, objeções ou intenções ao lead se ele
   não verbalizou exatamente isso.

✅ Se a informação NÃO foi dita na transcrição: use null nos campos JSON,
   ou omita no closer_briefing. NUNCA complete com suposição.
✅ Toda afirmação do relatório deve ser sustentada por trecho literal da
   transcrição. Sem trecho = sem afirmação.
✅ Se a ligação for curta demais, muda ou sem conteúdo real de vendas:
   preencha summary com "Ligação sem conteúdo suficiente para análise
   (caixa postal ou chamada muda)", score_script = 0, todos os critérios
   com nota NA, bant com todos os pilares NÃO MAPEADO, e closer_briefing
   com "Ligação sem conteúdo — briefing indisponível."

━━━ DOIS PÚBLICOS, DUAS VOZES — REGRA FUNDAMENTAL ━━━

👤 SDR → Recebe o feedback como se viesse do líder direto dele.
   Voz em segunda pessoa ("você fez", "você deixou de fazer").
   Tom: direto, sem rodeios, sem suavizar, mas sempre com a dica
   prática do que fazer na próxima ligação. O objetivo é gerar
   consciência imediata da falha E o caminho de correção.
   Não proteja o SDR do desconforto necessário para evoluir.
   Elogio só com trecho que justifique — em uma frase, nunca um parágrafo.
   Quando o SDR acertar, diga "é esse padrão que eu quero ver".

👤 CLOSER → Recebe APENAS o que precisa para conduzir bem a reunião.
   Nenhum erro do SDR aparece no bloco do Closer. Nenhuma crítica,
   nenhum alerta de falha de processo, nenhuma frase do tipo
   "não foi identificado" ou "o SDR não validou". Se um dado não
   foi coletado, simplesmente omita. Pontos de atenção são sempre
   apresentados como algo que o Closer pode CONSTRUIR na reunião —
   nunca como problema herdado.
   Tom: briefing de parceiro experiente. Confiante, direto, prático.

━━━ REGRAS GLOBAIS INVIOLÁVEIS ━━━

REGRA 1 — ESPONTANEIDADE DA DOR
Sempre deixe claro o que o lead disse de forma ESPONTÂNEA versus o que
foi INDUZIDO pelo SDR. Dores induzidas reduzem a validade do critério,
reduzem a nota da investigação E reduzem a temperatura do lead.
Resposta a pergunta fechada ("você tem problema com X?") = induzida.
Verbalização sem provocação direta ou após pergunta aberta = espontânea.

REGRA 2 — LINHA LÓGICA
Todos os critérios devem estar conectados ao MESMO problema principal
identificado na ligação. Se a dor principal muda entre os critérios,
isso é inconsistência — indique explicitamente no feedback do SDR.

REGRA 3 — CITAÇÕES OBRIGATÓRIAS
Todo trecho citado deve ser LITERAL, com no máximo 30 palavras.
Sempre identifique: 🟢 SDR ou 🟣 CLIENTE + minutagem.
Ausência de trecho = ausência de evidência = penalização automática.

REGRA 4 — LIGAÇÃO INTERROMPIDA
Se a ligação cair antes do fim do script:
- Atribua "NA" (Não Aplicável) para etapas não iniciadas.
- Não penalize o SDR por força maior.
- Calcule o Score proporcional apenas sobre as etapas realizadas.

REGRA 5 — LIMITE DE BLOCO
Mantenha cada bloco de feedback objetivo e direto, sem redundância.

REGRA 6 — NOMES DOS SDRs (para referência)
Adriele | Luan | Nátali

REGRA 7 — RIGOR ANTI-LENIÊNCIA (APLICAR EM TODOS OS CRITÉRIOS)
→ Nota 5 exige evidência explícita de profundidade, personalização
  real à dor do lead e conexão clara com a situação específica dele.
→ Nota 4 exige execução correta com trecho que prova, com apenas
  UM ponto faltante e identificável.
→ Nota 3 ou menos: etapa iniciada mas não aprofundada, mecânica
  ou sem personalização.
→ Em caso de dúvida entre duas notas: escolha a MENOR.
→ Fluência verbal, simpatia ou boa dicção NÃO elevam a nota.
→ Etapa genérica (poderia ter sido dita para qualquer lead) = máximo 2.
→ Sem trecho que prove a execução = nota 0.

REGRA 8 — PROLIXIDADE DO SDR
Monitore ativamente se o SDR fala demais. Sinais (identifique com minutagem):
→ Explica o produto antes de entender a dor do lead
→ Repete a mesma informação mais de uma vez na mesma etapa
→ Usa mais de 3 frases seguidas sem fazer uma pergunta
→ Responde objeção com discurso longo em vez de pergunta cirúrgica
→ Preenche silêncio do lead com mais conteúdo em vez de escuta
→ Introdução passa de 60 segundos sem engajar o lead

REGRA 9 — PONTO DE PERDA DO AGENDAMENTO
Se a ligação NÃO gerou agendamento por falha do SDR (não por
desqualificação legítima: sem CNPJ, sem caixa, negativa clara,
queda técnica), preencha perda_agendamento.ocorreu = true.
Conta como falha do SDR: não fez oferta clara, recuou na primeira
objeção, não criou urgência, deixou "em aberto", aceitou "vou pensar"
sem qualificar, apresentou solução cedo demais, lead esfriou por prolixidade.

REGRA 10 — VOZ DO LÍDER NO FEEDBACK DO SDR
Todo feedback dos Critérios 1 a 4 deve ser escrito em segunda pessoa.
Estrutura de cada etapa:
→ O que você fez certo (uma frase, só se houver trecho que prove)
→ O que você errou: erro nomeado + minutagem + impacto na ligação
→ 🛠 Na próxima: dica prática com a frase exata que o SDR deveria ter usado.
Proibido: voz passiva, suavizadores ("mas no geral foi bom"),
crítica sem dica de correção, elogio em parágrafo.

━━━ SCORE DO SCRIPT (0–100%) — ANTI-LENIÊNCIA ━━━
→ Cada etapa AUSENTE desconta no mínimo 15% do score total.
→ Etapa genérica sem personalização = máximo 50% do peso da etapa.
→ Score > 80%: TODAS as etapas com evidência explícita de personalização.
→ Score > 90%: reservado para SDR que conectou todas as etapas à dor
  real, aplicou BANT completo e agendou com personalização real.
→ Se faturamento < R$10k e SDR não validou caixa: penalize o score.
→ Ausência de qualquer pilar BANT: penalize até 10% do score.

━━━ ESCALA DE NOTAS (todos os critérios) ━━━
5 → Excelência: trecho prova profundidade real, personalização e conexão com contexto do lead.
4 → Bom: evidência clara, faltou exatamente UM ponto identificável.
3 → Regular: iniciou mas não aprofundou, ou executou mecanicamente.
2 → Fraco: superficial, genérico ou fora de ordem.
1 → Muito fraco: tentativa identificável sem resultado prático.
0 → Ausente: etapa não realizada. Sem trecho que evidencie.
NA → Não aplicável (ligação interrompida antes dessa etapa).
⚠️ Em dúvida entre duas notas: escolha a MENOR.

━━━ METADADOS DA LIGAÇÃO ━━━
SDR: ${callMeta.caller} | Lead: ${callMeta.called}
Duração: ${min}min ${sec}s | ${callMeta.direction === 'outbound' ? 'Ativa (SDR ligou)' : 'Receptiva (lead ligou)'}

━━━ TRANSCRIÇÃO ━━━
${safeTranscript}

━━━ INSTRUÇÃO DE SAÍDA ━━━
Retorne APENAS um JSON válido (sem markdown, sem texto fora do JSON).

JSON esperado:

{
  "summary": "Resumo em 2-3 frases: perfil do lead, dor principal relatada, resultado do agendamento.",

  "closer_briefing": "📋 RESUMO PARA O CLOSER\\n\\n📍 [Parágrafo inicial: nome do lead, segmento, tempo de mercado, cidade se citada, tamanho da equipe, contexto operacional, motivação para a reunião, status CNPJ. 3 a 5 linhas como apresentação executiva.]\\n\\n💼 Estrutura Atual da Barbearia\\n• [tempo de mercado / histórico]\\n• [equipe: quantidade e papel do proprietário]\\n• [estrutura de decisão: decisor único? sócio?]\\n• [CNPJ ativo]\\n• [modelo de atendimento e agendamento]\\n• [tecnologias/sistemas já adotados]\\n\\n💡 Desempenho Atual e Indicadores\\n• [faturamento mensal declarado]\\n• [ticket médio / volume de atendimentos, se citados]\\n• [tendência do negócio — nas palavras do lead]\\n• [perfil de decisão: analítico, impulsivo, ponderado]\\n\\n🎯 Objetivo com a Reunião\\n[O que o lead quer validar, entender ou resolver. Ponto de vista do lead. 2 a 3 linhas.]\\n\\n❗ Ponto de Atenção\\n• [perfil DISC traduzido em conduta prática: o que fazer e o que evitar]\\n• [aspectos a validar na reunião — formulados como AÇÃO do Closer, nunca como lacuna]\\n• [risco real se o Closer não adaptar a abordagem]\\n\\n✅ Oportunidade para o Closer\\n• [por que este lead é boa oportunidade — sustentado pela ligação]\\n• [a dor principal NAS PALAVRAS DO LEAD — use as expressões literais dele]\\n• [o sonho declarado e o gatilho emocional mais forte]\\n• [gancho de abertura recomendado: frase pronta que cria CONTINUIDADE com a ligação]\\n• [pergunta NEPQ recomendada para aprofundar a dor na reunião]",

  "whatsapp_msg": "Oi [primeiro nome do lead]! Confirmado aqui 👇\\n📅 [dia da semana], [data por extenso] às [horário]\\n👤 Você vai conversar com o [Nome do Especialista]\\n🔗 [link Google Meet]\\n\\nO [Nome do Especialista] é especialista em estruturação de barbearias — ele já ajudou donos exatamente no cenário que você me descreveu a criar previsibilidade e sair da dependência total da própria presença.\\n\\nEle vai chegar preparado pra falar especificamente sobre [dor principal do lead extraída da ligação] — não é uma apresentação, é uma conversa sobre o seu negócio.\\n\\nQualquer coisa antes, me chama aqui. Ele vai estar te esperando! 🤝",

  "follow_ups": ["ação de follow-up 1", "ação de follow-up 2"],
  "sentiment": "positivo",
  "key_points": ["ponto-chave 1", "ponto-chave 2", "ponto-chave 3"],

  "nepq_analysis": {
    "score_script": 70,
    "score_justificativa": "2 frases: o que sustenta o score e o maior ponto de penalização.",
    "sdr_feedback_intro": "Uma frase de síntese do líder sobre a ligação inteira. Ex: 'Você agendou — mas deixou temperatura na mesa.'",

    "investigacao": {
      "nota": 3,
      "minutagem": "02:15",
      "trecho_principal": "🟣 CLIENTE [2:15]: \"frase literal do lead sobre a dor\"",
      "problemas_identificados": ["problema 1", "problema 2"],
      "trecho_desdobramento": "🟢 SDR [3:00]: \"pergunta de aprofundamento\"",
      "dor_espontanea": true,
      "aprofundamento": "O que o SDR conseguiu extrair. Se fraco, diga explicitamente.",
      "feedback": "Feedback em segunda pessoa (voz do líder, REGRA 10). O que você fez certo (1 frase se houver trecho) / o que você errou + minutagem + impacto / análise de espontaneidade.",
      "sugestao": "Na próxima: dica prática + frase exata recomendada. null se nota = 5."
    },

    "sonho": {
      "nota": 2,
      "minutagem": null,
      "trecho_principal": null,
      "sonhos_identificados": [],
      "trecho_desdobramento": null,
      "aprofundamento": "Não investigado na ligação.",
      "feedback": "Feedback em segunda pessoa (voz do líder). Se o SDR falou o sonho pelo lead, nomeie: 'você falou por ele — o sonho que VOCÊ descreve não vende; o sonho que ELE descreve, vende.'",
      "sugestao": "Na próxima: dica prática + frase exata recomendada."
    },

    "solucao": {
      "nota": 3,
      "minutagem": "07:00",
      "trecho_retomada_dor": "🟢 SDR [7:00]: \"retomada da dor antes de apresentar solução\"",
      "trecho_entregavel": "🟢 SDR [7:30]: \"explicação do entregável\"",
      "trecho_desdobramento": null,
      "feedback": "Feedback em segunda pessoa (voz do líder).",
      "sugestao": "Na próxima: dica prática + frase exata recomendada."
    },

    "agendamento": {
      "nota": 4,
      "minutagem": "09:30",
      "trecho_oferta": "🟢 SDR [9:30]: \"oferta da reunião\"",
      "agendamento_gerado": true,
      "fechamento_qualidade": "Lead confirmou com entusiasmo / por educação / resistente.",
      "feedback": "Feedback em segunda pessoa (voz do líder). Se agendou: o fechamento foi firme ou frágil? Houve micro-compromisso real? Se NÃO agendou por falha do SDR: descreva o que aconteceu.",
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

    "resumo_lider": "3 a 5 frases. Padrão identificado (onde o SDR é forte, onde é fraco), impacto no resultado, e UM foco único e mensurável para a próxima ligação. Termine com o foco. Ex: 'Próxima ligação, seu foco é um só: fazer o lead falar mais do que você.'",

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
      "explicacao": "Comportamentos específicos observados que sustentam o perfil. Mínimo 2 trechos.",
      "orientacoes": "Como o Closer deve adaptar abordagem, linguagem e cadência de decisão. O que fazer e o que evitar.",
      "trechos": [
        "[1:30] 🟣 CLIENTE: \"frase literal que evidencia o perfil\"",
        "[3:00] 🟣 CLIENTE: \"frase literal que evidencia o perfil\""
      ]
    },

    "temperatura": {
      "classificacao": "MORNO",
      "nivel_consciencia": "O que o lead demonstra saber sobre seu problema, soluções existentes e o ecossistema Podium.",
      "motivo": "Comportamento observado + urgência percebida + espontaneidade das dores, conectado à transcrição.",
      "espontaneidade": "ESPONTÂNEA ou INDUZIDA? Justifique com trechos. Impacto na temperatura.",
      "citacoes": [
        "[1:00] 🟣 CLIENTE: \"frase literal\"",
        "[2:00] 🟣 CLIENTE: \"frase literal\""
      ],
      "observacoes": "Ponto de atenção, gatilho a explorar ou risco para o Closer."
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

━━━ REGRAS DE PREENCHIMENTO ━━━

score_script/score_justificativa/sdr_feedback_intro:
- "score_script": número 0-100. Anti-leniência conforme regras acima.
- "score_justificativa": 2 frases. O que sustenta o score + maior penalização.
- "sdr_feedback_intro": UMA frase do líder sintetizando a ligação inteira.

Critérios NEPQ (investigacao, sonho, solucao, agendamento):
- "nota": 0-5 ou "NA". Em dúvida: escolha o MENOR.
- "feedback": escrito em segunda pessoa (voz do líder, REGRA 10).
- "sugestao": null se nota = 5, obrigatório se nota < 5. Inclua frase exata.
- Trechos LITERAIS, máx. 30 palavras, com minutagem.

"resumo_lider": 3-5 frases encerrando o feedback. Padrão + foco único para próxima ligação.

BANT:
- "status": exatamente CONFIRMADO, PARCIAL, NÃO MAPEADO ou DESQUALIFICADO.
- CONFIRMADO exige trecho explícito e voluntário — não vale inferência.
- Resposta a pergunta fechada = PARCIAL no máximo.
- "score": soma dos pilares CONFIRMADOS (0-4).
- "need.dor_espontanea": true se a dor foi verbalizada sem sugestão direta do SDR.

DISC:
- "perfil": exatamente DOMINANTE, INFLUENTE, ESTÁVEL, CONFORME ou MISTO.
- Sustente com mínimo 2 trechos concretos com minutagem.
- REFERÊNCIA: 🔴 DOMINANTE = resultados/direto/impaciente | 🟡 INFLUENTE = relacionamento/emocional | 🟢 ESTÁVEL = segurança/avesso a risco | 🔵 CONFORME = lógica/detalhista.

Temperatura:
- "classificacao": exatamente FRIO, MORNO, QUENTE ou PRONTO PRA COMPRAR.
- Receptividade ≠ Temperatura. Lead agradável pode ser FRIO.
- Dor induzida = máximo MORNO. Agendamento confirmado NÃO eleva temperatura.
- "citacoes": mínimo 2 itens obrigatórios.
- Em dúvida MORNO/QUENTE: MORNO. Em dúvida QUENTE/PRONTO: QUENTE.

closer_briefing:
- Siga EXATAMENTE a estrutura com os ícones (📋, 📍, 💼, 💡, 🎯, ❗, ✅).
- ZERO crítica ao SDR. ZERO "não foi identificado". Dado ausente = omitido.
- Baseie-se EXCLUSIVAMENTE no que foi dito na ligação.
- Use o nome do lead quando identificado.

whatsapp_msg:
- Substitua APENAS [primeiro nome do lead], [dia da semana], [data por extenso], [horário] e [dor principal].
- Mantenha [Nome do Especialista] e [link Google Meet] como estão.
- Se data/horário não mencionado: deixe como [data e horário a confirmar].

sentiment: exatamente positivo, neutro ou negativo.

Qualification:
- "cnpj_validated/revenue_validated/team_size_validated": true se SDR perguntou e obteve resposta, false se perguntou mas não obteve, null se não perguntou.
- "revenue_below_10k": true se < R$10k, false se >= R$10k, null se não mencionado.
- "cash_reserve_validated/cash_reserve_citation": apenas quando revenue_below_10k = true.
- "decision_maker": exatamente CONFIRMADO, PARCIAL, NÃO MAPEADO ou DESQUALIFICADO.
- "maturity_level": exatamente Baixo (Operacional), Médio (Dono de Cadeira), Alto (Empreendedor) ou Não identificado.`

  const response = await getGroq().chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 6000,
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

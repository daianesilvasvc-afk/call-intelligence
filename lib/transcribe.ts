import Groq from 'groq-sdk'

function getGroq() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY })
}

export async function transcribeAudio(audioUrl: string): Promise<string> {
  const response = await fetch(audioUrl)
  if (!response.ok) {
    throw new Error(`Falha ao baixar áudio: ${response.status} ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const contentType = response.headers.get('content-type') || 'audio/mpeg'
  const ext = getExt(contentType, audioUrl)
  const file = new File([buffer], `recording.${ext}`, { type: contentType })

  const MAX_RETRIES = 4
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const transcription = await getGroq().audio.transcriptions.create({
        file,
        model: 'whisper-large-v3',
        language: 'pt',
        response_format: 'text',
      })
      return transcription as unknown as string
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const is429 = msg.includes('429') || msg.includes('rate_limit_exceeded')

      if (!is429 || attempt === MAX_RETRIES) throw err

      // Parse "Please try again in Xm Ys" from the error message
      const matchMin = msg.match(/(\d+)m(\d+(?:\.\d+)?)s/)
      const matchSec = !matchMin && msg.match(/(\d+(?:\.\d+)?)s/)
      let waitMs: number
      if (matchMin) {
        waitMs = (parseInt(matchMin[1]) * 60 + parseFloat(matchMin[2])) * 1000 + 2000
      } else if (matchSec) {
        waitMs = parseFloat(matchSec[1]) * 1000 + 2000
      } else {
        waitMs = attempt * 30_000
      }

      console.log(`[transcribe] Rate limit 429 — aguardando ${Math.round(waitMs / 1000)}s antes de tentar novamente (tentativa ${attempt}/${MAX_RETRIES})`)
      await new Promise(r => setTimeout(r, waitMs))
    }
  }

  throw new Error('Transcription failed after max retries')
}

function getExt(contentType: string, url: string): string {
  const urlExt = url.split('?')[0].split('.').pop()?.toLowerCase()
  if (urlExt && ['mp3', 'mp4', 'wav', 'ogg', 'webm', 'm4a', 'flac'].includes(urlExt)) {
    return urlExt
  }
  const map: Record<string, string> = {
    'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'mp4',
    'audio/wav': 'wav', 'audio/wave': 'wav', 'audio/ogg': 'ogg',
    'audio/webm': 'webm', 'audio/flac': 'flac', 'audio/m4a': 'm4a',
    'video/mp4': 'mp4', 'video/webm': 'webm',
  }
  return map[contentType.split(';')[0].trim()] || 'mp3'
}

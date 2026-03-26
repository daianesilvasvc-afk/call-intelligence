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

  const transcription = await getGroq().audio.transcriptions.create({
    file,
    model: 'whisper-large-v3',
    language: 'pt',
    response_format: 'text',
  })

  return transcription as unknown as string
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

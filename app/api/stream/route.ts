import callEvents from '@/lib/events'

export const dynamic = 'force-dynamic'

export async function GET() {
  const encoder = new TextEncoder()

  let cleanup: (() => void) | null = null

  const stream = new ReadableStream({
    start(controller) {
      function send(payload: unknown) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
        } catch { /* connection closed */ }
      }

      // Acknowledge connection
      send({ type: 'connected' })

      // Forward call update events to this client
      function onCallUpdated(callId: string) {
        send({ type: 'call_updated', callId })
      }

      callEvents.on('call_updated', onCallUpdated)

      // Heartbeat every 25s to keep connection alive through proxies
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          clearInterval(heartbeat)
        }
      }, 25_000)

      cleanup = () => {
        clearInterval(heartbeat)
        callEvents.off('call_updated', onCallUpdated)
      }
    },
    cancel() {
      cleanup?.()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering on Railway
    },
  })
}

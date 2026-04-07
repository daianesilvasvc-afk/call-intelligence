export interface Api4ComCall {
  id: string
  domain: string
  call_type: 'inbound' | 'outbound'
  started_at: string
  ended_at: string
  from: string
  to: string
  duration: number
  hangup_cause: string
  record_url: string | null
  email: string
  first_name: string
  last_name: string
  BINA: string | null
  minute_price: number
  call_price: number
  metadata: Record<string, unknown>
}

interface Api4ComResponse {
  data: Api4ComCall[]
  total?: number
  page?: number
}

export interface FetchOptions {
  startDate?: string  // YYYY-MM-DD
  endDate?: string    // YYYY-MM-DD
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function fetchCalls(
  apiToken: string,
  page = 1,
  pageSize = 50,
  opts: FetchOptions = {}
): Promise<Api4ComCall[]> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })

  // API4COM supports startDate/endDate filters — reduces pages needed and avoids rate limits
  if (opts.startDate) params.set('startDate', opts.startDate)
  if (opts.endDate)   params.set('endDate',   opts.endDate)

  const res = await fetch(
    `https://api.api4com.com/api/v1/calls?${params}`,
    { headers: { Authorization: apiToken } }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API4COM error ${res.status}: ${text.slice(0, 300)}`)
  }

  const json = await res.json() as Api4ComResponse
  return json.data ?? []
}

export async function fetchAllCalls(
  apiToken: string,
  maxPages = 20,
  opts: FetchOptions = {},
  delayMs = 800
): Promise<Api4ComCall[]> {
  const all: Api4ComCall[] = []

  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await sleep(delayMs)

    let batch: Api4ComCall[]
    try {
      batch = await fetchCalls(apiToken, page, 50, opts)
    } catch (err) {
      if (err instanceof Error && err.message.includes('429')) {
        // Exponential backoff: 5s, then 10s
        await sleep(5000)
        try {
          batch = await fetchCalls(apiToken, page, 50, opts)
        } catch {
          await sleep(10000)
          batch = await fetchCalls(apiToken, page, 50, opts)
        }
      } else {
        throw err
      }
    }

    all.push(...batch)
    if (batch.length < 50) break
  }

  return all
}

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

export async function fetchCalls(apiToken: string, page = 1, pageSize = 50): Promise<Api4ComCall[]> {
  const res = await fetch(
    `https://api.api4com.com/api/v1/calls?page=${page}&pageSize=${pageSize}`,
    {
      headers: { Authorization: apiToken },
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API4COM error ${res.status}: ${text.slice(0, 300)}`)
  }

  const json = await res.json() as Api4ComResponse
  return json.data ?? []
}

export async function fetchAllCalls(apiToken: string, maxPages = 5): Promise<Api4ComCall[]> {
  const all: Api4ComCall[] = []
  for (let page = 1; page <= maxPages; page++) {
    const batch = await fetchCalls(apiToken, page, 50)
    all.push(...batch)
    if (batch.length < 50) break // last page
  }
  return all
}

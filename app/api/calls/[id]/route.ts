import { NextRequest, NextResponse } from 'next/server'
import { getCallById } from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const call = getCallById(id)
    if (!call) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ call })
  } catch (err) {
    console.error('Error fetching call:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

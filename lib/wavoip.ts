export interface WavoipCallEvent {
  type: 'CALL'
  action: 'CREATE' | 'UPDATE'
  whatsapp_call_id: string | number
  id_session: number
  idUser?: number
  caller: string
  receiver: string
  status:
    | 'NONE' | 'INCOMING_RING' | 'OUTGOING_RING' | 'OUTGOING_CALLING'
    | 'CONNECTING' | 'CONNECTION_LOST' | 'ACTIVE' | 'HANDLED_REMOTELY'
    | 'ENDED' | 'REJECTED' | 'REMOTE_CALL_IN_PROGRESS' | 'FAILED' | 'NOT_ANSWERED'
  direction: 'INCOMING' | 'OUTCOMING'
  duration?: number
  record_status?: 'READY' | 'RECORDING' | 'MIXING' | 'DISABLED' | 'EMPTY_RECORDING'
}

export interface WavoipRecordEvent {
  type: 'RECORD'
  action: 'UPDATE'
  whatsapp_call_id: string | number
  id_session: number
  record_status: 'READY' | 'RECORDING' | 'MIXING' | 'DISABLED' | 'EMPTY_RECORDING'
  record_url?: string
}

export interface WavoipDeviceEvent {
  type: 'DEVICE'
  action: 'UPDATE'
  id_session: number
  phone: string
  status: 'BUILDING' | 'open' | 'close' | 'connecting' | 'no_status' | 'error' | 'restarting' | 'hibernating' | 'WAITING_PAYMENT'
}

export type WavoipWebhookPayload = WavoipCallEvent | WavoipRecordEvent | WavoipDeviceEvent

export function buildRecordUrl(whatsapp_call_id: number): string {
  return `https://storage.wavoip.com/${whatsapp_call_id}`
}

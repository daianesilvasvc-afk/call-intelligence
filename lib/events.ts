import { EventEmitter } from 'events'

// Global event bus — works because Railway runs a single persistent Node.js process
const callEvents = new EventEmitter()
callEvents.setMaxListeners(200) // support many concurrent SSE connections

export default callEvents

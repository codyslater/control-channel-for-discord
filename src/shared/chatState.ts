import { HostEvent } from './chatProtocol'
import { ChatMessage } from './types'

export interface ChatState {
  channelId: string | null
  channelName: string
  messages: ChatMessage[]
  status: string
  notice: string
}

export const initialState: ChatState = { channelId: null, channelName: '', messages: [], status: '', notice: '' }

export function reduce(state: ChatState, ev: HostEvent): ChatState {
  switch (ev.type) {
    case 'reset':
      return { ...state, channelId: ev.channelId, channelName: ev.channelName, messages: ev.messages, notice: '' }
    case 'append':
      if (state.messages.some((m) => m.id === ev.message.id)) return state
      return { ...state, messages: [...state.messages, ev.message] }
    case 'update':
      return { ...state, messages: state.messages.map((m) => (m.id === ev.message.id ? ev.message : m)) }
    case 'delete':
      return { ...state, messages: state.messages.filter((m) => m.id !== ev.id) }
    case 'history': {
      const existing = new Set(state.messages.map((m) => m.id))
      const older = ev.messages.filter((m) => !existing.has(m.id))
      return { ...state, messages: [...older, ...state.messages] }
    }
    case 'status':
      return { ...state, status: ev.text }
    case 'notice':
      return { ...state, notice: ev.text }
    case 'commands':
      return state
    case 'members':
      return state
    case 'clear':
      return { ...initialState, status: state.status }
  }
}

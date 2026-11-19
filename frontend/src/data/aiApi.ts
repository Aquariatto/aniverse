import type { Character, Message } from './mock'
import type { GalgameTurn } from './galgameMock'

interface CharacterRequest {
  character: Character
  history: Message[]
  userInput: string
  images?: string[]
  memories?: { content: string; importance?: number }[]
}

export interface ChatTurnResult {
  reply: string
  emotion: string
  affinityDelta: number
  memory: string | null
  drawPrompt?: string | null
}

export interface StoryTurnResult {
  narration: string
  location: string
  time: string
  trustDelta: number
  affinityDelta: number
  distanceDelta: number
  patch: string
  memory: string | null
}

async function post<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error || data?.detail || `AI 请求失败 (${response.status})`)
  return data as T
}

/**
 * 只把 role / content 发给服务端。
 * 消息里可能挂着 base64 图片（生图 / 上传），原样透传会让请求体膨胀到十几 MB 并撞上
 * 服务端 16 MB 限制，而服务端 cleanHistory() 本来也只读这两栏 —— 纯属白传。
 */
function plainHistory(history: Message[]) {
  return history
    .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
    .map(message => ({ role: message.role, content: String(message.content ?? '').slice(0, 4000) }))
}

export function requestChatTurn({ character, history, userInput, images = [], memories = [] }: CharacterRequest) {
  return post<ChatTurnResult>('/api/chat/turn', {
    character: {
      id: character.id,
      name: character.name,
      title: character.title,
      personaPrompt: character.personaPrompt,
    },
    history: plainHistory(history.slice(-24)),
    userInput,
    images,
    memories,
  })
}

export function requestGalgameTurn({ character, history, userInput, currentEmotion, currentScene, memories = [] }: CharacterRequest & { currentEmotion: string; currentScene: string }) {
  return post<GalgameTurn>('/api/galgame/turn', {
    character: {
      id: character.id,
      name: character.name,
      title: character.title,
      personaPrompt: character.personaPrompt,
    },
    history: plainHistory(history.slice(-24)),
    userInput,
    currentEmotion,
    currentScene,
    memories,
  })
}

export function requestStoryTurn(payload: {
  character: Character
  history: { input: string; narration: string }[]
  userInput: string
  currentState: unknown
}) {
  return post<StoryTurnResult>('/api/story/turn', {
    character: {
      id: payload.character.id,
      name: payload.character.name,
      title: payload.character.title,
      personaPrompt: payload.character.personaPrompt,
    },
    history: payload.history.slice(-12),
    userInput: payload.userInput,
    currentState: payload.currentState,
  })
}

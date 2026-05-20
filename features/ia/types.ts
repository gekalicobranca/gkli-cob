export type IaChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type IaChatRequest = {
  message: string
  history?: IaChatMessage[]
}

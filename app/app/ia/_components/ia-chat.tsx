'use client'

import { useState } from 'react'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

export function IaChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Olá! Sou o Assistente IA da GKLI.',
    },
  ])

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  async function enviarMensagem() {
    if (!input.trim() || loading) {
      return
    }

    const nextMessages = [
      ...messages,
      {
        role: 'user' as const,
        content: input,
      },
    ]

    setMessages(nextMessages)
    setLoading(true)

    try {
      const response = await fetch(
        '/api/ia/chat',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            message: input,
            history: messages,
          }),
        },
      )

      const payload =
        await response.json()

      setMessages([
        ...nextMessages,
        {
          role: 'assistant',
          content: payload.resposta,
        },
      ])

      setInput('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-140px)] flex-col rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-5">
        <h1 className="text-2xl font-medium text-slate-900">
          GKLI Chat
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.map((message, index) => {
          const isUser =
            message.role === 'user'

          return (
            <div
              key={index}
              className={`flex ${
                isUser
                  ? 'justify-end'
                  : 'justify-start'
              }`}
            >
              <div
                className={[
                  'max-w-[80%] rounded-3xl px-4 py-3 text-sm leading-6 whitespace-pre-wrap',

                  isUser
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-700',
                ].join(' ')}
              >
                {message.content}
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t border-slate-100 px-6 py-4">
        <div className="flex gap-3">
          <textarea
            rows={2}
            value={input}
            onChange={(event) =>
              setInput(
                event.target.value,
              )
            }
            placeholder="Pergunte algo..."
            className="flex-1 resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
          />

          <button
            type="button"
            disabled={loading}
            onClick={() =>
              enviarMensagem()
            }
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm text-white"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  )
}

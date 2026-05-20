import { NextResponse } from 'next/server'

import { createClient } from '@/utils/supabase/server'
import { getOpenAIClient } from '@/lib/ai/openai'

import { GKLI_AI_SYSTEM_PROMPT } from '@/features/ia/prompt'

import {
  getResumoOperacionalIa,
} from '@/features/ia/tools'

import type { IaChatRequest } from '@/features/ia/types'

import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Usuário não autenticado.' },
        { status: 401 },
      )
    }

    const body = (await request.json()) as IaChatRequest
    const pergunta = body.message?.trim()

    if (!pergunta) {
      return NextResponse.json(
        { error: 'Mensagem inválida.' },
        { status: 400 },
      )
    }

    const scope = await getPermittedCarteiras()

    const resumo = await getResumoOperacionalIa(
      supabase,
      scope.carteiraIds,
    )

    const openai = getOpenAIClient()

    const response = await openai.responses.create({
      model: 'gpt-5.5',

      input: [
        {
          role: 'system',
          content: GKLI_AI_SYSTEM_PROMPT,
        },

        {
          role: 'user',
          content: `
Resumo:
${JSON.stringify(resumo, null, 2)}

Pergunta:
${pergunta}
`,
        },
      ],
    })

    const resposta =
      response.output_text ||
      'Não consegui gerar resposta.'

    return NextResponse.json({
      resposta,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error:
          error?.message ||
          'Erro interno da IA.',
      },
      {
        status: 500,
      },
    )
  }
}

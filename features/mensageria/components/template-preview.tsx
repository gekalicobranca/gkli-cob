'use client'

import type { ChangeEvent } from 'react'
import { useMemo, useState } from 'react'
import { SAMPLE_TEMPLATE_VARIABLES, TEMPLATE_VARIABLES, renderTemplate } from '@/features/mensageria/render-template'

export function TemplatePreview({ initialContent = '' }: { initialContent?: string | null }) {
  const [content, setContent] = useState(initialContent ?? '')

  const preview = useMemo(() => renderTemplate(content, SAMPLE_TEMPLATE_VARIABLES), [content])

  function addVariable(key: string) {
    const token = `{{${key}}}`
    setContent((current: string) => current ? `${current} ${token}` : token)
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="conteudo">Conteúdo</label>
        <textarea
          id="conteudo"
          name="conteudo"
          value={content}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setContent(event.target.value)}
          className="min-h-[260px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-slate-400 focus:border-[var(--gkli-primary)] focus:ring-2 focus:ring-[var(--gkli-primary)]/20"
          placeholder="Olá {{primeiro_nome}}, identificamos uma pendência da unidade {{unidade}}..."
          required
        />
      </div>

      <aside className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Variáveis</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">Clique para adicionar no fim do texto. A régua renderiza com os dados reais no lote.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {TEMPLATE_VARIABLES.map((variable) => (
            <button
              key={variable}
              type="button"
              onClick={() => addVariable(variable)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-[var(--gkli-primary)] hover:text-[var(--gkli-primary)]"
            >
              {'{{'}{variable}{'}}'}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Preview</p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{preview || 'O preview aparece aqui.'}</p>
        </div>
      </aside>
    </div>
  )
}

'use client'

import { useRef, useState } from 'react'
import { Clipboard } from 'lucide-react'
import { EasyEmpty } from '@/components/easy/easy-ui'
import styles from '@/components/easy/easy.module.css'
import { montarPromptEspelhamento, type AdministradoraEspelhamento } from '@/features/easy-cob/espelhamento-prompt'

const campo = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500'

export function EspelharForm({ administradoras, podeAplicar }: { administradoras: AdministradoraEspelhamento[]; podeAplicar: boolean }) {
  const [administradoraId, setAdministradoraId] = useState('')
  const [condominioId, setCondominioId] = useState('')
  const [periodo, setPeriodo] = useState('')
  const [aplicar, setAplicar] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const campoPrompt = useRef<HTMLTextAreaElement>(null)

  const administradora = administradoras.find(item => item.id === administradoraId)
  const condominios = administradora?.condominios ?? []
  const selecionados = condominioId ? condominios.filter(item => item.id === condominioId) : condominios
  const prompt = administradora && selecionados.length
    ? montarPromptEspelhamento(administradora, selecionados, periodo, podeAplicar && aplicar)
    : ''

  async function copiarPrompt() {
    try {
      await navigator.clipboard.writeText(prompt)
      setMensagem('Prompt copiado.')
    } catch {
      campoPrompt.current?.focus()
      campoPrompt.current?.select()
      setMensagem('Texto selecionado. Use o comando de copiar do seu dispositivo.')
    }
  }

  if (!administradoras.length) {
    return <EasyEmpty title="Nenhuma administradora disponível" description="O espelhamento usa os condomínios ativos com administradora cadastrada nas suas carteiras." />
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
      <section className={`${styles.panel} min-w-0`} aria-labelledby="espelhar-escopo">
        <h2 id="espelhar-escopo">Escopo</h2>
        <div className="mt-4 grid gap-4">
          <div className="grid gap-1.5 text-sm font-medium">
            <label htmlFor="espelhar-administradora">Administradora</label>
            <select id="espelhar-administradora" className={campo} value={administradoraId} onChange={event => {
              setAdministradoraId(event.target.value)
              setCondominioId('')
              setMensagem('')
            }}>
              <option value="">Selecione uma administradora</option>
              {administradoras.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5 text-sm font-medium">
            <label htmlFor="espelhar-condominio">Condomínio</label>
            <select id="espelhar-condominio" className={campo} disabled={!administradora} value={condominioId} onChange={event => {
              setCondominioId(event.target.value)
              setMensagem('')
            }}>
              <option value="">{administradora ? `Todos os condomínios (${condominios.length})` : 'Selecione primeiro a administradora'}</option>
              {condominios.map(item => <option key={item.id} value={item.id}>{item.nome}{item.carteira ? ` · ${item.carteira}` : ''}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5 text-sm font-medium">
            <label htmlFor="espelhar-periodo">Período (opcional)</label>
            <input id="espelhar-periodo" className={campo} value={periodo} maxLength={100} placeholder="Posição atual" onChange={event => {
              setPeriodo(event.target.value)
              setMensagem('')
            }} />
          </div>
          <div className="grid gap-1.5 text-sm font-medium">
            <label htmlFor="espelhar-modo">Modo</label>
            <select id="espelhar-modo" className={campo} value={aplicar ? 'aplicar' : 'conferir'} onChange={event => {
              setAplicar(event.target.value === 'aplicar')
              setMensagem('')
            }}>
              <option value="conferir">Somente conferir</option>
              {podeAplicar && <option value="aplicar">Conferir e aplicar ajustes comprovados</option>}
            </select>
          </div>
        </div>
      </section>

      <section className={`${styles.panel} min-w-0`} aria-labelledby="espelhar-prompt">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="espelhar-prompt">Prompt de espelhamento</h2>
          <button type="button" className={styles.primary} disabled={!prompt} onClick={copiarPrompt}>
            <Clipboard size={16} aria-hidden="true" /> Copiar prompt
          </button>
        </div>
        <textarea
          ref={campoPrompt}
          aria-label="Texto do prompt"
          className={`${campo} mt-4 min-h-80 resize-y leading-relaxed`}
          value={prompt}
          placeholder="Selecione uma administradora para preparar o prompt."
          readOnly
        />
        <p role="status" className="text-sm text-slate-600">{mensagem}</p>
      </section>
    </div>
  )
}

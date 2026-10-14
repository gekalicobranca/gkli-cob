import type { KeilaCaso } from './queries'
import { acompanhamento } from './acompanhamento'

export type FiltrosAtendimento = {
  q?: string; estado?: string; condominio_id?: string; intencao?: string; resposta?: string; prazo?: string; ordem?: string
}
type UnidadeBusca = { id: string; identificacao: string; bloco: string | null }
const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export function filtrarAtendimentos(casos: KeilaCaso[], unidades: UnidadeBusca[], filtros: FiltrosAtendimento, hoje: string) {
  const porId = new Map(unidades.map(u => [u.id, u]))
  const termos = normalizar(filtros.q ?? '').split(/\s+/).filter(Boolean)
  return casos.filter(c => {
    if (filtros.estado && c.payload.estado !== filtros.estado) return false
    if (filtros.condominio_id && c.condominio_id !== filtros.condominio_id) return false
    if (filtros.intencao && c.payload.intencao !== filtros.intencao) return false
    const resposta = c.payload.rascunho_whatsapp ? (c.payload.rascunho_whatsapp.liberacao ? 'aprovada' : 'rascunho') : c.payload.resposta_aprovada ? 'aprovada' : c.payload.resposta_simulada?.trim() ? 'rascunho' : 'sem_resposta'
    if (filtros.resposta && resposta !== filtros.resposta) return false
    const pendencias = acompanhamento(c.payload).pendencias.filter(p => !p.resolvida_em)
    if (filtros.prazo === 'acompanhar' && (['concluido', 'atendimento_humano'].includes(c.payload.estado) || !pendencias.some(p => p.prazo <= hoje))) return false
    if (filtros.prazo === 'pendente' && !pendencias.length) return false
    const texto = normalizar([c.titulo, c.condominio?.nome ?? '', c.payload.proxima_acao,
      ...c.payload.emails.flatMap(e => [e.nome, e.remetente, e.assunto]),
      ...c.payload.unidade_ids.map(id => { const u = porId.get(id); return u ? `unidade ${u.identificacao} ${Number(u.identificacao) || ''} bloco ${u.bloco ?? ''}` : '' }),
    ].join(' '))
    return termos.every(t => texto.includes(t))
  }).sort((a, b) => filtros.ordem === 'antigos' ? a.updated_at.localeCompare(b.updated_at) : a.updated_at.localeCompare(b.updated_at) * -1)
}

export function linkAtendimento(caminho: string, filtros: FiltrosAtendimento, casoId?: string) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filtros)) if (value) params.set(key, value)
  if (casoId) params.set('caso', casoId)
  return `${caminho}${params.size ? `?${params}` : ''}`
}

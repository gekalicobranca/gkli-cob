import type { KeilaCaso } from './queries'
import { acompanhamento } from './acompanhamento'

export type FiltrosAtendimento = {
  q?: string; estado?: string; condominio_id?: string; intencao?: string; resposta?: string; prazo?: string; ordem?: string
}
type UnidadeBusca = { id: string; identificacao: string; bloco: string | null }
const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export function aguardaAprovacaoAtendimento(caso: Pick<KeilaCaso, 'payload'>) {
  const p = caso.payload
  if (['atendimento_humano', 'concluido'].includes(p.estado)) return false
  const whatsapp = p.rascunho_whatsapp
  return (!!p.resposta_simulada?.trim() && !p.resposta_aprovada)
    || (!!whatsapp?.texto.trim() && !whatsapp.aprovacao && !whatsapp.liberacao)
}

export function prioridadeAtendimento(caso: KeilaCaso, hoje: string) {
  if (caso.payload.estado === 'concluido') return { grupo: 5, prazo: '', rotulo: '' }
  const prazo = acompanhamento(caso.payload).pendencias.filter(p => !p.resolvida_em).map(p => p.prazo).sort()[0] ?? ''
  if (prazo && prazo < hoje) return { grupo: 0, prazo, rotulo: 'Pendência vencida' }
  if (caso.payload.estado === 'atendimento_humano') return { grupo: 1, prazo, rotulo: 'Atuação humana' }
  if (prazo === hoje) return { grupo: 2, prazo, rotulo: 'Prazo hoje' }
  if (prazo) return { grupo: 3, prazo, rotulo: '' }
  return { grupo: 4, prazo: '', rotulo: '' }
}

export function filtrarAtendimentos(casos: KeilaCaso[], unidades: UnidadeBusca[], filtros: FiltrosAtendimento, hoje: string) {
  const porId = new Map(unidades.map(u => [u.id, u]))
  const termos = normalizar(filtros.q ?? '').split(/\s+/).filter(Boolean)
  return casos.filter(c => {
    if (filtros.estado && c.payload.estado !== filtros.estado) return false
    if (filtros.condominio_id && c.condominio_id !== filtros.condominio_id) return false
    if (filtros.intencao && c.payload.intencao !== filtros.intencao) return false
    const resposta = c.payload.rascunho_whatsapp ? (c.payload.rascunho_whatsapp.liberacao ? 'aprovada' : 'rascunho') : c.payload.resposta_aprovada ? 'aprovada' : c.payload.resposta_simulada?.trim() ? 'rascunho' : 'sem_resposta'
    if (filtros.resposta === 'aguardando_aprovacao' && !aguardaAprovacaoAtendimento(c)) return false
    if (filtros.resposta && filtros.resposta !== 'aguardando_aprovacao' && resposta !== filtros.resposta) return false
    const pendencias = acompanhamento(c.payload).pendencias.filter(p => !p.resolvida_em)
    if (filtros.prazo === 'vencidas' && (c.payload.estado === 'concluido' || !pendencias.some(p => p.prazo < hoje))) return false
    if (filtros.prazo === 'acompanhar' && (['concluido', 'atendimento_humano'].includes(c.payload.estado) || !pendencias.some(p => p.prazo <= hoje))) return false
    if (filtros.prazo === 'pendente' && !pendencias.length) return false
    const texto = normalizar([c.titulo, c.condominio?.nome ?? '', c.payload.proxima_acao,
      ...c.payload.emails.flatMap(e => [e.nome, e.remetente, e.assunto]),
      ...c.payload.unidade_ids.map(id => { const u = porId.get(id); return u ? `unidade ${u.identificacao} ${Number(u.identificacao) || ''} bloco ${u.bloco ?? ''}` : '' }),
    ].join(' '))
    return termos.every(t => texto.includes(t))
  }).sort((a, b) => {
    if (filtros.ordem === 'antigos') return a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id)
    if (filtros.ordem === 'recentes') return b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id)
    const pa = prioridadeAtendimento(a, hoje), pb = prioridadeAtendimento(b, hoje)
    if (pa.grupo !== pb.grupo) return pa.grupo - pb.grupo
    // Pendências mais antigas primeiro; depois, casos há mais tempo sem atualização.
    if ([0, 2, 3].includes(pa.grupo) && pa.prazo !== pb.prazo) return pa.prazo.localeCompare(pb.prazo)
    return (pa.grupo < 4 ? a.updated_at.localeCompare(b.updated_at) : b.updated_at.localeCompare(a.updated_at)) || a.id.localeCompare(b.id)
  })
}

export function linkAtendimento(caminho: string, filtros: FiltrosAtendimento, casoId?: string) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filtros)) if (value) params.set(key, value)
  if (casoId) params.set('caso', casoId)
  return `${caminho}${params.size ? `?${params}` : ''}`
}

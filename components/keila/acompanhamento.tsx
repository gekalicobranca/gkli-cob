import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { acompanhamento, TIPOS_PENDENCIA } from '@/features/keila/acompanhamento'
import { salvarAcompanhamentoKeila } from '@/features/keila/acompanhamento-actions'
import { salvarAcompanhamentoLidia } from '@/features/lidia/acompanhamento-actions'
import type { AgenteVirtualId } from '@/features/agentes-virtuais/perfis'
import type { KeilaCaso } from '@/features/keila/queries'

export function AcompanhamentoKeila({ caso, podeEditar, agenteId = 'keila' }: { caso: KeilaCaso; podeEditar: boolean; agenteId?: AgenteVirtualId }) {
  const salvar = agenteId === 'lidia' ? salvarAcompanhamentoLidia : salvarAcompanhamentoKeila
  const dados = acompanhamento(caso.payload)
  const suspenso = ['atendimento_humano', 'concluido'].includes(caso.payload.estado)
  const editar = podeEditar && caso.payload.estado !== 'concluido'
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const base = (operacao: string, pendencia?: string) => <><input type="hidden" name="id" value={caso.id} /><input type="hidden" name="operacao" value={operacao} />{pendencia ? <input type="hidden" name="pendencia_id" value={pendencia} /> : null}</>
  const acordo = <FormField label="Acordo relacionado"><Select name="acordo_id" aria-label="Acordo relacionado"><option value="">Caso sem acordo específico</option>{caso.payload.acordos?.map(a => <option key={a.id} value={a.id}>{a.unidade} · {a.id}</option>)}</Select></FormField>
  return <Card className="space-y-5 p-5">
    <h3 className="font-semibold">Acompanhamento e conversas</h3>
    <p className="text-sm text-slate-600">Prazos em dias corridos. Cobranças apenas simuladas. {suspenso ? 'Réguas suspensas neste caso.' : 'Registre o retorno e encerre somente a pendência que foi resolvida.'}</p>
    {editar && !suspenso ? <form action={salvar}>{base('assumir')}<Button variant="secondary">Assumir atendimento humano e suspender réguas</Button></form> : null}
    {dados.pendencias.length ? dados.pendencias.map(p => <article key={p.id} className="space-y-3 rounded-lg border p-3">
      <p className="font-medium">{TIPOS_PENDENCIA[p.tipo]} · {p.resolvida_em ? 'Resolvida' : suspenso ? 'Suspensa' : p.prazo <= hoje ? 'Acompanhar agora' : 'Aguardando'}</p>
      <p className="text-sm">Aguardando: {p.aguardando} · Próximo prazo: {p.prazo.split('-').reverse().join('/')} · Intervalo: {p.intervalo_dias} dia(s)</p>
      <p className="text-sm">{p.proxima_acao}</p>{p.acordo_id ? <p className="text-xs">Acordo: {p.acordo_id}</p> : null}
      {p.evidencia ? <p className="text-sm">Retorno registrado: {p.evidencia}</p> : null}
      {p.simulacoes.map(s => <details key={s.em}><summary className="cursor-pointer text-sm">Cobrança simulada · {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(s.em))}</summary><p className="whitespace-pre-wrap text-sm">{s.texto}</p></details>)}
      {editar && !p.resolvida_em ? <>
        {!suspenso && p.prazo <= hoje ? <form action={salvar} className="flex flex-wrap items-end gap-3">{base('simular', p.id)}<FormField label="Nome para saudação"><Input name="nome" aria-label="Nome para saudação" /></FormField><Button variant="secondary">Simular cobrança e agendar próximo prazo</Button></form> : null}
        <form action={salvar} className="space-y-2">{base('resolver', p.id)}<FormField label="Retorno que resolveu esta pendência"><Textarea name="evidencia" aria-label="Retorno que resolveu esta pendência" required maxLength={4000} /></FormField><Button variant="secondary">Registrar retorno e resolver</Button></form>
      </> : null}
    </article>) : <p className="text-sm text-slate-500">Nenhuma pendência de acompanhamento registrada.</p>}
    {editar ? <details><summary className="cursor-pointer font-medium">Abrir pendência de acompanhamento</summary><form action={salvar} className="mt-3 grid gap-3 md:grid-cols-2">{base('pendencia')}
      <FormField label="Tipo de pendência"><Select name="tipo" aria-label="Tipo de pendência">{Object.entries(TIPOS_PENDENCIA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></FormField>
      <FormField label="Aguardando retorno de"><Input name="aguardando" aria-label="Aguardando retorno de" required maxLength={1000} /></FormField>
      <FormField label="Próximo prazo"><Input name="prazo" aria-label="Próximo prazo" type="date" required /></FormField>
      <FormField label="Repetir após quantos dias"><Input name="intervalo_dias" aria-label="Repetir após quantos dias" type="number" min={1} max={365} required /></FormField>
      <FormField label="Próxima ação"><Input name="proxima_acao" aria-label="Próxima ação" required maxLength={1000} /></FormField>{acordo}<Button>Criar pendência</Button>
    </form></details> : null}
    <h4 className="font-medium">Vínculos com Outlook</h4>
    <p className="text-sm text-slate-500">Registro supervisionado dos identificadores. A sincronização automática com o Outlook ainda não está conectada.</p>
    {dados.conversas.map(v => <div key={`${v.conta}:${v.conversation_id}:${v.message_id}`} className="break-all rounded border p-3 text-xs"><p>{v.interlocutor} · {v.conta}</p><p>Conversa: {v.conversation_id}</p><p>Mensagem: {v.message_id}</p>{v.internet_message_id ? <p>Internet Message ID: {v.internet_message_id}</p> : null}{v.acordo_id ? <p>Acordo: {v.acordo_id}</p> : null}</div>)}
    {editar ? <details><summary className="cursor-pointer font-medium">Vincular mensagem do Outlook</summary><form action={salvar} className="mt-3 grid gap-3 md:grid-cols-2">{base('vincular')}
      {[['conta', 'Conta do Outlook'], ['interlocutor', 'Interlocutor'], ['conversation_id', 'Conversation ID'], ['message_id', 'Message ID'], ['internet_message_id', 'Internet Message ID (opcional)']].map(([name, label]) => <FormField key={name} label={label}><Input name={name} aria-label={label} required={name !== 'internet_message_id'} type={name === 'conta' ? 'email' : 'text'} maxLength={1000} /></FormField>)}{acordo}<Button>Vincular mensagem</Button>
    </form></details> : null}
  </Card>
}

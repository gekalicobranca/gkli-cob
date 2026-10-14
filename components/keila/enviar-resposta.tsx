import { conferirRascunhoKeila } from '@/features/keila/conferencia-actions'
import { RevisaoWhatsAppKeila } from './revisao-whatsapp'
import { createAdminClient } from '@/utils/supabase/admin'
import type { KeilaCasoPayload } from '@/features/keila/casos'
import { aprovarEnviarRespostaKeila } from '@/features/keila/resposta-actions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export async function EnviarRespostaKeila({ caso, podeEditar }: { caso: { id: string; carteira_id: string; updated_at: string; payload: KeilaCasoPayload }; podeEditar: boolean }) {
  const conferencia=caso.payload.conferencia_proposta
  const faltaConferencia=caso.payload.intencao==='parcelamento' && (!conferencia || conferencia.texto.trim()!==caso.payload.resposta_simulada?.trim())
  const aprovada = caso.payload.resposta_aprovada
  const email = caso.payload.emails.at(-1)
  let status = 'Aprovação registrada · encaminhamento pendente'
  let erro: string | null = null
  let podeRetomar = false
  if (aprovada) {
    const result = await createAdminClient().from('mensagens').select('status,enviada_em,agendada_para,erro_envio').eq('id', aprovada.mensagem_id).eq('carteira_id', caso.carteira_id).maybeSingle()
    if (result.error) status = 'Status do envio indisponível · recarregue para conferir'
    else if (!result.data) podeRetomar = true
    else if (result.data) {
      const m = result.data
      status = m.status === 'enviada' ? `Enviada · ${m.enviada_em ?? ''}` : m.status === 'agendada' ? `Aguardando envio · ${m.agendada_para ?? ''}` : `Status: ${m.status}`
      erro = m.erro_envio
      podeRetomar = m.status === 'pendente_aprovacao'
    }
  }
  const whatsapp = <RevisaoWhatsAppKeila caso={caso} podeEditar={podeEditar}/>
  if (!email || !caso.payload.resposta_simulada?.trim()) return whatsapp
  return <>{whatsapp}<Card className="space-y-3 p-5"><h3 className="font-semibold">Aprovar e enviar resposta</h3>
    {aprovada ? <><p role="status" className="text-sm font-medium">{status}</p>{erro ? <p role="alert" className="text-sm text-rose-700">{erro}</p> : null}<p className="text-xs text-slate-500">Aprovada em {aprovada.em} · registro {aprovada.mensagem_id}</p></> : null}
    <p className="text-sm">De: keila@gekali.com.br<br />Para: {aprovada?.destinatario ?? email.remetente}<br />Assunto: {aprovada?.assunto ?? (/^re:/i.test(email.assunto) ? email.assunto : `Re: ${email.assunto}`)}</p>
    <details><summary className="cursor-pointer text-sm">Conferir texto {aprovada ? 'aprovado' : 'final'}</summary><p className="mt-3 whitespace-pre-wrap text-sm">{aprovada?.texto ?? caso.payload.resposta_simulada}</p></details>
    {(aprovada?.anexos ?? caso.payload.resposta_anexos)?.map((anexo, i) => <p key={anexo.sha256} className="text-sm"><a className="underline" href={`/api/keila/casos/${caso.id}/anexos/${i}`} target="_blank" rel="noreferrer">Conferir anexo: {anexo.nome}</a></p>)}
    {conferencia ? <section className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm">
      <h4 className="font-semibold">Cotas e condições conferidas</h4>
      <p>Fonte: relatório da administradora · {conferencia.data_fonte} · versão {conferencia.hash.slice(0,12)}</p>
      <ul className="mt-2">{conferencia.plano.incluidas.map(c=><li key={c.vencimento}>Incluída: {c.vencimento.split('-').reverse().join('/')} · {c.valor.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} · linha {c.linha}</li>)}</ul>
      <ul className="mt-2">{conferencia.plano.excluidas.map(c=><li key={c.vencimento}>Excluída: {c.vencimento.split('-').reverse().join('/')} · {c.motivo}</li>)}</ul>
      {conferencia.plano.divergencias?.length ? <div className="mt-2 rounded bg-amber-50 p-2"><strong>Diferenças para conferir</strong>{conferencia.plano.divergencias.map(d=><p key={d.vencimento}>{d.vencimento}: cadastro {d.cadastro.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}; fonte {d.fonte.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}. {d.motivo}</p>)}</div> : null}
      <p className="mt-2">Despesas: {conferencia.plano.avista.percentual}% à vista / {conferencia.plano.parcelado.percentual}% parcelado. Total parcelado: {conferencia.plano.parcelado.total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}.</p>
      <details><summary>Identificação da fonte</summary><p className="break-all">Arquivo: {conferencia.arquivo_id}<br/>SHA-256: {conferencia.sha256}</p></details>
    </section> : null}
    {podeEditar && !aprovada && caso.payload.intencao==='parcelamento' && !['atendimento_humano','concluido'].includes(caso.payload.estado) ? <form action={conferirRascunhoKeila} className="space-y-2 rounded-lg border p-3">
      <input type="hidden" name="id" value={caso.id}/><input type="hidden" name="updated_at" value={caso.updated_at}/>
      <p className="text-sm">{faltaConferencia ? 'Aprovação bloqueada até conferir o relatório completo.' : 'Para mudar condições ou atualizar a fonte, gere uma nova versão.'} A conferência substitui o rascunho por texto calculado e não envia e-mail.</p>
      <label className="block text-sm">Parcelas <input className="rounded border p-1" type="number" name="quantidade" min="2" max="120" defaultValue={conferencia?.quantidade??3} required/></label>
      <label className="block text-sm">Primeiro vencimento proposto <input className="rounded border p-1" type="date" name="vencimento" defaultValue={conferencia?.vencimento} required/></label>
      <Button type="submit">Conferir relatório e gerar rascunho</Button>
    </form> : null}
    <p className="text-xs text-slate-500">O envio segue a agenda da carteira. A aprovação libera esta resposta e fica registrada no histórico.</p>
    {caso.payload.respostas_anteriores?.map(r => <details key={r.mensagem_id}><summary className="cursor-pointer text-sm">Resposta anterior aprovada · {r.em}</summary><p className="mt-2 whitespace-pre-wrap text-sm">Para: {r.destinatario}{'\n'}Assunto: {r.assunto}{'\n\n'}{r.texto}</p><p className="text-xs text-slate-500">Registro: {r.mensagem_id}</p></details>)}
    {podeEditar && !['atendimento_humano', 'concluido'].includes(caso.payload.estado) && (!aprovada || podeRetomar) && (aprovada || !faltaConferencia) ? <form action={aprovarEnviarRespostaKeila} className="space-y-3"><input type="hidden" name="id" value={caso.id} /><input type="hidden" name="updated_at" value={caso.updated_at} /><label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmar" value="sim" required />Conferi o destinatário, assunto e texto final e autorizo o envio desta resposta.</label><Button type="submit">{aprovada ? 'Retomar encaminhamento aprovado' : 'Aprovar e enviar'}</Button></form> : null}
    {podeEditar && aprovada ? <p className="text-xs text-slate-500">O texto aprovado permanece preservado. Consulte o registro na mensageria para tratar falhas ou cancelamentos.</p> : null}
  </Card></>
}

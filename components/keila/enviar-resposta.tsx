import { createAdminClient } from '@/utils/supabase/admin'
import type { KeilaCasoPayload } from '@/features/keila/casos'
import { aprovarEnviarRespostaKeila } from '@/features/keila/resposta-actions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export async function EnviarRespostaKeila({ caso, podeEditar }: { caso: { id: string; carteira_id: string; updated_at: string; payload: KeilaCasoPayload }; podeEditar: boolean }) {
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
  if (!email || !caso.payload.resposta_simulada?.trim()) return null
  return <Card className="space-y-3 p-5"><h3 className="font-semibold">Aprovar e enviar resposta</h3>
    {aprovada ? <><p role="status" className="text-sm font-medium">{status}</p>{erro ? <p role="alert" className="text-sm text-rose-700">{erro}</p> : null}<p className="text-xs text-slate-500">Aprovada em {aprovada.em} · registro {aprovada.mensagem_id}</p></> : null}
    <p className="text-sm">De: keila@gekali.com.br<br />Para: {aprovada?.destinatario ?? email.remetente}<br />Assunto: {aprovada?.assunto ?? (/^re:/i.test(email.assunto) ? email.assunto : `Re: ${email.assunto}`)}</p>
    <details><summary className="cursor-pointer text-sm">Conferir texto {aprovada ? 'aprovado' : 'final'}</summary><p className="mt-3 whitespace-pre-wrap text-sm">{aprovada?.texto ?? caso.payload.resposta_simulada}</p></details>
    <p className="text-xs text-slate-500">O envio segue a agenda da carteira. A aprovação libera esta resposta e fica registrada no histórico.</p>
    {caso.payload.respostas_anteriores?.map(r => <details key={r.mensagem_id}><summary className="cursor-pointer text-sm">Resposta anterior aprovada · {r.em}</summary><p className="mt-2 whitespace-pre-wrap text-sm">Para: {r.destinatario}{'\n'}Assunto: {r.assunto}{'\n\n'}{r.texto}</p><p className="text-xs text-slate-500">Registro: {r.mensagem_id}</p></details>)}
    {podeEditar && !['atendimento_humano', 'concluido'].includes(caso.payload.estado) && (!aprovada || podeRetomar) ? <form action={aprovarEnviarRespostaKeila} className="space-y-3"><input type="hidden" name="id" value={caso.id} /><input type="hidden" name="updated_at" value={caso.updated_at} /><label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmar" value="sim" required />Conferi o destinatário, assunto e texto final e autorizo o envio desta resposta.</label><Button type="submit">{aprovada ? 'Retomar encaminhamento aprovado' : 'Aprovar e enviar'}</Button></form> : null}
    {podeEditar && aprovada ? <p className="text-xs text-slate-500">O texto aprovado permanece preservado. Consulte o registro na mensageria para tratar falhas ou cancelamentos.</p> : null}
  </Card>
}

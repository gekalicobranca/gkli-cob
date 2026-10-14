import Link from 'next/link'
import {createAdminClient} from '@/utils/supabase/admin'
import {applyCarteiraScope} from '@/utils/auth/apply-carteira-scope'
import type {KeilaCaso} from '@/features/keila/queries'
import {prepararAvisoRetornoEmail} from '@/features/keila/retorno-email-actions'
import {cancelarWhatsAppKeila} from '@/features/keila/whatsapp-rascunho-actions'
import {Card} from '@/components/ui/card'
import {Button} from '@/components/ui/button'

export async function FilaWhatsAppKeila({casos,carteiraIds,podeEditar}:{casos:KeilaCaso[];carteiraIds:string[]|null;podeEditar:boolean}){
 const db=createAdminClient(),comWhatsApp=casos.filter(c=>c.payload.rascunho_whatsapp)
 const ids=comWhatsApp.flatMap(c=>c.payload.rascunho_whatsapp?.liberacao?.mensagem_id??[])
 const [retornos,mensagens]=await Promise.all([
  applyCarteiraScope(db.from('email_retornos').select('id,unidade_id,destinatario,classificacao,motivo,recebido_em,outlook_url').order('recebido_em',{ascending:false}).limit(100),carteiraIds),
  ids.length?applyCarteiraScope(db.from('mensagens').select('id,status,provider_status,erro_envio,enviada_em').in('id',ids),carteiraIds):{data:[],error:null},
 ])
 if(retornos.error||mensagens.error)return <Card className="p-5"><p role="alert">Não foi possível consultar a fila. Recarregue para conferir.</p></Card>
 const porId=new Map<string,{status:string;provider_status:string|null;erro_envio:string|null}>((mensagens.data??[]).map(m=>[m.id,m]))
 return <div className="space-y-4">
 <Card className="space-y-3 p-5"><h2 className="text-lg font-semibold">Fila de WhatsApp da Keila</h2>
 <p className="text-sm text-slate-600">Contatos independentes dos flows. O aviso fica como rascunho até sua aprovação e liberação no atendimento. A fila respeita os horários e limites da sessão de WhatsApp.</p>
 {comWhatsApp.length?<ul className="divide-y">{comWhatsApp.map(c=>{
  const r=c.payload.rascunho_whatsapp!,m=r.liberacao?porId.get(r.liberacao.mensagem_id):undefined
  const status=r.liberacao?(m?.provider_status==='incerto'?'Envio incerto · conferir':m?.status==='enviada'?'Enviada':m?`Fila · ${m.status}`:'Status indisponível'):r.aprovacao?'Aprovado · aguardando liberação':'Rascunho · aguardando aprovação'
  return <li key={c.id} className="space-y-1 py-3"><Link className="font-medium underline" href={`/app/gestao/keila?caso=${c.id}#resposta-caso`}>{c.titulo}</Link><p className="text-sm">+{r.destinatario} · {status}</p>{m?.erro_envio?<p className="text-sm text-rose-700">{m.erro_envio}</p>:null}{podeEditar&&m&&['agendada','falha'].includes(m.status)&&!['reservado','incerto','enviado'].includes(m.provider_status??'')?<form action={cancelarWhatsAppKeila} className="flex flex-wrap items-center gap-3"><input type="hidden" name="id" value={c.id}/><label className="flex gap-2 text-sm"><input name="confirmar" type="checkbox" value="sim" required/>Cancelar esta mensagem antes do envio</label><Button type="submit" variant="secondary">Cancelar na fila</Button></form>:null}</li>
 })}</ul>:<p className="text-sm">Nenhum aviso por WhatsApp preparado.</p>}
 <p className="text-xs text-slate-500">Atendimentos carregados: até 200 recentes. Envios anteriores permanecem na mensageria.</p></Card>
 <Card className="space-y-3 p-5"><h2 className="text-lg font-semibold">Retornos de erro de e-mail</h2><p className="text-sm text-slate-600">Inexistente: pedir atualização do contato. Temporário: avisar sem invalidar o endereço. Inconclusivo: revisar o diagnóstico.</p>
 {(retornos.data??[]).length?<ul className="divide-y">{retornos.data!.map(r=>{
  const caso=casos.find(c=>c.payload.falhas_email?.some(f=>f.id===r.id))
  return <li key={r.id} className="space-y-2 py-3"><p className="text-sm font-medium">{r.destinatario} · {r.classificacao==='revisao'?'Revisão necessária':r.classificacao==='temporaria'?'Falha temporária':'Endereço inexistente'}</p><p className="text-sm text-slate-600">{r.motivo}</p><a className="text-sm underline" href={r.outlook_url} target="_blank" rel="noreferrer">Conferir original no Outlook</a>{caso?<p><Link className="text-sm underline" href={`/app/gestao/keila?caso=${caso.id}#resposta-caso`}>Abrir atendimento</Link></p>:null}{podeEditar&&(!caso||(!caso.payload.rascunho_whatsapp&&r.classificacao!=='revisao'))?<form action={prepararAvisoRetornoEmail}><input type="hidden" name="retorno_id" value={r.id}/><Button type="submit" variant="secondary">{r.classificacao==='revisao'?'Registrar pendência de revisão':'Preparar contato por WhatsApp'}</Button></form>:null}</li>
 })}</ul>:<p className="text-sm">Nenhum retorno registrado.</p>}<p className="text-xs text-slate-500">Até 100 retornos recentes nas carteiras permitidas.</p></Card>
 </div>
}

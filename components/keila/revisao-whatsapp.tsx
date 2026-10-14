import type {RascunhoWhatsAppKeila} from '@/features/keila/whatsapp-rascunho'
import {aprovarWhatsAppKeila,liberarWhatsAppKeila} from '@/features/keila/whatsapp-rascunho-actions'
import {createAdminClient} from '@/utils/supabase/admin'
import {Card} from '@/components/ui/card'
import {Button} from '@/components/ui/button'
export async function RevisaoWhatsAppKeila({caso,podeEditar}:{caso:{id:string;carteira_id:string;updated_at:string;payload:{estado:string;rascunho_whatsapp?:RascunhoWhatsAppKeila}};podeEditar:boolean}){
 const r=caso.payload.rascunho_whatsapp;if(!r)return null
 let status='',erro:string|null=null
 if(r.liberacao){
  const result=await createAdminClient().from('mensagens').select('status,enviada_em,erro_envio,provider_status').eq('id',r.liberacao.mensagem_id).eq('carteira_id',caso.carteira_id).maybeSingle()
  status=result.error||!result.data?'Status indisponível; confira na mensageria.':result.data.status==='enviada'?`Enviada · ${result.data.enviada_em??''}`:result.data.provider_status==='incerto'?'Envio incerto · conferir antes de qualquer nova tentativa':`Fila de WhatsApp · ${result.data.status}`
  erro=result.data?.erro_envio??null
 }
 return <Card className="space-y-3 p-5"><h3 className="font-semibold">Rascunho de WhatsApp · {r.aprovacao?'aprovado':'revisão pendente'}</h3>
 <p className="text-sm">Destinatário: +{r.destinatario}. Número cadastrado; WhatsApp ativo ainda não confirmado.</p>
 <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{r.texto}</p>
 <p className="text-sm">Esta aprovação registra somente sua revisão. Não envia nem agenda a mensagem.</p>
 {r.aprovacao?<p role="status" className="text-sm">Aprovado em {new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(r.aprovacao.em))} · {r.liberacao?'liberação registrada':'aguardando liberação de envio'}.</p>:podeEditar&&!['atendimento_humano','concluido'].includes(caso.payload.estado)?<form action={aprovarWhatsAppKeila} className="space-y-3">
 <input type="hidden" name="id" value={caso.id}/><input type="hidden" name="updated_at" value={caso.updated_at}/><input type="hidden" name="versao_hash" value={r.versao_hash}/>
 <label className="flex gap-2 text-sm"><input type="checkbox" name="confirmar" value="sim" required/>Conferi o número e o texto e aprovo este rascunho de WhatsApp, sem enviar.</label>
 <Button type="submit">Aprovar rascunho de WhatsApp</Button></form>:null}
 {r.liberacao?<><p role="status" className="text-sm">{status}</p>{erro?<p role="alert" className="text-sm text-rose-700">{erro}</p>:null}<p className="break-all text-xs">Registro: {r.liberacao.mensagem_id}</p><a href="/app/mensageria" className="text-sm underline">Acompanhar na mensageria</a></>:r.aprovacao&&podeEditar&&!['atendimento_humano','concluido'].includes(caso.payload.estado)?<form action={liberarWhatsAppKeila} className="space-y-3">
 <input type="hidden" name="id" value={caso.id}/><input type="hidden" name="updated_at" value={caso.updated_at}/><input type="hidden" name="versao_hash" value={r.versao_hash}/>
 <label className="flex gap-2 text-sm"><input type="checkbox" name="confirmar" value="sim" required/>Autorizo o envio deste texto aprovado para +{r.destinatario} pelo WhatsApp.</label>
 <p className="text-xs text-slate-600">A liberação encaminha à fila, que respeita os horários e limites do transporte. O status confirma o envio.</p>
 <Button type="submit">Liberar envio pelo WhatsApp</Button></form>:null}</Card>
}

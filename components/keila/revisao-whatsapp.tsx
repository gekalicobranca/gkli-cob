import type {RascunhoWhatsAppKeila} from '@/features/keila/whatsapp-rascunho'
import {aprovarWhatsAppKeila} from '@/features/keila/whatsapp-rascunho-actions'
import {Card} from '@/components/ui/card'
import {Button} from '@/components/ui/button'
export function RevisaoWhatsAppKeila({caso,podeEditar}:{caso:{id:string;updated_at:string;payload:{estado:string;rascunho_whatsapp?:RascunhoWhatsAppKeila}};podeEditar:boolean}){
 const r=caso.payload.rascunho_whatsapp;if(!r)return null
 return <Card className="space-y-3 p-5"><h3 className="font-semibold">Rascunho de WhatsApp · {r.aprovacao?'aprovado':'revisão pendente'}</h3>
 <p className="text-sm">Destinatário: +{r.destinatario}. Número cadastrado; WhatsApp ativo ainda não confirmado.</p>
 <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{r.texto}</p>
 <p className="text-sm">Esta aprovação registra somente sua revisão. Não envia nem agenda a mensagem.</p>
 {r.aprovacao?<p role="status" className="text-sm">Aprovado em {new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(r.aprovacao.em))} · sem envio.</p>:podeEditar&&!['atendimento_humano','concluido'].includes(caso.payload.estado)?<form action={aprovarWhatsAppKeila} className="space-y-3">
 <input type="hidden" name="id" value={caso.id}/><input type="hidden" name="updated_at" value={caso.updated_at}/><input type="hidden" name="versao_hash" value={r.versao_hash}/>
 <label className="flex gap-2 text-sm"><input type="checkbox" name="confirmar" value="sim" required/>Conferi o número e o texto e aprovo este rascunho de WhatsApp, sem enviar.</label>
 <Button type="submit">Aprovar rascunho de WhatsApp</Button></form>:null}</Card>
}

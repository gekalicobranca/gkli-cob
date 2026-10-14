import type {FalhaEmailKeila} from '@/features/keila/retorno-email-whatsapp'
import {Card} from '@/components/ui/card'
export function FalhasEmailKeila({falhas}:{falhas:FalhaEmailKeila[]}){
 if(!falhas.length)return null
 return <Card className="space-y-3 p-5"><h3 className="font-semibold">Falha de entrega do e-mail</h3>{falhas.map(f=><div key={f.id} className="space-y-1 text-sm"><p>{f.destinatario} · {f.classificacao==='inexistente'?'Endereço inexistente · envio de e-mail bloqueado':f.classificacao==='temporaria'?'Falha temporária · endereço preservado':'Diagnóstico inconclusivo · revisão necessária'}</p><p className="text-slate-600">{f.motivo}</p><a className="underline" href={f.outlook_url} target="_blank" rel="noreferrer">Conferir retorno original no Outlook</a></div>)}<p className="text-xs text-slate-500">O aviso por WhatsApp não inclui saldo ou proposta de acordo. Aprovação e liberação são específicas deste texto e destinatário.</p></Card>
}

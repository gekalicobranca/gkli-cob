import {createHash} from 'node:crypto'
export type RascunhoWhatsAppKeila={destinatario:string;texto:string;versao_hash:string;criado_em:string;conferencia_hash?:string;aprovacao?:{em:string;usuario_id:string;versao_hash:string};liberacao?:{em:string;usuario_id:string;mensagem_id:string;email_chave:string|null}}
export function criarRascunhoWhatsApp(destinatario:string,texto:string,em=new Date().toISOString()):RascunhoWhatsAppKeila{
 if(!/^55\d{2}9\d{8}$/.test(destinatario))throw new Error('Celular brasileiro inválido para o rascunho.')
 texto=texto.trim();if(!texto||texto.length>4000)throw new Error('Texto de WhatsApp inválido.')
 return {destinatario,texto,criado_em:em,versao_hash:createHash('sha256').update(JSON.stringify({canal:'whatsapp',destinatario,texto})).digest('hex')}
}
export function aprovarRascunhoWhatsApp(r:RascunhoWhatsAppKeila,hash:string,usuarioId:string,em=new Date().toISOString()):RascunhoWhatsAppKeila{
 const atual=criarRascunhoWhatsApp(r.destinatario,r.texto,r.criado_em)
 if(hash!==atual.versao_hash||r.versao_hash!==atual.versao_hash)throw new Error('Rascunho mudou; revise novamente antes de aprovar.')
 if(r.aprovacao)return r
 return {...r,aprovacao:{em,usuario_id:usuarioId,versao_hash:hash}}
}
export function validarLiberacaoWhatsApp(r:RascunhoWhatsAppKeila,hash:string){
 const atual=criarRascunhoWhatsApp(r.destinatario,r.texto,r.criado_em)
 if(hash!==atual.versao_hash||r.versao_hash!==hash||r.aprovacao?.versao_hash!==hash)throw new Error('Revise e aprove a versão atual antes de liberar o envio.')
}

import type {KeilaCasoPayload} from './casos'

/** Destino de resposta recebida ou contato proativo autorizado, sem simular recebimento. */
export function destinoRespostaKeila(payload:KeilaCasoPayload){
 const email=payload.emails.at(-1)
 if(email)return {...email,proativo:false}
 const contato=payload.contato_proativo
 if(!contato||contato.origem!=='solicitacao_operador'||payload.unidade_ids.length!==1)return undefined
 return {chave:`cadastro:${payload.unidade_ids[0]}:${contato.email.toLowerCase()}`,nome:contato.nome,remetente:contato.email,assunto:contato.assunto,proativo:true}
}

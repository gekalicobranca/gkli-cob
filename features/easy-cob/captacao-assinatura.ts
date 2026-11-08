import { createHmac, timingSafeEqual } from 'node:crypto';
function canonical(value:unknown):string {
  if(value===null||typeof value!=='object') return JSON.stringify(value);
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object=value as Record<string,unknown>;
  return `{${Object.keys(object).filter(k=>object[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${canonical(object[k])}`).join(',')}}`;
}
export function gerarAssinaturaCaptacao(key:string,conversaoId:string,condominioId:string,carteiraId:string,preview:Record<string,unknown>) {
  const marker={...(preview.easyCaptacao as Record<string,unknown>)};delete marker.assinatura;
  return createHmac('sha256',key).update(canonical({conversaoId,condominioId,carteiraId,preview:{...preview,easyCaptacao:marker}})).digest('hex');
}
export function verificarAssinaturaCaptacao(key:string,id:string,condominio:string,carteira:string,preview:Record<string,unknown>,userId:string) {
  const marker=preview.easyCaptacao as {operadorId?:string;assinatura?:string};
  if(!marker||marker.operadorId!==userId) throw new Error('Esta prévia pertence a outro operador. Envie o arquivo novamente.');
  const expected=Buffer.from(gerarAssinaturaCaptacao(key,id,condominio,carteira,preview),'hex');
  const received=Buffer.from(marker.assinatura??'','hex');
  if(received.length!==expected.length||!timingSafeEqual(expected,received)) throw new Error('A prévia foi alterada. Envie o arquivo novamente.');
}

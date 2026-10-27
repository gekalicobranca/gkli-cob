import {mkdir,writeFile,rename,unlink} from 'node:fs/promises'
import path from 'node:path'

export async function concluirComRetomada({parametros,gravar,confirmar,checkpoint,limpar,esperar=ms=>new Promise(r=>setTimeout(r,ms))}){
 await checkpoint(parametros)
 for(let tentativa=1;tentativa<=2;tentativa++){
  let erro
  try{const r=await gravar(parametros);if(!r.error){await limpar();return {tentativas:tentativa,confirmada:true}}erro=r.error}
  catch(e){erro=e}
  // Resposta perdida após commit não autoriza repetir lote, cursor ou baixas.
  if(parametros.p_evidencias.length&&await confirmar().catch(()=>false)){await limpar();return {tentativas:tentativa,confirmada:true,resposta_recuperada:true}}
  if(tentativa===2||/reserva.*expirada|lote inv[aá]lido|unidade fora|unidades incompletas|permission denied|token obrigat[oó]rio/i.test(String(erro.message)))break
  await esperar(3000)
 }
 throw Object.assign(Error('Lote sem confirmação de persistência; cópia local preservada e retomada pelo cursor confirmado no banco.'),{code:'SCANNER_PERSISTENCIA_PENDENTE'})
}

export function checkpointLote(token,diretorio='.local/scanner/lotes-pendentes'){
 if(!/^[0-9a-f-]{36}$/i.test(token))throw Error('Token de checkpoint inválido.')
 const arquivo=path.resolve(diretorio,token+'.json'),temporario=arquivo+'.tmp'
 return {
  checkpoint:async dados=>{await mkdir(path.dirname(arquivo),{recursive:true});await writeFile(temporario,JSON.stringify({criado_em:new Date().toISOString(),parametros:dados}),{mode:0o600});await rename(temporario,arquivo)},
  limpar:async()=>{await unlink(arquivo).catch(e=>{if(e.code!=='ENOENT')throw e})},
 }
}

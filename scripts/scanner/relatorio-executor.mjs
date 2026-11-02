import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

// E-mail não compartilha sessão, trava ou orçamento de navegação com os portais.
export async function executarRelatoriosScanner(){
 if(process.env.SCANNER_RELATORIOS_EMAIL_ATIVO!=='true')return
 const arquivo=fileURLToPath(new URL('./relatorios-email.ts',import.meta.url))
 try{
  await new Promise((resolve,reject)=>{
   const p=spawn(process.execPath,['--import','tsx',arquivo],{cwd:path.resolve(path.dirname(arquivo),'../..'),env:process.env,windowsHide:true,timeout:60000,stdio:['ignore','pipe','pipe']})
   let saida=''
   p.stdout.on('data',s=>{saida=(saida+s).slice(-16000)})
   p.stderr.on('data',()=>{})
   p.once('error',reject)
   p.once('close',code=>{if(saida.trim())console.log(saida.trim());code===0?resolve():reject(Error('Relatório preservado para retomada.'))})
  })
 }catch{console.error(JSON.stringify({relatorios_status:'retomada_pendente',motivo:'Envio do relatório não interrompe a coleta dos portais.'}))}
}

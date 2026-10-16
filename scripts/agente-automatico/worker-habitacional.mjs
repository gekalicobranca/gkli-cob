import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {concluirExecucaoMaestro} from './concluir-maestro.mjs';
export function extrairTokenHabita(text){return text.match(/paravoce@habita\.com\.br[\s\S]{0,1200}?concluir o login:\s*(\d{4,8})/i)?.[1]}
export async function coletarHabitacional(nomePortal,destino){
const text=fs.readFileSync('.env.local','utf8');const index=text.indexOf('cobranca_OUTLOOK_EMAIL=');if(index<0)throw Error('Configuração da caixa de cobrança ausente');const block=text.slice(index);const pass=process.env.COBRANCA_OUTLOOK_PASSWORD || block.match(/^[^#\r\n=]*PASSWORD\s*=\s*(.+)$/mi)?.[1]?.trim().replace(/^['"]|['"]$/g,'');if(!pass)throw Error('Senha da caixa não localizada');
const b=await chromium.launch({channel:'chrome',headless:true});const p=await b.newPage();try{await p.goto('https://outlook.office.com/mail/',{waitUntil:'domcontentloaded'});await p.locator('input[type=email]').fill('cobranca@genskeadvogados.com.br');await p.getByRole('button',{name:/Next|Avançar/i}).click();const pw=p.locator('input[type=password]');await pw.waitFor({state:'visible',timeout:30000});await pw.fill(pass);await p.getByRole('button',{name:/Sign in|Entrar/i}).click();await p.waitForTimeout(6000);await p.getByRole('button',{name:/^Não$|^No$/}).click();await p.getByText(/Habita Para Você.*Envio de Token/).first().waitFor({state:'visible',timeout:60000});
const oldText=await p.locator('body').innerText();const oldToken=extrairTokenHabita(oldText);
const portal=await b.newPage();await portal.goto('https://apps.habita.com.br/parceiro/Login',{waitUntil:'networkidle'});await portal.locator('#email').fill('cobranca@genskeadvogados.com.br');await portal.getByRole('button',{name:'Avançar',exact:true}).filter({visible:true}).first().click();await portal.locator('#token').waitFor({state:'visible'});console.log('Token novo solicitado');
let token;for(let i=0;i<90;i++){const text=await p.locator('body').innerText();const t=extrairTokenHabita(text);if(t&&t!==oldToken){token=t;break;}await p.waitForTimeout(1000)}if(!token)throw Error('Token novo não recebido no prazo');
await portal.locator('#token').fill(token);await portal.getByRole('button',{name:'Avançar',exact:true}).filter({visible:true}).first().click();await portal.getByText(nomePortal+' - Advogado',{exact:false}).click();await portal.getByRole('button',{name:'Avançar',exact:true}).filter({visible:true}).first().click();await portal.waitForTimeout(2000);console.log('Portal autenticado',await portal.title());if(!(await portal.locator('body').innerText()).includes(nomePortal))throw Error('Condomínio selecionado incorretamente');
await portal.goto('https://apps.habita.com.br/parceiro/InadimplenciaAtualizada/index',{waitUntil:'networkidle'});await portal.getByText('Todas as unidades',{exact:true}).click();
const pdfPromise=portal.waitForResponse(r=>/application\/pdf/i.test(r.headers()['content-type']||''),{timeout:120000});await portal.getByText('Processar',{exact:true}).click();const response=await pdfPromise;const bytes=await response.body();if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Resposta não é PDF');fs.mkdirSync(path.dirname(destino),{recursive:true});fs.writeFileSync(destino,bytes);console.log('PDF coletado',bytes.length);return bytes;}finally{await b.close()}

}

async function main(){
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
 const id=process.env.AGENTE_EXECUCAO_ID;if(!id)throw Error('Informe AGENTE_EXECUCAO_ID para execução pontual da Habitacional');
 const {data:e,error}=await db.from('agente_execucoes').select('id,status,receita:agente_receitas(config_json,script_key)').eq('id',id).single();if(error)throw error;if(e.receita.script_key!=='captacao_habitacional'||e.status!=='pendente')throw Error('Execução indisponível');
 const claim=await db.from('agente_execucoes').update({status:'em_execucao',iniciado_em:new Date().toISOString(),erro_mensagem:null}).eq('id',id).eq('status','pendente').select('id');if(claim.error)throw claim.error;if(!claim.data.length)return;
 try{
 const nome=e.receita.config_json.nome_portal_validado;if(!nome)throw Error('Nome do condomínio no portal não validado');
 const bytes=await coletarHabitacional(nome,path.resolve('outputs/agente-automatico',id,'inadimplencia.pdf'));
 const storage=id+'/inadimplencia.pdf';const up=await db.storage.from('agente-relatorios').upload(storage,bytes,{contentType:'application/pdf',upsert:true});if(up.error)throw up.error;
 const ar=await db.from('agente_arquivos').insert({execucao_id:id,nome_arquivo:'inadimplencia.pdf',tipo_arquivo:'application/pdf',storage_path:storage,tamanho_bytes:bytes.length,hash_arquivo:createHash('sha256').update(bytes).digest('hex'),status_validacao:'aguardando_validacao'});if(ar.error)throw ar.error;
 await concluirExecucaoMaestro(db,id);const done=await db.from('agente_execucoes').update({status:'sucesso',finalizado_em:new Date().toISOString()}).eq('id',id);if(done.error)throw done.error;console.log('Execução Habitacional concluída',id);
 }catch(error){await db.from('agente_execucoes').update({status:'precisa_intervencao',erro_mensagem:error.message,finalizado_em:new Date().toISOString()}).eq('id',id);throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1});

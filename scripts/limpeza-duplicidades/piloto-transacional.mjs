import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const stable=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export const sha=value=>createHash('sha256').update(stable(value)).digest('hex');
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const omit=(row,keys)=>Object.fromEntries(Object.entries(row).filter(([key])=>!keys.includes(key)));

/** Recebe uma conexão administrativa já autenticada. Não acessa credenciais ou redes de mensageria. */
export async function operarPiloto(db,manifest,{hash,modo='simular',schema='public',falharAposPrimeiro=false}={}){
 assert.equal(hash,sha(manifest),'Hash do manifesto diverge');
 assert.ok(['simular','aplicar','reverter'].includes(modo));
 assert.ok(schema==='public'||/^ensaio_piloto_[a-f0-9]{32}$/.test(schema));
 assert.ok(!falharAposPrimeiro||schema!=='public','Falha injetada só é permitida no ensaio');
 assert.equal(manifest.groups.length,5);assert.equal(manifest.impacto_centavos,479375);
 const prefix=quote(schema)+'.',tables=Object.keys(manifest.byTable).sort();
 const ids=manifest.groups.flatMap(g=>[g.preservar_id,g.arquivar_id]);assert.equal(new Set(ids).size,10);
 const snapshot=async()=>{
   // O inventário varre também JSONs de origem volumosos. Orçamento maior só
   // para esta leitura; locks e mutações mantêm seus limites menores.
   await db.query("set local statement_timeout='60s'");
   const selects=tables.map(table=>`select '${table}' tabela,coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) dados from ${prefix}${quote(table)} t where ${manifest.byTable[table].map(c=>c.data_type==='uuid'?`${quote(c.column_name)}=any($1::uuid[])`:`${quote(c.column_name)}::text like any($2::text[])`).join(' or ')}`);
   const result=Object.fromEntries((await db.query(selects.join(' union all '),[manifest.refIds,manifest.refIds.map(id=>'%'+id+'%')])).rows.filter(r=>r.dados.length).map(r=>[r.tabela,r.dados]));
   await db.query("set local statement_timeout='30s'");return result;
 };
 const compareUnchanged=(before,after,reverse=false)=>{
   assert.deepEqual(Object.keys(after).sort(),Object.keys(before).sort());
   for(const table of Object.keys(before)){
     assert.equal(after[table].length,before[table].length,table+' mudou quantidade');
     for(const old of before[table]){
       const row=after[table].find(r=>r.id===old.id);assert.ok(row,table+' perdeu registro');
       const group=manifest.groups.find(g=>[g.preservar_id,g.arquivar_id,g.pendencia.pendencia_id].includes(old.id));
       const fields=table==='cobrancas'&&group?(old.id===group.preservar_id?['competencia','updated_at']:['duplicada_de_id','duplicidade_lote_id','duplicidade_arquivada_em','updated_at']):table==='central_pendencias'&&group?['status','resolvido_em','updated_at','payload']:[];
       assert.equal(sha(omit(row,fields)),sha(omit(old,fields)),table+' alterou campos não autorizados');
       if(reverse)assert.equal(sha(omit(row,['updated_at'])),sha(omit(manifest.matches[table].find(r=>r.id===row.id),['updated_at'])),table+' não restaurou os dados anteriores');
     }
   }
 };
 await db.query('begin');
 try{
   await db.query("set local lock_timeout='4s'; set local statement_timeout='30s'");
   const columns=(await db.query("select c.table_name,c.column_name,c.data_type from information_schema.columns c join information_schema.tables t using(table_schema,table_name) where c.table_schema=$1 and t.table_type='BASE TABLE' and c.table_name<>'cobrancas_duplicidade_execucoes' and c.data_type in ('uuid','jsonb','json','ARRAY') order by 1,2",[schema])).rows;
   const currentTables={};for(const c of columns)(currentTables[c.table_name]??=[]).push(c);
   assert.equal(sha(currentTables),sha(manifest.byTable),'Catálogo mudou; refazer inventário');
   // Serializa reservas já existentes e estabelece uma janela transacional curta.
   // Leituras continuam disponíveis; produtores aguardam ou a operação inteira é abortada.
   if(modo!=='simular'){
     await db.query('select pg_advisory_xact_lock(9162026,50)');
     await db.query(`lock table ${tables.map(t=>prefix+quote(t)).join(',')} in share row exclusive mode`);
     await db.query(`select id from ${prefix}cobrancas where id=any($1::uuid[]) order by id for update`,[ids]);
   }
   const execution=(await db.query(`select * from ${prefix}cobrancas_duplicidade_execucoes where lote_id=$1`,[manifest.lote_id])).rows[0];
   const before=await snapshot();
   if(execution){
     assert.equal(execution.manifesto_sha256,hash);
     if(modo==='aplicar'&&execution.estado==='aplicado'){assert.equal(sha(before),execution.depois.snapshot_sha256);await db.query('rollback');return {estado:'ja_aplicado',lote_id:manifest.lote_id};}
     if(modo==='reverter'&&execution.estado==='revertido'){await db.query('rollback');return {estado:'ja_revertido',lote_id:manifest.lote_id};}
   }
   if(modo!=='reverter'){
     assert.equal(execution,undefined,'Lote já existe em estado incompatível');
     assert.ok(Date.now()<Date.parse(manifest.expira_em),'Manifesto expirou');
     assert.equal(sha(before),manifest.snapshot_sha256,'Base ou dependências mudaram');
     for(const [table,rows]of Object.entries(manifest.extras)){
       const actual=(await db.query(`select id,md5(to_jsonb(t)::text) hash from ${prefix}${quote(table)} t where id=any($1::uuid[]) order by id`,[rows.map(r=>r.id)])).rows;assert.equal(sha(actual),sha(manifest.extrasHashes[table]),'Fonte/dimensão alterada: '+table);
     }
     assert.ok(before.mensagens.every(m=>['enviada','cancelada'].includes(m.status)));
     assert.ok((before.lote_itens??[]).every(i=>['enviado','cancelado'].includes(i.status)));
     assert.equal((before.email_agenda??[]).length,0);assert.equal((before.thunderbird_envios??[]).length,0);
     assert.ok((before.email_tentativas??[]).every(t=>t.estado==='enviado'));
     assert.ok(manifest.extras.unidades.every(u=>!u.acao_judicial));
     if(modo==='simular'){await db.query('rollback');return {estado:'validado_sem_escrita',lote_id:manifest.lote_id,impacto_centavos:manifest.impacto_centavos};}
     const auditBefore={lote_id:manifest.lote_id,manifesto_sha256:hash,groups:manifest.groups,snapshot:{cobrancas:before.cobrancas,central_pendencias:before.central_pendencias},snapshot_sha256:sha(before),dependencias_sha256:Object.fromEntries(Object.entries(before).map(([table,rows])=>[table,sha(rows)])),fontes:manifest.extrasHashes};
     await db.query(`insert into ${prefix}cobrancas_duplicidade_execucoes(lote_id,manifesto_sha256,estado,preservar_ids,arquivar_ids,antes) values($1,$2,'aplicando',$3,$4,$5)`,[manifest.lote_id,hash,manifest.groups.map(g=>g.preservar_id),manifest.groups.map(g=>g.arquivar_id),JSON.stringify(auditBefore)]);
   }else{
     assert.equal(execution?.estado,'aplicado');assert.equal(sha(before),execution.depois.snapshot_sha256,'Mudanças posteriores impedem reversão automática');
     await db.query(`update ${prefix}cobrancas_duplicidade_execucoes set estado='revertendo' where lote_id=$1`,[manifest.lote_id]);
   }
   await db.query("select set_config('gkli.duplicidade_lote',$1,true)",[manifest.lote_id]);
   for(const [index,g]of manifest.groups.entries()){
     if(modo==='aplicar'){
       await db.query(`update ${prefix}cobrancas set competencia=$1 where id=$2`,[g.competencia_para,g.preservar_id]);
       await db.query(`update ${prefix}cobrancas set duplicada_de_id=$1,duplicidade_lote_id=$2,duplicidade_arquivada_em=now() where id=$3`,[g.preservar_id,manifest.lote_id,g.arquivar_id]);
       await db.query(`update ${prefix}central_pendencias set status='resolvida',resolvido_em=now(),updated_at=now(),payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object('conciliacao_duplicidade',$1::jsonb) where id=$2`,[JSON.stringify({lote_id:manifest.lote_id,motivo:g.pendencia.motivo,evidencia:g.pendencia.evidencia}),g.pendencia.pendencia_id]);
     }else{
       await db.query(`update ${prefix}cobrancas set duplicada_de_id=null,duplicidade_lote_id=null,duplicidade_arquivada_em=null where id=$1`,[g.arquivar_id]);
       await db.query(`update ${prefix}cobrancas set competencia=$1 where id=$2`,[g.competencia_de,g.preservar_id]);
       const prior=manifest.matches.central_pendencias.find(p=>p.id===g.pendencia.pendencia_id);
       await db.query(`update ${prefix}central_pendencias set status=$1,resolvido_em=$2,updated_at=now(),payload=$3 where id=$4`,[prior.status,prior.resolvido_em,JSON.stringify(prior.payload),prior.id]);
     }
     if(falharAposPrimeiro&&index===0)throw Error('Falha injetada após primeiro grupo');
   }
   const after=await snapshot();compareUnchanged(before,after,modo==='reverter');
   const canonical=after.cobrancas.filter(c=>!c.duplicada_de_id);assert.equal(canonical.length,modo==='aplicar'?5:10);
   assert.equal(canonical.reduce((n,c)=>n+Math.round(Number(c.valor_atualizado)*100),0),modo==='aplicar'?479375:958750);
   if(modo==='aplicar')await db.query(`update ${prefix}cobrancas_duplicidade_execucoes set estado='aplicado',depois=$1 where lote_id=$2`,[JSON.stringify({snapshot:{cobrancas:after.cobrancas,central_pendencias:after.central_pendencias},snapshot_sha256:sha(after),dependencias_sha256:Object.fromEntries(Object.entries(after).map(([table,rows])=>[table,sha(rows)]))}),manifest.lote_id]);
   else await db.query(`update ${prefix}cobrancas_duplicidade_execucoes set estado='revertido',revertido_em=now() where lote_id=$1`,[manifest.lote_id]);
   await db.query('commit');return {estado:modo==='aplicar'?'aplicado':'revertido',lote_id:manifest.lote_id,manifesto_sha256:hash,canonicas:canonical.length,valor_centavos:canonical.reduce((n,c)=>n+Math.round(Number(c.valor_atualizado)*100),0),mensagens_preservadas:after.mensagens.length,parcelas_preservadas:after.cobranca_parcelas.length};
 }catch(error){await db.query('rollback');throw error;}
}

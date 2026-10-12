import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
await db.exec(`
create role anon; create role authenticated;
create table condominios(id uuid primary key, carteira_id uuid, nome text, operacao_virtual_habilitada boolean);
create table cobranca_flows(id uuid primary key, carteira_id uuid, lote_id uuid, iniciado_em timestamptz, status text);
create table lote_itens(id uuid primary key, lote_id uuid, condominio_id uuid, unidade_id uuid);
create table mensagens(id uuid primary key, carteira_id uuid, cobranca_flow_id uuid, lote_item_id uuid,
 canal text, destinatario text, retorno_registrado_em timestamptz, retorno_observacao text, retorno_tipo text, retorno_origem text);
create table central_pendencias(id uuid primary key, carteira_id uuid, condominio_id uuid, unidade_id uuid,
 origem text, tipo text, status text, prioridade text, titulo text, descricao text, entidade_tipo text, entidade_id uuid,
 payload jsonb, updated_at timestamptz default now());
`)
await db.exec(await readFile(new URL('../supabase/migrations/20261011235845_keila_flow_retornos.sql', import.meta.url), 'utf8'))
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
await db.query(`insert into condominios values ($1,$2,'Safira',true,'2026-10-11'),($3,$2,'Outro',true,null)`, [id(1),id(2),id(3)])
await db.query(`insert into cobranca_flows values ($1,$2,$3,'2026-10-11','em_execucao'),($4,$2,$5,null,'pronto')`, [id(4),id(2),id(5),id(6),id(7)])
await db.query(`insert into lote_itens values ($1,$2,$3,$4),($5,$2,$6,$7),($8,$9,$3,$4)`, [id(8),id(5),id(1),id(9),id(10),id(3),id(11),id(12),id(7)])
for (const [n, canal, flow, item, at] of [[20,'whatsapp',4,8,'2026-10-11T15:00Z'],[21,'email',4,8,'2026-10-11T15:00Z'],[22,'email',4,10,'2026-10-11T15:00Z'],[23,'email',6,12,'2026-10-11T15:00Z'],[24,'email',4,8,'2026-10-10T15:00Z']]) {
  await db.query(`insert into mensagens values ($1,$2,$3,$4,$5,'contato@example.com',$6,'Quero negociar','resposta','teste')`, [id(n),id(2),id(flow),id(item),canal,at])
}
let rows = (await db.query('select * from central_pendencias order by titulo')).rows
assert.equal(rows.length,2,'Only enabled condominium, activated flow and new returns')
assert.equal(rows.find(r=>r.titulo.includes('whatsapp')).payload.emails.length,0)
assert.equal(rows.find(r=>r.titulo.includes('email')).payload.emails.length,1)
await db.query(`update mensagens set retorno_observacao=retorno_observacao where id=$1`,[id(20)])
assert.equal((await db.query('select * from central_pendencias')).rows.length,2)
await db.query(`update central_pendencias set payload=jsonb_set(payload,'{estado}','"atendimento_humano"') where id=md5('keila:flow-retorno:' || $1)::uuid`,[id(20)])
await db.query(`update mensagens set retorno_registrado_em='2026-10-11T16:00Z',retorno_observacao='Outra resposta' where id=$1`,[id(20)])
rows=(await db.query(`select payload from central_pendencias where id=md5('keila:flow-retorno:' || $1)::uuid`,[id(20)])).rows
assert.equal(rows[0].payload.estado,'atendimento_humano')
assert.equal(rows[0].payload.retornos.length,2)
console.log('OK: email/WhatsApp, scope, cutoff, inactive flow, deduplication, human priority')
await db.close()

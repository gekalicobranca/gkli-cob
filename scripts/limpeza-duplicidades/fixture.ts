import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

export const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
export async function fixture(snapshot?: Record<string, any[]>) {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table cobrancas(id uuid primary key,carteira_id uuid,condominio_id uuid,unidade_id uuid,
      competencia text,vencimento text,valor_original numeric,valor_atualizado numeric,
      observacoes text,status text,status_operacional text,status_financeiro text,evidencia jsonb);
    create table mensagens(id uuid primary key,cobranca_id uuid references cobrancas(id),status text,payload jsonb,evidencia jsonb);
    create table lote_itens(id uuid primary key,cobranca_id uuid references cobrancas(id),mensagem_id uuid references mensagens(id),status text,evidencia jsonb);
    create table acordos(id uuid primary key,cobranca_id uuid references cobrancas(id),evidencia jsonb);
    create table acordo_cobrancas(id uuid primary key,cobranca_id uuid references cobrancas(id),evidencia jsonb);
    create table fechamento_pagamentos(id uuid primary key,cobranca_id uuid references cobrancas(id),evidencia jsonb);
    create table email_agenda(mensagem_id uuid primary key references mensagens(id),evidencia jsonb);
    create table email_tentativas(id uuid primary key,mensagem_id uuid references mensagens(id),estado text,evidencia jsonb);
    create table thunderbird_envios(id uuid primary key,mensagem_id uuid references mensagens(id),estado text,evidencia jsonb);
    create table central_pendencias(id uuid primary key,cobranca_id uuid references cobrancas(id),entidade_id uuid,status text,evidencia jsonb);
  `)
  if (snapshot) {
    const columns: Record<string, string[]> = {
      cobrancas: ['id','carteira_id','condominio_id','unidade_id','competencia','vencimento','valor_original','valor_atualizado','observacoes','status','status_operacional','status_financeiro'],
      mensagens: ['id','cobranca_id','status','payload'], lote_itens: ['id','cobranca_id','mensagem_id','status'],
      acordos: ['id','cobranca_id'], acordo_cobrancas: ['id','cobranca_id'], fechamento_pagamentos: ['id','cobranca_id'],
      email_agenda: ['mensagem_id'], email_tentativas: ['id','mensagem_id','estado'], thunderbird_envios: ['id','mensagem_id','estado'],
      central_pendencias: ['id','cobranca_id','entidade_id','status'],
    }
    for (const [table, fields] of Object.entries(columns)) for (const row of snapshot[table] ?? []) {
      await db.query(`insert into ${table}(${fields.join(',')},evidencia) values(${fields.map((_,i)=>`$${i+1}`).join(',')},$${fields.length+1})`,
        [...fields.map(field => field === 'payload' ? JSON.stringify(row[field] ?? {}) : row[field] ?? null), JSON.stringify(row)])
    }
  } else {
    await db.query(`insert into cobrancas(id,carteira_id,condominio_id,unidade_id,competencia,vencimento,valor_original,valor_atualizado,observacoes,status,status_operacional,status_financeiro)
      values($1,$3,$4,$5,null,'2026-08-10',100,110,'Recibo 12345','em_cobranca_ativa','em_cobranca_ativa','em_aberto'),
      ($2,$3,$4,$5,'08/2026','2026-08-10',100,110,'Recibo 12345','em_cobranca_ativa','em_cobranca_ativa','em_aberto')`,[id(1),id(2),id(3),id(4),id(5)])
    await db.query(`insert into mensagens values($1,$2,'enviada',$3,null)`,[id(6),id(1),JSON.stringify({cobranca_ids:[id(1),id(2)],contexto:{valor_total:'R$ 220,00'}})])
    await db.query(`insert into mensagens values($1,$2,'cancelada','{}',null)`,[id(7),id(2)])
    await db.query(`insert into lote_itens values($1,$2,$3,'enviado',null)`,[id(8),id(2),id(6)])
  }
  await db.exec(readFileSync('supabase/migrations/20260923010000_cobrancas_recibo_guard.sql','utf8'))
  await db.exec(`set gkli.ambiente_ensaio='isolado'`)
  await db.exec(readFileSync('scripts/limpeza-duplicidades/ensaio-arquivamento.sql','utf8'))
  return db
}

export async function snapshotHash(db: PGlite, ids = [id(1),id(2)]) {
  return (await db.query<{ hash: string }>('select ensaio_duplicidades.hash(ensaio_duplicidades.snapshot($1::uuid[])) hash',[ids])).rows[0].hash
}
export async function apply(db: PGlite, hash: string, keep=id(1), archive=id(2), group='grupo-1') {
  return (await db.query<{ resultado: string }>('select ensaio_duplicidades.aplicar($1,$2,$3,$4,$5) resultado',[id(99),group,keep,archive,hash])).rows[0].resultado
}

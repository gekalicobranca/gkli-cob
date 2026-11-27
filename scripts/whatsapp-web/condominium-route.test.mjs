import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('condominium exception is narrow, wallet-bound and does not change message history', async () => {
  const db = new PGlite()
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table carteiras(id uuid primary key,whatsapp_transporte text,whatsapp_web_sessao text,whatsapp_web_numero text);
      create table condominios(id uuid primary key,carteira_id uuid,grupo text);
      create table cobrancas(id uuid primary key,carteira_id uuid,condominio_id uuid);
      create table acordos(id uuid primary key,carteira_id uuid,condominio_id uuid);
      create table mensagens(id uuid primary key,carteira_id uuid,cobranca_id uuid,acordo_id uuid,status text);
      create table whatsapp_web_rotas_grupo(carteira_id uuid,grupo text,sessao text,numero text,ativo boolean);
      insert into carteiras values('${id(1)}','web','padrao','5511999990000'),('${id(2)}','web','outra','5511999990001');
      insert into condominios values('${id(3)}','${id(1)}','RISE UP'),('${id(4)}','${id(1)}','RISE UP');
      insert into cobrancas values('${id(5)}','${id(1)}','${id(3)}'),('${id(6)}','${id(1)}','${id(4)}');
      insert into acordos values('${id(7)}','${id(1)}','${id(4)}');
      insert into mensagens values('${id(8)}','${id(1)}','${id(5)}',null,'agendada'),('${id(9)}','${id(1)}','${id(6)}',null,'enviada');
      insert into whatsapp_web_rotas_grupo values('${id(1)}','RISE UP','riseup','5511999990002',false);`)
    await db.exec(`alter table mensagens add column canal text default 'whatsapp',add column conteudo text,add column conteudo_renderizado text,add column payload jsonb default '{}'`)
    const original = await readFile(new URL('../../supabase/migrations/20261103192159_whatsapp_rotas_grupo_carteira.sql',import.meta.url),'utf8')
    await db.exec(original.match(/create or replace function public.whatsapp_web_assinatura_grupo\(\)[\s\S]*?end \$\$;/)[0])
    await db.exec(await readFile(new URL('../../supabase/migrations/20261127155354_whatsapp_excecao_rota_condominio.sql',import.meta.url),'utf8'))
    const route = async n => (await db.query(`select whatsapp_web_rota_mensagem('${id(n)}') value`)).rows[0].value
    assert.equal(await route(8), null)
    await db.exec(`insert into whatsapp_web_excecoes_grupo(condominio_id) values('${id(3)}')`)
    assert.equal((await route(8)).sessao, 'padrao')
    assert.equal(await route(9), null)
    await db.exec(`update mensagens set carteira_id='${id(2)}' where id='${id(8)}'`)
    assert.equal(await route(8), null)
    await db.exec(`update mensagens set carteira_id='${id(1)}',acordo_id='${id(7)}' where id='${id(8)}'`)
    assert.equal(await route(8), null)
    await db.exec(`update mensagens set acordo_id=null where id='${id(8)}'; update whatsapp_web_excecoes_grupo set ativo=false`)
    assert.equal(await route(8), null)
    await db.exec(`update whatsapp_web_rotas_grupo set ativo=true`)
    assert.equal((await route(8)).sessao, 'riseup')
    assert.equal((await db.query(`select status from mensagens where id='${id(9)}'`)).rows[0].status, 'enviada')
    assert.equal((await db.query(`select has_table_privilege('authenticated','whatsapp_web_excecoes_grupo','select') allowed`)).rows[0].allowed,false)
    assert.equal((await db.query(`select relrowsecurity from pg_class where relname='whatsapp_web_excecoes_grupo'`)).rows[0].relrowsecurity,true)
    await db.exec(`update whatsapp_web_excecoes_grupo set ativo=true;
      create trigger signature before update of conteudo on mensagens for each row execute function whatsapp_web_assinatura_grupo();
      update mensagens set payload='{"whatsapp_assinatura_rota":{"numero":"5511999990002"}}' where id='${id(8)}';
      update mensagens set conteudo='Contato 11 99999-0002' where id='${id(8)}';
      update mensagens set conteudo='Histórico enviado 11 99999-0002' where id='${id(9)}';`)
    assert.equal((await db.query(`select conteudo from mensagens where id='${id(8)}'`)).rows[0].conteudo,'Contato 11 99999-0000')
    assert.equal((await db.query(`select conteudo from mensagens where id='${id(9)}'`)).rows[0].conteudo,'Histórico enviado 11 99999-0002')
  } finally { await db.close() }
})

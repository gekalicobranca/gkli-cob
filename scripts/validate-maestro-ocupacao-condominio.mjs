import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('um condomínio ocupado preserva a seleção dos demais e bloqueia todas as suas próprias receitas', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table automacao_controle(chave text,ativo bool);
      create table receitas(receita_id uuid default gen_random_uuid(),condominio_id uuid,carteira_id uuid default gen_random_uuid(),administradora_id uuid default gen_random_uuid(),liberacao_em date default current_date-1,estado text,montar bool);
      create function easy_maestro_janelas(uuid[],text,date) returns setof receitas language sql as 'select * from public.receitas';
      create function easy_maestro_painel(uuid[],text) returns jsonb language sql as $f$
        select jsonb_build_object('receitas',jsonb_agg(jsonb_build_object('id',receita_id,'condominioId',condominio_id,'estado',estado,'easy',true,'liberada',true,'montarFlow',montar,'montagemStatus','processando'))) from public.receitas
      $f$;
      create table agente_execucoes(id uuid default gen_random_uuid(),receita_id uuid,administradora_id uuid,carteira_id uuid,condominio_id uuid,solicitado_por uuid,status text,tentativas int,origem text,easy_maestro_lote_id uuid,easy_maestro_montar_flow bool,agendado_para timestamptz);
      create table agente_logs(execucao_id uuid,step text,nivel text,mensagem text);
    `)
    const anterior = await readFile('supabase/migrations/20261110151027_easy_maestro_selecao_condominios.sql','utf8')
    await db.exec(anterior.slice(anterior.indexOf('create function'),anterior.indexOf('create or replace function')))
    await db.exec(await readFile('supabase/migrations/20261124003000_maestro_ocupacao_por_condominio.sql','utf8'))
    const ocupado='00000000-0000-4000-8000-000000000001', livre='00000000-0000-4000-8000-000000000002'
    await db.query("insert into receitas(condominio_id,estado,montar) values($1,'importando',false),($1,'disponivel',false),($2,'disponivel',false)",[ocupado,livre])
    const solicitar = id => db.query("select easy_maestro_captar(null,'manager',gen_random_uuid(),gen_random_uuid(),false,array[$1::uuid]) criadas",[id])
    assert.equal((await solicitar(livre)).rows[0].criadas,1)
    await assert.rejects(solicitar(ocupado),{code:'P0M01'})
    await db.query("update receitas set estado='importado',montar=true where estado='importando'")
    await assert.rejects(solicitar(ocupado),{code:'P0M01'})
    assert.equal((await db.query('select count(*)::int n from agente_execucoes')).rows[0].n,1)
  } finally { await db.close() }
})

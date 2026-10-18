import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const carteira = '06827218-e2b1-4267-ad8f-81a0ab222cad'
const oasis = '2fef8e0b-664e-4aad-b7af-1d702c586065'
const cadiz = '47926d7c-030b-4469-8713-b23eda558a56'
test('migração mantém carteira, Oasis e rejeição de NULL ao incluir somente Cádiz', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create table public.condominios(id uuid primary key,carteira_id uuid);
      insert into public.condominios values('${cadiz}','${carteira}');`)
    for (const [nome, alias] of [['agente_virtual_negociar_acordo', 'caso'], ['agente_virtual_efetivar_acordo', 'c']]) {
      await db.exec(`create function public.${nome}(p_condominio uuid,p_carteira uuid) returns boolean language plpgsql as $$
        declare ${alias} record;
        begin select p_condominio as condominio_id,p_carteira as carteira_id into ${alias};
        if ${alias}.carteira_id is distinct from '${carteira}'::uuid or ${alias}.condominio_id is distinct from '${oasis}'::uuid then return false; end if;
        return true; end $$;`)
    }
    const sql = await readFile(new URL('../supabase/migrations/20261018033303_lidia_incluir_cadiz_conferencia.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    for (const nome of ['agente_virtual_negociar_acordo', 'agente_virtual_efetivar_acordo']) {
      for (const [condominio, c, permitido] of [[oasis, carteira, true], [cadiz, carteira, true], [null, carteira, false], [cadiz, null, false], [cadiz, oasis, false], [carteira, carteira, false]]) {
        const r = await db.query<{ permitido: boolean }>(`select public.${nome}($1::uuid,$2::uuid) as permitido`, [condominio, c])
        assert.equal(r.rows[0].permitido, permitido)
      }
    }
    assert.ok(!/update\s+public\.condominios/i.test(sql))
  } finally { await db.close() }
})


import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { origemTemCessaoEspaco, excluirCessaoEspacoDaPrevia, naturezaDaLinhaPlanilha } from '../features/importacoes/exclusao-cessao-espaco';
import {parseXlsx} from '../features/importacoes/engine/xlsx-parser';
import {marcarCessaoDeOrigemConhecida} from '../features/importacoes/exclusao-cessao-conhecida';
import * as XLSX from 'xlsx';
import { fixtureCap, prepararConversao, previewCap, inserirCobranca } from './easy-cap-transaction-fixture';
import { fixtureId as id } from './easy-p0-fixture';
const migration = readFile('supabase/migrations/20261126023534_excluir_cessao_espaco_captacao_global.sql','utf8');
const conhecida = readFile('supabase/migrations/20261126024203_excluir_recibos_cessao_origem_conhecida.sql','utf8');
const positivos = [
  { detalhesOrigem: '8956 CESSÃO DE ESPAÇO: R$ 834,42' },
  { historico: '39 LOCAÇÃO DE ESPAÇO 25/09/2026' },
  { natureza: 'Locação de salão' }, { tipo_de_cobranca: 'cessao_espaco' },
  { observacoes: 'Origem: relatório | LOCAÇÃO\nDE ÁREA COMUM' },
  { tiposCobranca: ['cota_condominial','cessao_espaco'] },
  { composicaoOrigem: [{historico: 'CONDOMINIO',tipo: 'cota_condominial'}, {tipo: 'cessao_espaco'}] },
  { parcelas: [{ referencia: 'recibo', descricao: 'ALUGUEL DE ESPAÇO' }] },
];
const negativos = [{ historico: 'TX CONDOMÍNIO + FUNDO RESERVA' }, { observacoes: 'Cessão de crédito' },
  { descricao: 'Locação de apartamento' }, { responsavel: 'CESSÃO DE ESPAÇO LTDA', unidade:'SALÃO' },
  { tiposCobranca:['custos_protesto','consumo'] }, {}, { composicaoOrigem: null }];

test('natureza estruturada e textos acentuados identificam exclusão; cadastro e outras rubricas não',()=>{
  positivos.forEach(x=>assert.equal(origemTemCessaoEspaco(x),true,JSON.stringify(x)));
  negativos.forEach(x=>assert.equal(origemTemCessaoEspaco(x),false,JSON.stringify(x)));
});

test('recibo misto fica inteiro fora; total elegível, origem e replay são consistentes',()=>{
  const normal={unidade:'101',valorTotal:110.11,parcelas:[{valor:110.11}],tiposCobranca:['cota_condominial']};
  const misto={unidade:'102',valorTotal:200,parcelas:[{valor:200}],...positivos[6]};
  const original={cobrancas:[normal,misto],valorTotal:310.11,totalParcelas:2,inconsistencias:[]};
  const filtrada=excluirCessaoEspacoDaPrevia(original);
  assert.deepEqual(filtrada.cobrancas,[normal]);assert.equal(filtrada.valorTotal,110.11);assert.equal(filtrada.totalParcelas,1);
  assert.deepEqual(original.cobrancas,[normal,misto]);
  assert.deepEqual(excluirCessaoEspacoDaPrevia(filtrada),filtrada);
  const soExclusoes=excluirCessaoEspacoDaPrevia({...original,cobrancas:[misto],valorTotal:200});
  assert.equal(soExclusoes.cobrancas.length,0);assert.equal(soExclusoes.valorTotal,0);
  assert.equal('semPendencias' in soExclusoes,false);
});

test('planilha oficial preserva histórico/natureza após normalizar cabeçalhos para a exclusão',()=>{
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([
    {Unidade:'BOX001','Histórico':'8956 CESSÃO DE ESPAÇO',Natureza:'Outros'},
    {Unidade:'101','Histórico':'TX CONDOMÍNIO',Natureza:'Cota condominial'},
  ]),'dados');
  const bytes=XLSX.write(wb,{type:'buffer',bookType:'xlsx'}) as Buffer;
  const rows=parseXlsx('cotas.xlsx',Uint8Array.from(bytes).buffer);
  assert.deepEqual(rows.rows.map(r=>origemTemCessaoEspaco(naturezaDaLinhaPlanilha(r.payload))),[true,false]);
});

test('classificadores JS/SQL concordam e a barreira de inserção vale em qualquer condomínio',async()=>{
  const db=new PGlite();try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create table conversoes_relatorio(id uuid,carteira_id uuid,condominio_id uuid,preview_json jsonb,status text);
      create table unidades(id uuid,carteira_id uuid,condominio_id uuid,identificacao text,bloco text);
      create table cobrancas(id uuid default gen_random_uuid(),carteira_id uuid,condominio_id uuid,unidade_id uuid,
        observacoes text,excluida_por_cessao_espaco bool default false,conversao_relatorio_id uuid);`);
    await db.exec(await migration);
    await db.exec(await conhecida);
    for(const x of [...positivos,...negativos]) {
      const result=await db.query<{excluir:boolean}>('select public.origem_tem_cessao_espaco($1::jsonb) excluir',[JSON.stringify(x)]);
      assert.equal(result.rows[0].excluir,origemTemCessaoEspaco(x));
    }
    // Sem depender de nome, acento, administradora ou carteira específica.
    for(const condominio of [id(100),id(200)]) {
      await assert.rejects(db.query('insert into cobrancas(condominio_id,observacoes) values($1,$2)',[condominio,'CESSÃO DE ESPAÇO']),/excluída da captação/);
      await db.query('insert into cobrancas(condominio_id,observacoes) values($1,$2)',[condominio,'TX CONDOMÍNIO']);
    }
    // Caller legado que omite a rubrica nas observações: recuperar composição por recibo e unidade.
    await db.query('insert into unidades values($1,$2,$3,$4,$5)',[id(1),id(2),id(100),'BOX001','0']);
    await db.query('insert into conversoes_relatorio(id,carteira_id,condominio_id,preview_json) values($1,$2,$3,$4::jsonb)',[id(3),id(2),id(100),JSON.stringify({cobrancas:[{recibo:'J 15418010',bloco:'0',unidade:'BOX001',...positivos[0]}]})]);
    await assert.rejects(db.query('insert into cobrancas(carteira_id,condominio_id,unidade_id,observacoes,conversao_relatorio_id) values($1,$2,$3,$4,$5)',[id(2),id(100),id(1),'Recibo J 15418010',id(3)]),/composição original/);
    // Sem conversão nem natureza na planilha: a origem anterior continua impedindo nova inserção.
    await assert.rejects(db.query('insert into cobrancas(carteira_id,condominio_id,unidade_id,observacoes) values($1,$2,$3,$4)',[id(2),id(100),id(1),'Recibo J 15418010']),/Reimportação proibida/);
    assert.equal((await db.query<{n:number}>('select count(*)::int n from cobrancas')).rows[0].n,2);
  }finally {await db.close();}
});

test('Easy: tentativa antiga proibida aborta substituição inteira, preservando a base',async()=>{
  const db=await fixtureCap();try {
    await db.exec('alter table cobrancas add column excluida_por_cessao_espaco boolean default false;');
    await db.exec(await migration);
    await db.exec(await conhecida);
    await inserirCobranca(db,30);
    const ano=(await db.query<{ano:number}>("select extract(year from now())::int ano")).rows[0].ano;
    const preview=previewCap(ano);preview.cobrancas[0].detalhesOrigem='8956 CESSÃO DE ESPAÇO';
    const operacao=await prepararConversao(db,20,preview);
    await assert.rejects(operacao.confirmar(),/cessão\/locação|composição original/i);
    const rows=(await db.query<{id:string}>('select id from cobrancas')).rows;
    assert.deepEqual(rows,[{id:id(30)}]);
  }finally {await db.close();}
});

test('planilha sem rubrica recupera exclusão só na mesma identidade; falha de consulta impede prosseguir',async()=>{
  const linhas=[{condominio_id:id(100),unidade:'BOX001',bloco:'0',observacoes:'Recibo J 15418010',valorTotal:100},
    {condominio_id:id(200),unidade:'BOX001',bloco:'0',observacoes:'Recibo J 15418010',valorTotal:200},
    {condominio_id:id(100),unidade:'BOX002',bloco:'0',observacoes:'Recibo J 15418010',valorTotal:300}];
  const db={rpc:()=>({range:async()=>({data:[{condominio_id:id(100),unidade:'BOX001',bloco:'0',recibo:'15418010'}],error:null})})};
  const resultado=await marcarCessaoDeOrigemConhecida(db,linhas);
  assert.deepEqual(resultado.map(origemTemCessaoEspaco),[true,false,false]);
  assert.deepEqual(resultado.map(l=>l.valorTotal),[100,200,300]);assert.equal(origemTemCessaoEspaco(linhas[0]),false);
  await assert.rejects(marcarCessaoDeOrigemConhecida({rpc:()=>({range:async()=>({error:{message:'falha'}})})},linhas),/Nenhuma importação deve prosseguir/);
});

test('Easy recusa reaproveitar cota quando a prévia omite rubrica já comprovada em outra origem',async()=>{
  const db=await fixtureCap();try {
    await db.exec('alter table cobrancas add column excluida_por_cessao_espaco boolean default false;');
    await db.exec(await migration);await db.exec(await conhecida);
    await inserirCobranca(db,30);
    const ano=(await db.query<{ano:number}>('select extract(year from now())::int ano')).rows[0].ano;
    const operacao=await prepararConversao(db,20,previewCap(ano));
    await db.query('insert into conversoes_relatorio(id,carteira_id,condominio_id,status,preview_json) values($1,$2,$3,$4,$5)',
      [id(21),id(1),id(2),'preview',{cobrancas:[{unidade:'101',bloco:'0',recibo:'J 123',detalhesOrigem:'CESSÃO DE ESPAÇO'}]}]);
    await assert.rejects(operacao.confirmar(),/cessão\/locação/i);
    assert.deepEqual((await db.query('select id,valor_atualizado from cobrancas')).rows,[{id:id(30),valor_atualizado:'100'}]);
  }finally {await db.close();}
});

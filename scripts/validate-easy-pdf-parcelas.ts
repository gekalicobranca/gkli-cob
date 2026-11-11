import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extrairPlanoDocumento } from "../features/acordos/pdf-parcelas";
import { extractPdfVisualText } from "../features/conversao-relatorio/server/pdf-visual-text";

const contexto = { unidade: "101", bloco: "A", condominio: "Alameda", cnpj: "12345678000190" };
const cabecalho = "Condomínio: Alameda\nCNPJ: 12.345.678/0001-90\nBloco: A • Unidade: 000101\nAcordo: 12345\n";
const simples = cabecalho + "Parcela Vencimento Valor\n1/3 31/01/2027 R$ 100,01\n2/3 17/02/2027 R$ 200,02\n3/3 29/03/2027 R$ 300,03\nTotal: 600,06";

test("lê centavos e datas exatos, sem regenerar mensalidades", () => {
  const plano = extrairPlanoDocumento(simples, contexto);
  assert.deepEqual(plano.parcelas.map(p => [p.numero, p.vencimento, p.centavos]), [
    [1, "2027-01-31", 10001], [2, "2027-02-17", 20002], [3, "2027-03-29", 30003],
  ]);
  assert.equal(plano.totalCentavos, 60006);
  assert.equal(plano.referencia, "12345");
});
test("distingue dívida original, entrada e tabela de parcelas", () => {
  const plano = extrairPlanoDocumento(cabecalho + "Boleto Histórico Vencimento Valor\n900 Cota 01/10/2026 900,00\n" +
    "Entrada 15/01/2027 R$ 50,00\nParcela Vencimento Valor\n1 31/01/2027 1.234,56\nTotal do acordo: 1.284,56", contexto);
  assert.deepEqual(plano.parcelas.map(p => p.centavos), [5000, 123456]);
});
test("seleciona unidade/bloco e exige referência quando há dois acordos", () => {
  const outro = simples.replace("000101", "000102").replace("12345", "99999");
  assert.equal(extrairPlanoDocumento(outro + "\n" + simples, contexto).referencia, "12345");
  assert.throws(() => extrairPlanoDocumento(outro, contexto), /não corresponde/);
  const dois = simples + "\n" + simples.replace("12345", "67890");
  assert.throws(() => extrairPlanoDocumento(dois, contexto), /mais de um acordo/);
  assert.equal(extrairPlanoDocumento(dois, { ...contexto, referencia: "67890" }).referencia, "67890");
  assert.throws(() => extrairPlanoDocumento(simples.replace("Condomínio: Alameda", "Condomínio: Outro"), contexto), /condomínio/);
  assert.throws(() => extrairPlanoDocumento(simples.replace("Bloco: A", "Bloco: B"), contexto), /não corresponde/);
  assert.equal(extrairPlanoDocumento(simples.replace("Bloco: A •", "Bloco: TESTE KEILA |"), { ...contexto, bloco: "TESTE KEILA" }).totalCentavos, 60006);
});
test("lê o total da parcela Lello sem confundir principal, juros e pago", () => {
  const texto = cabecalho + "Parcelamento\nAtualização Data Valor\nNúmero Parcela Vencimento Limite Valor Juros Total Pago\n" +
    "Monetária Pagamento Administrativo\n90001 1/2 31/01/27 31/01/27 100,00 1,00 2,00 103,00 103,00 30/01/27 9,00\n" +
    "90002 2/2 17/02/27 17/02/27 200,00 0,00 1,00 201,00 0,00 0,00\nTotal parcelamento: 304,00 0,00 3,00";
  const plano = extrairPlanoDocumento(texto, contexto);
  assert.deepEqual(plano.parcelas.map(p => p.centavos), [10300, 20100]);
  assert.equal(plano.parcelas[0].pagoCentavos, 10300);
  assert.equal(plano.parcelas[1].vencimento, "2027-02-17");
});
test("recusa parcelas duplicadas, lacunas, total divergente, datas e colunas ambíguas", () => {
  for (const documento of [
    simples.replace("2/3", "1/3"), simples.replace("2/3 17/02/2027 R$ 200,02\n", ""),
    simples.replace("600,06", "600,07"), simples.replace("17/02/2027", "30/02/2027"),
    simples.replace("R$ 200,02", "R$ 200,02 10,00"), simples.replace("R$ 200,02", "R$ -200,02"),
  ]) assert.throws(() => extrairPlanoDocumento(documento, contexto));
  assert.throws(() => extrairPlanoDocumento("", contexto), /texto legível/);
});
test("extrai texto do PDF real em memória respeitando a ordem visual", async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  simples.split("\n").forEach((line, i) => page.drawText(line, { x: 40, y: 790 - i * 20, size: 10, font }));
  const text = await extractPdfVisualText(Buffer.from(await pdf.save()));
  assert.equal(extrairPlanoDocumento(text, contexto).totalCentavos, 60006);
  const bytes = Buffer.from(await pdf.save());
  await assert.rejects(() => extractPdfVisualText(bytes, 1, 0), /limite/);
});

test("transação real de PostgreSQL preserva IDs, pagamentos, versão e histórico", async () => {
  const db = new PGlite();
  const user = randomUUID(), wallet = randomUUID(), condo = randomUUID(), unit = randomUUID();
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function public.current_user_can_access_carteira(id uuid) returns boolean language sql as $$
      select id = nullif(current_setting('test.wallet',true),'')::uuid $$;
    create table profiles(id uuid primary key,role text,nome text);
    create table condominios(id uuid primary key,parcelas_acordo_sem_aprovacao_sindico integer);
    create table acordos(id uuid primary key,carteira_id uuid,condominio_id uuid,unidade_id uuid,cobranca_id uuid,
      data_acordo date,valor_acordado numeric(14,2),entrada numeric(14,2),quantidade_parcelas integer,
      tipo text default 'extrajudicial',status text default 'ativo',status_financeiro text default 'em_aberto',
      exige_aprovacao_sindico boolean default false,sindico_aprovado_em timestamptz,updated_at timestamptz);
    create table acordo_cobrancas(acordo_id uuid,cobranca_id uuid);
    create table parcelas_acordo(id uuid primary key default gen_random_uuid(),acordo_id uuid references acordos,
      numero integer,valor numeric(14,2),vencimento date,tipo_parcela text default 'parcela',status text default 'aberta',
      data_pagamento date,valor_repasse_informado numeric(14,2),updated_at timestamptz);
    create table acordos_revisoes(parcela_id uuid);
    create table fechamento_pagamentos(parcela_id uuid);
    create table timeline_operacional(carteira_id uuid,entidade_tipo text,entidade_id uuid,evento_tipo text,
      titulo text,descricao text,severidade text,acordo_id uuid,usuario_id uuid,origem text,payload jsonb);
    grant usage on schema auth to authenticated;
    grant all on all tables in schema public to authenticated;
    insert into profiles values('${user}','admin','Teste');
    insert into condominios values('${condo}',0);
    select set_config('test.uid','${user}',false),set_config('test.wallet','${wallet}',false);
  `);
  await db.exec(await readFile("supabase/migrations/20261104124434_acordo_homologacao_administradora.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/20261104143324_acordo_homologacao_independente_dos_boletos.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/20261108022636_easy_acordo_parcelas_pdf.sql", "utf8"));

  async function fixture() {
    const id = randomUUID();
    await db.query("insert into acordos(id,carteira_id,condominio_id,unidade_id,valor_acordado,entrada,quantidade_parcelas) values($1,$2,$3,$4,30,0,2)", [id, wallet, condo, unit]);
    await db.query("insert into parcelas_acordo(acordo_id,numero,valor,vencimento) values($1,1,10,'2027-01-10'),($1,2,20,'2027-02-10')", [id]);
    return id;
  }
  async function revision(id: string) {
    return (await db.query<{ rev: string }>("select public.acordo_revisao_adm(a) rev from acordos a where id=$1", [id])).rows[0].rev;
  }
  async function snapshot(id: string) {
    return JSON.stringify((await db.query("select public.acordo_cadastro_para_homologacao(a) from acordos a where id=$1", [id])).rows);
  }
  const plan = [
    { numero: 1, vencimento: "2027-01-31", centavos: 10001, pago_centavos: 0 },
    { numero: 2, vencimento: "2027-02-17", centavos: 20002, pago_centavos: 0 },
    { numero: 3, vencimento: "2027-03-29", centavos: 30003, pago_centavos: 0 },
  ];
  async function apply(id: string, rev: string, parcelas = plan) {
    return db.query("select public.acordo_aplicar_parcelas_pdf_adm($1,$2,'12345','teste.pdf',$3,$4::jsonb)",
      [id, rev, Buffer.from("%PDF-test-fixture").toString("base64"), JSON.stringify(parcelas)]);
  }
  const id = await fixture(), rev = await revision(id);
  const ids = (await db.query<{ id: string }>("select id from parcelas_acordo where acordo_id=$1 order by numero", [id])).rows;
  await apply(id, rev);
  const updated = (await db.query<{ id: string; valor: string; vencimento: string }>("select id,valor,vencimento::text from parcelas_acordo where acordo_id=$1 order by numero", [id])).rows;
  assert.equal(updated.length, 3);
  assert.equal(updated[0].id, ids[0].id);
  assert.equal(updated[1].id, ids[1].id);
  assert.deepEqual(updated.map(p => Number(p.valor)), [100.01, 200.02, 300.03]);
  assert.equal(updated[1].vencimento, "2027-02-17");
  assert.equal(Number((await db.query<{ valor_acordado: string }>("select valor_acordado from acordos where id=$1", [id])).rows[0].valor_acordado), 600.06);
  await apply(id, rev);
  assert.equal((await db.query("select id from acordo_homologacoes_adm where acordo_id=$1", [id])).rows.length, 1);
  const entry = await fixture();
  await apply(entry, await revision(entry), [{ numero: 0, vencimento: "2027-01-01", centavos: 5000, pago_centavos: 0 }, ...plan]);
  assert.equal(Number((await db.query<{ entrada: string }>("select entrada from acordos where id=$1", [entry])).rows[0].entrada), 50);

  const stale = await fixture(), oldRevision = await revision(stale);
  await db.query("update parcelas_acordo set valor=11 where acordo_id=$1 and numero=1", [stale]);
  const beforeStale = await snapshot(stale);
  await assert.rejects(() => apply(stale, oldRevision), /mudou desde/);
  assert.equal(await snapshot(stale), beforeStale);

  const paid = await fixture();
  await db.query("update parcelas_acordo set status='paga',data_pagamento='2027-01-01' where acordo_id=$1 and numero=1", [paid]);
  const beforePaid = await snapshot(paid);
  await assert.rejects(() => revision(paid).then(r => apply(paid, r)), /pagamento registrado/);
  assert.equal(await snapshot(paid), beforePaid);
  const keepPaid = [{ numero: 1, vencimento: "2027-01-10", centavos: 1000, pago_centavos: 1000 }, plan[1]];
  await apply(paid, await revision(paid), keepPaid);
  assert.equal((await db.query<{ status: string }>("select status from parcelas_acordo where acordo_id=$1 and numero=1", [paid])).rows[0].status, "paga");
  const history = await fixture(), beforeHistory = await snapshot(history);
  await db.query("insert into acordos_revisoes select id from parcelas_acordo where acordo_id=$1 and numero=2", [history]);
  await assert.rejects(() => revision(history).then(r => apply(history, r, [plan[0]])), /histórico financeiro/);
  assert.equal(await snapshot(history), beforeHistory);
  const approval = await fixture(), beforeApproval = await snapshot(approval);
  await db.query("update condominios set parcelas_acordo_sem_aprovacao_sindico=2 where id=$1", [condo]);
  await assert.rejects(() => revision(approval).then(r => apply(approval, r)), /nova aprovação/);
  assert.equal(await snapshot(approval), beforeApproval);
  await db.query("update condominios set parcelas_acordo_sem_aprovacao_sindico=0 where id=$1", [condo]);

  const atomic = await fixture(), beforeAtomic = await snapshot(atomic);
  await db.exec(`create function fail_document() returns trigger language plpgsql as $$ begin
    if current_setting('test.fail_document',true)='yes' then raise exception 'document failed'; end if; return new; end $$;
    create trigger fail_document before insert on acordo_homologacoes_adm for each row execute function fail_document();
    select set_config('test.fail_document','yes',false);`);
  await assert.rejects(() => revision(atomic).then(r => apply(atomic, r)), /document failed/);
  assert.equal(await snapshot(atomic), beforeAtomic);
  await db.exec("select set_config('test.fail_document','no',false)");

  const authenticated = await fixture(), authenticatedRevision = await revision(authenticated);
  await db.exec("set role authenticated");
  await apply(authenticated, authenticatedRevision);
  await apply(authenticated, authenticatedRevision);
  await db.exec("reset role");
  await db.exec(`select set_config('test.wallet','${randomUUID()}',false)`);
  await assert.rejects(() => revision(atomic).then(r => apply(atomic, r)), /Sem permissão/);
  await db.exec(`select set_config('test.wallet','${wallet}',false); set role anon;`);
  await assert.rejects(() => apply(atomic, "unknown"), /permission denied/);
  await db.exec("reset role");
  await db.close();
});

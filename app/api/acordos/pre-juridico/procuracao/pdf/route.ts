import { NextResponse } from "next/server";

import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { requireRole } from "@/utils/auth/require-role";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const LINE_HEIGHT = 14;
const BLUE = "0.02 0.31 0.54";

type SindicoInfo = {
  nome?: string | null;
  email?: string | null;
  documento?: string | null;
  telefone?: string | null;
};

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function firstRelation<T = any>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return (value[0] ?? null) as T | null;
  return (value ?? null) as T | null;
}

function onlyDigits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function fallback(value: unknown, empty = "nao cadastrado no sistema") {
  const stringValue = String(value ?? "").trim();
  return stringValue || empty;
}

function formatDocumento(value: string | null | undefined, empty = "nao cadastrado no sistema") {
  const raw = String(value ?? "").trim();
  const digits = onlyDigits(raw);

  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }

  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }

  return raw || empty;
}

function formatCep(value: string | null | undefined) {
  const digits = onlyDigits(value);
  if (digits.length === 8) return digits.replace(/(\d{5})(\d{3})/, "$1-$2");
  return String(value ?? "").trim();
}

function formatEnderecoCondominio(condominio: any) {
  const logradouro = fallback(condominio?.endereco_logradouro, "");
  if (!logradouro) return "nao cadastrado no sistema";

  const partes = [
    logradouro,
    condominio?.endereco_numero ? `n. ${condominio.endereco_numero}` : null,
    condominio?.endereco_complemento,
    condominio?.endereco_bairro,
    [condominio?.endereco_cidade, condominio?.endereco_uf].filter(Boolean).join(" - "),
    condominio?.endereco_cep ? `CEP: ${formatCep(condominio.endereco_cep)}` : null,
  ];

  return partes.filter(Boolean).join(", ");
}

function text(value: unknown) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}

function escapePdf(value: string) {
  return text(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(value: string, maxChars = 86) {
  const words = text(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function line(content: string, size = 9, bold = false, color = "0 0 0") {
  return { content, size, bold, color };
}

type PdfLine = ReturnType<typeof line>;

function renderTextPage(lines: PdfLine[]) {
  let y = PAGE_HEIGHT - MARGIN;
  const ops: string[] = [
    "q",
    "1 1 1 rg",
    `0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT} re f`,
    "Q",
  ];

  for (const item of lines) {
    if (y < MARGIN + LINE_HEIGHT) break;
    const font = item.bold ? "F2" : "F1";
    ops.push(`${item.color} rg`);
    ops.push(`BT /${font} ${item.size} Tf ${MARGIN} ${y} Td (${escapePdf(item.content)}) Tj ET`);
    y -= Math.max(LINE_HEIGHT, item.size + 4);
  }

  return ops.join("\n");
}

function renderCover(acordo: any) {
  const condominio = acordo.condominios?.nome ?? "Condominio";
  const unidade = `Unidade ${acordo.unidades?.identificacao ?? "-"}`;
  const lines = [
    "q",
    `${BLUE} rg`,
    `0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT} re f`,
    "Q",
    "q",
    "1 1 1 rg",
    `58 480 ${PAGE_WIDTH - 116} 120 re f`,
    "Q",
    `${BLUE} rg`,
    "BT /F2 54 Tf 116 535 Td (GENSKE) Tj ET",
    "BT /F1 18 Tf 175 505 Td (A D V O G A D O S) Tj ET",
    "1 1 1 rg",
    "BT /F2 44 Tf 72 390 Td (Procuracao) Tj ET",
    "BT /F2 44 Tf 72 328 Td (para acao de) Tj ET",
    "BT /F2 44 Tf 72 266 Td (cobranca ou) Tj ET",
    "BT /F2 44 Tf 72 204 Td (execucao) Tj ET",
    "BT /F1 11 Tf 72 118 Td (" + escapePdf(condominio) + ") Tj ET",
    "BT /F1 11 Tf 72 100 Td (" + escapePdf(unidade) + ") Tj ET",
  ];
  return lines.join("\n");
}

function buildPdf(contents: string[]) {
  const objects: Buffer[] = [];
  const addObject = (body: string | Buffer) => {
    const index = objects.length + 1;
    const content = Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1");
    objects.push(Buffer.concat([
      Buffer.from(`${index} 0 obj\n`, "latin1"),
      content,
      Buffer.from("\nendobj\n", "latin1"),
    ]));
    return index;
  };

  const pageRefs: number[] = [];
  const fontRegular = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontBold = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  for (const pageContent of contents) {
    const content = Buffer.from(pageContent, "latin1");
    const contentRef = addObject(Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`, "latin1"),
      content,
      Buffer.from("\nendstream", "latin1"),
    ]));
    const pageRef = addObject(
      `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentRef} 0 R >>`,
    );
    pageRefs.push(pageRef);
  }

  const pagesRef = addObject(`<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`);
  const catalogRef = addObject(`<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);

  for (let index = 0; index < objects.length; index += 1) {
    objects[index] = Buffer.from(
      objects[index].toString("latin1").replace("/Parent 0 0 R", `/Parent ${pagesRef} 0 R`),
      "latin1",
    );
  }

  const header = Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1");
  const offsets: number[] = [0];
  let offset = header.length;
  for (const object of objects) {
    offsets.push(offset);
    offset += object.length;
  }

  const xrefOffset = offset;
  const xref = [
    `xref\n0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((item) => `${String(item).padStart(10, "0")} 00000 n `),
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogRef} 0 R >>`,
    `startxref\n${xrefOffset}`,
    "%%EOF",
  ].join("\n");

  return Buffer.concat([header, ...objects, Buffer.from(xref, "latin1")]);
}

function addWrapped(lines: PdfLine[], value: string, size = 9, bold = false, maxChars = 86) {
  for (const wrapped of wrapLine(value, maxChars)) lines.push(line(wrapped, size, bold));
}

function section(lines: PdfLine[], title: string) {
  lines.push(line("", 5));
  lines.push(line(title.toUpperCase(), 10, true, BLUE));
}

function getCarteira(acordo: any) {
  return firstRelation(acordo.carteiras);
}

function assertCarteirasPreJuridicoHabilitadas(acordos: any[]) {
  const desabilitados = acordos.filter((acordo) => !Boolean(getCarteira(acordo)?.pre_juridico_habilitado));

  if (desabilitados.length > 0) {
    throw new Error("Uma ou mais carteiras nao estao habilitadas para gerar pre-juridico.");
  }
}

async function carregarSindicos(condominioIds: string[]) {
  const result = new Map<string, SindicoInfo>();
  if (!condominioIds.length) return result;

  const supabase = createAdminClient();

  const { data: condominios, error: condominiosError } = await supabase
    .from("condominios")
    .select("id,nome,sindico_email,sindico_celular")
    .in("id", condominioIds);

  if (condominiosError) {
    throw new Error(`Erro ao carregar contatos do cadastro do condomínio: ${condominiosError.message}`);
  }

  for (const row of (condominios ?? []) as any[]) {
    const condominioId = String(row.id ?? "");
    if (!condominioId) continue;
    const email = String(row.sindico_email ?? "").trim() || null;
    const telefone = String(row.sindico_celular ?? "").trim() || null;
    if (!email && !telefone) continue;
    result.set(condominioId, {
      nome: row.nome ? `Síndico - ${row.nome}` : "Síndico",
      email,
      telefone,
    });
  }

  const { data, error } = await supabase
    .from("portal_sindico_condominios")
    .select(`
      condominio_id,
      perfil,
      status,
      portal_sindico_usuarios (
        nome,
        email,
        documento,
        telefone,
        status
      )
    `)
    .in("condominio_id", condominioIds)
    .eq("perfil", "sindico")
    .eq("status", "ativo");

  if (error) {
    throw new Error(`Erro ao carregar sindicos para procuracao: ${error.message}`);
  }

  for (const row of (data ?? []) as any[]) {
    const condominioId = String(row.condominio_id ?? "");
    if (!condominioId) continue;

    const usuario = firstRelation(row.portal_sindico_usuarios);
    if (!usuario || usuario.status === "inativo") continue;

    const cadastro = result.get(condominioId) ?? {};
    result.set(condominioId, {
      nome: usuario.nome ?? cadastro.nome,
      email: cadastro.email ?? usuario.email,
      documento: usuario.documento ?? cadastro.documento,
      telefone: cadastro.telefone ?? usuario.telefone,
    });
  }

  return result;
}

async function carregarAcordos(ids: string[]) {
  const supabase = await createClient();
  const scope = await getPermittedCarteiras();

  let query = supabase
    .from("acordos")
    .select(`
      id,
      carteira_id,
      condominio_id,
      unidade_id,
      status,
      status_financeiro,
      fluxo_status,
      valor_acordado,
      quantidade_parcelas,
      data_acordo,
      created_at,
      carteiras:carteira_id (id,nome,pre_juridico_habilitado),
      condominios:condominio_id (
        id,
        nome,
        cnpj,
        endereco_logradouro,
        endereco_numero,
        endereco_complemento,
        endereco_bairro,
        endereco_cidade,
        endereco_uf,
        endereco_cep,
        administradora_id
      ),
      unidades:unidade_id (
        id,
        identificacao,
        bloco,
        responsavel_nome,
        responsavel_documento,
        email,
        telefone
      )
    `)
    .in("id", ids)
    .order("data_acordo", { ascending: false });

  query = applyCarteiraScope(query, scope.carteiraIds);

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao carregar acordos para procuracao: ${error.message}`);

  const acordos = ((data ?? []) as any[]).map((row) => ({
    ...row,
    carteiras: firstRelation(row.carteiras),
    condominios: firstRelation(row.condominios),
    unidades: firstRelation(row.unidades),
  }));

  assertCarteirasPreJuridicoHabilitadas(acordos);

  const sindicos = await carregarSindicos(unique(acordos.map((acordo) => acordo.condominio_id)));
  return acordos.map((acordo) => ({
    ...acordo,
    sindico: sindicos.get(acordo.condominio_id) ?? null,
  }));
}

async function carregarCobrancas(ids: string[]) {
  const supabase = await createClient();
  const scope = await getPermittedCarteiras();
  let query = supabase.from("cobrancas").select(`
    id, carteira_id, condominio_id, unidade_id, status, status_financeiro,
    status_operacional, valor_original, valor_atualizado, vencimento, created_at,
    carteiras:carteira_id (id,nome,pre_juridico_habilitado),
    condominios:condominio_id (
      id,nome,cnpj,endereco_logradouro,endereco_numero,endereco_complemento,
      endereco_bairro,endereco_cidade,endereco_uf,endereco_cep,administradora_id
    ),
    unidades:unidade_id (id,identificacao,bloco,responsavel_nome,responsavel_documento,email,telefone)
  `).in("id", ids).order("vencimento", { ascending: false });
  query = applyCarteiraScope(query, scope.carteiraIds);
  const { data, error } = await query;
  if (error) throw new Error(`Erro ao carregar cobrancas para procuracao: ${error.message}`);
  const cobrancas = ((data ?? []) as any[]).map((row) => ({
    ...row,
    origem: "cobranca",
    carteiras: firstRelation(row.carteiras),
    condominios: firstRelation(row.condominios),
    unidades: firstRelation(row.unidades),
    valor_acordado: row.valor_atualizado ?? row.valor_original,
    quantidade_parcelas: 1,
    data_acordo: row.vencimento,
    fluxo_status: row.status_operacional,
  }));
  assertCarteirasPreJuridicoHabilitadas(cobrancas);
  const sindicos = await carregarSindicos(unique(cobrancas.map((row) => row.condominio_id)));
  const porUnidade = new Map<string, any[]>();
  for (const row of cobrancas) {
    const key = row.unidade_id || row.id;
    const current = porUnidade.get(key) ?? [];
    current.push(row);
    porUnidade.set(key, current);
  }
  return Array.from(porUnidade.values()).map((rows) => {
    const referencia = rows[0];
    return {
      ...referencia,
      id: referencia.unidade_id || referencia.id,
      origem: "unidade",
      quantidade_cobrancas: rows.length,
      cobranca_ids: rows.map((row) => row.id),
      valor_acordado: rows.reduce((sum, row) => sum + Number(row.valor_atualizado ?? row.valor_original ?? 0), 0),
      sindico: sindicos.get(referencia.condominio_id) ?? null,
    };
  });
}

function montarPartes(acordo: any) {
  const lines: PdfLine[] = [];
  const condominio = acordo.condominios ?? {};
  const unidade = acordo.unidades ?? {};
  const sindico = (acordo.sindico ?? {}) as SindicoInfo;
  const sindicoNome = fallback(sindico.nome, "sindico nao cadastrado no sistema");
  const sindicoDocumento = formatDocumento(sindico.documento);

  lines.push(line("PROCURAÇÃO PARA AÇÃO DE COBRANÇA OU EXECUÇÃO", 13, true, BLUE));
  lines.push(line(`${acordo.origem === "unidade" ? "Unidade" : acordo.origem === "cobranca" ? "Cobranca" : "Acordo"} ${acordo.id} - gerado em ${formatDateBR(new Date())}`, 8));

  section(lines, "Outorgante");
  addWrapped(lines, `Nome: ${fallback(condominio.nome, "condominio nao informado")}`, 10, true);
  addWrapped(lines, `CNPJ: ${formatDocumento(condominio.cnpj)}`);
  addWrapped(lines, `Endereco: ${formatEnderecoCondominio(condominio)}`);
  addWrapped(lines, `Representado por seu sindico: ${sindicoNome} - CPF/documento ${sindicoDocumento}`);
  addWrapped(lines, `Nome: ${sindicoNome}`);
  addWrapped(lines, `CPF/documento: ${sindicoDocumento}`);
  addWrapped(lines, `E-mail: ${fallback(sindico.email)}`);
  addWrapped(lines, `Telefone: ${fallback(sindico.telefone)}`);

  section(lines, acordo.origem === "unidade" ? "Unidade e cobranças agrupadas" : `Unidade e ${acordo.origem === "cobranca" ? "cobranca" : "acordo"} de referencia`);
  addWrapped(lines, `Unidade: ${fallback(unidade.identificacao, "-")}${unidade.bloco ? ` - Bloco ${unidade.bloco}` : ""}`);
  addWrapped(lines, `Responsavel/devedor: ${fallback(unidade.responsavel_nome)}`);
  addWrapped(lines, `Documento: ${formatDocumento(unidade.responsavel_documento)}`);
  addWrapped(lines, `E-mail: ${fallback(unidade.email)} | Telefone: ${fallback(unidade.telefone)}`);
  addWrapped(lines, acordo.origem === "unidade"
    ? `Cobranças agrupadas: ${acordo.quantidade_cobrancas ?? 1} | Valor total: ${formatCurrency(Number(acordo.valor_acordado ?? 0))}`
    : `Valor ${acordo.origem === "cobranca" ? "da cobranca" : "do acordo"}: ${formatCurrency(Number(acordo.valor_acordado ?? 0))} | ${acordo.origem === "cobranca" ? "Vencimento" : "Data"}: ${formatDateBR(acordo.data_acordo ?? acordo.created_at)}`);
  addWrapped(lines, `Status operacional: ${acordo.status ?? "-"} / ${acordo.fluxo_status ?? "-"}`);

  section(lines, "Outorgado");
  addWrapped(lines, "GENSKE SOCIEDADE INDIVIDUAL DE ADVOCACIA", 10, true);
  addWrapped(lines, "CNPJ: 32.814.704/0001-94");
  addWrapped(lines, "Endereco: Rua Jandiatuba, n. 506, conj. 140, Bloco B, CEP: 05716-150, Sao Paulo - SP");
  addWrapped(lines, "Representado por: Lidiane Genske Baia, OAB/SP n. 203.523");
  addWrapped(lines, "CPF: 283.344.978-06");
  addWrapped(lines, "E-mail: contencioso@genskeadvogados.com.br");

  return lines;
}

function montarPoderes(acordo: any) {
  const lines: PdfLine[] = [];
  const condominioNome = acordo.condominios?.nome ?? "Condominio";
  const unidade = acordo.unidades ?? {};
  const sindico = (acordo.sindico ?? {}) as SindicoInfo;
  const sindicoNome = fallback(sindico.nome, "sindico nao cadastrado no sistema");
  const sindicoDocumento = formatDocumento(sindico.documento);

  lines.push(line("PODERES", 13, true, BLUE));
  addWrapped(
    lines,
    `Pelo presente instrumento particular de procuração, o outorgante nomeia e constitui como seus bastante procuradores os advogados da Genske Sociedade Individual de Advocacia, para representar ${condominioNome} em medidas de cobrança ou execução relacionadas à unidade ${unidade.identificacao ?? "-"}${unidade.bloco ? `, bloco ${unidade.bloco}` : ""}.`,
    9,
    false,
    88,
  );
  addWrapped(
    lines,
    "Sao conferidos poderes para o foro em geral, com clausula ad judicia et extra, podendo propor acoes, acompanhar processos, apresentar documentos, requerer diligencias, assinar peticoes, receber intimacoes, celebrar acordos, dar quitacao, substabelecer, praticar atos perante reparticoes publicas e privadas e adotar as providencias necessarias a defesa dos interesses do outorgante.",
    9,
    false,
    88,
  );
  addWrapped(
    lines,
    "A presente procuracao e emitida para o encaminhamento juridico de cobranca condominial, inclusive cobranca de valores vencidos, parcelas de acordo inadimplidas, cotas vincendas relacionadas e demais encargos legais, contratuais e condominiais aplicaveis.",
    9,
    false,
    88,
  );

  section(lines, "Assinatura");
  addWrapped(lines, "Sao Paulo, ____ de ______________________ de ______.", 10);
  lines.push(line("", 12));
  lines.push(line("____________________________________________________", 10));
  addWrapped(lines, `${condominioNome}`, 9, true);
  addWrapped(lines, `Sindico(a): ${sindicoNome}`);
  addWrapped(lines, `CPF/documento: ${sindicoDocumento}`);

  lines.push(line("", 8));
  addWrapped(lines, "Documento gerado automaticamente pelo GKLI Cobranca para conferencia e coleta de assinatura.", 7);

  return lines;
}

export async function GET(request: Request) {
  try {
    await requireRole(["admin", "gestor", "operador"]);
    const url = new URL(request.url);
    const ids = unique(
      String(url.searchParams.get("ids") ?? "")
        .split(",")
        .map((id) => id.trim()),
    );
    const cobrancaIds = unique(
      String(url.searchParams.get("cobrancaIds") ?? "")
        .split(",")
        .map((id) => id.trim()),
    );

    if (ids.length === 0 && cobrancaIds.length === 0) {
      return NextResponse.json({ ok: false, error: "Selecione ao menos um acordo ou cobranca." }, { status: 400 });
    }

    const acordos = cobrancaIds.length ? await carregarCobrancas(cobrancaIds) : await carregarAcordos(ids);
    if (acordos.length === 0) {
      return NextResponse.json({ ok: false, error: "Nenhum acordo encontrado para gerar procuracao." }, { status: 404 });
    }

    const pages = acordos.flatMap((acordo) => [
      renderCover(acordo),
      renderTextPage(montarPartes(acordo)),
      renderTextPage(montarPoderes(acordo)),
    ]);

    const pdf = buildPdf(pages);

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="procuracoes-pre-juridico-${new Date().toISOString().slice(0, 10)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar procuracao.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

import crypto from "node:crypto";
import type { createAdminClient } from "@/utils/supabase/admin";
import type { CarteiraScope } from "@/utils/auth/get-permitted-carteiras";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";

const BUCKET = "documentos-pre-juridico";
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const LINE_HEIGHT = 14;
const BLUE = "0.02 0.31 0.54";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;
type OrigemDocumento = "acordo" | "cobranca";
type TipoDocumento = "laudo_pre_juridico" | "procuracao_pre_juridico";

type DocumentoGeradoInput = {
  supabase: SupabaseAdmin;
  mensagemId: string;
  loteId: string;
  loteItemId?: string | null;
  carteiraId?: string | null;
  acordoId?: string | null;
  cobrancaId?: string | null;
  condominioId?: string | null;
  unidadeId?: string | null;
  origem: OrigemDocumento;
  ids: string[];
  tipos: TipoDocumento[];
  scope: CarteiraScope;
};

type PdfLine = {
  content: string;
  size: number;
  bold: boolean;
  color: string;
};

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function firstRelation<T = any>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return (value[0] ?? null) as T | null;
  return (value ?? null) as T | null;
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

function onlyDigits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function formatDocumento(value: string | null | undefined, empty = "não cadastrado") {
  const raw = String(value ?? "").trim();
  const digits = onlyDigits(raw);
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return raw || empty;
}

function wrapLine(value: string, maxChars = 88) {
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

function line(content: string, size = 9, bold = false, color = "0 0 0"): PdfLine {
  return { content, size, bold, color };
}

function addWrapped(lines: PdfLine[], value: string, size = 9, bold = false, maxChars = 88) {
  for (const wrapped of wrapLine(value, maxChars)) lines.push(line(wrapped, size, bold));
}

function section(lines: PdfLine[], title: string) {
  lines.push(line("", 5));
  lines.push(line(title.toUpperCase(), 10, true, BLUE));
}

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
    objects[index] = Buffer.from(objects[index].toString("latin1").replace("/Parent 0 0 R", `/Parent ${pagesRef} 0 R`), "latin1");
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

function renderCover(title: string, subtitle: string, footer: string) {
  return [
    "q",
    `${BLUE} rg`,
    `0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT} re f`,
    "Q",
    "q",
    "1 1 1 rg",
    `58 490 ${PAGE_WIDTH - 116} 110 re f`,
    "Q",
    `${BLUE} rg`,
    "BT /F2 48 Tf 116 535 Td (GENSKE) Tj ET",
    "BT /F1 16 Tf 178 508 Td (A D V O G A D O S) Tj ET",
    "1 1 1 rg",
    `BT /F2 35 Tf 72 370 Td (${escapePdf(title)}) Tj ET`,
    `BT /F1 14 Tf 72 334 Td (${escapePdf(subtitle)}) Tj ET`,
    `BT /F1 10 Tf 72 108 Td (${escapePdf(footer)}) Tj ET`,
  ].join("\n");
}

function normalizeRows(rows: any[]) {
  return rows.map((row) => ({
    ...row,
    carteiras: firstRelation(row.carteiras),
    condominios: firstRelation(row.condominios),
    unidades: firstRelation(row.unidades),
  }));
}

async function carregarCobrancas(supabase: SupabaseAdmin, ids: string[], scope: CarteiraScope) {
  let query = supabase.from("cobrancas").select(`
    id, carteira_id, condominio_id, unidade_id, status, status_financeiro,
    status_operacional, valor_original, valor_atualizado, vencimento, competencia, created_at,
    carteiras:carteira_id (id,nome,pre_juridico_habilitado),
    condominios:condominio_id (
      id,nome,cnpj,endereco_logradouro,endereco_numero,endereco_complemento,
      endereco_bairro,endereco_cidade,endereco_uf,endereco_cep,administradora_id
    ),
    unidades:unidade_id (id,identificacao,bloco,responsavel_nome,responsavel_documento,email,telefone)
  `).in("id", ids).order("vencimento", { ascending: true });
  query = applyCarteiraScope(query, scope.carteiraIds);
  const { data, error } = await query;
  if (error) throw new Error(`Erro ao carregar cobranças para documento: ${error.message}`);
  return normalizeRows((data ?? []) as any[]);
}

async function carregarAcordos(supabase: SupabaseAdmin, ids: string[], scope: CarteiraScope) {
  let query = supabase.from("acordos").select(`
    id, carteira_id, condominio_id, unidade_id, status, status_financeiro,
    fluxo_status, valor_acordado, quantidade_parcelas, data_acordo, created_at,
    carteiras:carteira_id (id,nome,pre_juridico_habilitado),
    condominios:condominio_id (
      id,nome,cnpj,endereco_logradouro,endereco_numero,endereco_complemento,
      endereco_bairro,endereco_cidade,endereco_uf,endereco_cep,administradora_id
    ),
    unidades:unidade_id (id,identificacao,bloco,responsavel_nome,responsavel_documento,email,telefone)
  `).in("id", ids).order("data_acordo", { ascending: false });
  query = applyCarteiraScope(query, scope.carteiraIds);
  const { data, error } = await query;
  if (error) throw new Error(`Erro ao carregar acordos para documento: ${error.message}`);
  return normalizeRows((data ?? []) as any[]);
}

async function carregarSindicos(supabase: SupabaseAdmin, condominioIds: string[]) {
  const result = new Map<string, any>();
  if (!condominioIds.length) return result;

  const { data: condominios, error: condominiosError } = await supabase
    .from("condominios")
    .select("id,nome,sindico_email,sindico_celular")
    .in("id", condominioIds);
  if (condominiosError) throw new Error(`Erro ao carregar contatos do condomínio: ${condominiosError.message}`);

  for (const row of (condominios ?? []) as any[]) {
    const email = String(row.sindico_email ?? "").trim() || null;
    const telefone = String(row.sindico_celular ?? "").trim() || null;
    if (email || telefone) {
      result.set(row.id, { nome: row.nome ? `Síndico - ${row.nome}` : "Síndico", email, telefone });
    }
  }

  const { data, error } = await supabase
    .from("portal_sindico_condominios")
    .select("condominio_id,perfil,status,portal_sindico_usuarios(nome,email,documento,telefone,status)")
    .in("condominio_id", condominioIds)
    .eq("perfil", "sindico")
    .eq("status", "ativo");
  if (error) throw new Error(`Erro ao carregar síndicos para documento: ${error.message}`);

  for (const row of (data ?? []) as any[]) {
    const usuario = firstRelation((row as any).portal_sindico_usuarios);
    if (!usuario || usuario.status === "inativo") continue;
    const cadastro = result.get(row.condominio_id) ?? {};
    result.set(row.condominio_id, {
      nome: usuario.nome ?? cadastro.nome,
      email: cadastro.email ?? usuario.email,
      documento: usuario.documento ?? cadastro.documento,
      telefone: cadastro.telefone ?? usuario.telefone,
    });
  }

  return result;
}

function formatEndereco(condominio: any) {
  const partes = [
    condominio?.endereco_logradouro,
    condominio?.endereco_numero ? `nº ${condominio.endereco_numero}` : null,
    condominio?.endereco_complemento,
    condominio?.endereco_bairro,
    [condominio?.endereco_cidade, condominio?.endereco_uf].filter(Boolean).join(" - "),
    condominio?.endereco_cep ? `CEP ${condominio.endereco_cep}` : null,
  ];
  return partes.filter(Boolean).join(", ") || "não cadastrado";
}

function montarLaudo(rows: any[], origem: OrigemDocumento) {
  const first = rows[0] ?? {};
  const condominio = first.condominios ?? {};
  const unidade = first.unidades ?? {};
  const lines: PdfLine[] = [];
  const total = rows.reduce((sum, row) => sum + Number(row.valor_atualizado ?? row.valor_original ?? row.valor_acordado ?? 0), 0);

  lines.push(line("GKLI COBRANÇA - LAUDO PRÉ-JURÍDICO", 13, true, BLUE));
  lines.push(line(`Gerado em ${formatDateBR(new Date())}`, 8));
  section(lines, "Identificação");
  addWrapped(lines, `Condomínio: ${condominio.nome ?? "-"}`, 10, true);
  addWrapped(lines, `Unidade: ${unidade.identificacao ?? "-"}${unidade.bloco ? ` - Bloco ${unidade.bloco}` : ""}`);
  addWrapped(lines, `Responsável: ${unidade.responsavel_nome ?? "-"}`);
  addWrapped(lines, `Documento: ${formatDocumento(unidade.responsavel_documento)}`);
  addWrapped(lines, `E-mail: ${unidade.email ?? "-"} | Telefone: ${unidade.telefone ?? "-"}`);

  section(lines, "Resumo financeiro");
  addWrapped(lines, `Origem: ${origem === "cobranca" ? "Cobranças" : "Acordos"} | Quantidade: ${rows.length} | Valor total: ${formatCurrency(total)}`);

  section(lines, origem === "cobranca" ? "Cobranças consideradas" : "Acordos considerados");
  for (const row of rows.slice(0, 18)) {
    if (origem === "cobranca") {
      addWrapped(lines, `${formatDateBR(row.vencimento)} | Comp. ${row.competencia ?? "-"} | ${formatCurrency(Number(row.valor_atualizado ?? row.valor_original ?? 0))} | ${row.status_operacional ?? row.status ?? "-"}`);
    } else {
      addWrapped(lines, `${formatDateBR(row.data_acordo ?? row.created_at)} | ${formatCurrency(Number(row.valor_acordado ?? 0))} | Parcelas ${row.quantidade_parcelas ?? "-"} | ${row.status_financeiro ?? row.status ?? "-"}`);
    }
  }

  section(lines, "Observação operacional");
  addWrapped(lines, "Documento gerado automaticamente a partir dos registros do GKLI Cobrança para apoiar o encaminhamento pré-jurídico.", 8);
  return buildPdf([
    renderCover("Laudo pré-jurídico", `${condominio.nome ?? "Condomínio"} · Unidade ${unidade.identificacao ?? "-"}`, "GKLI Cobrança"),
    renderTextPage(lines),
  ]);
}

function montarProcuracao(rows: any[], origem: OrigemDocumento, sindicos: Map<string, any>) {
  const first = rows[0] ?? {};
  const condominio = first.condominios ?? {};
  const unidade = first.unidades ?? {};
  const sindico = sindicos.get(first.condominio_id) ?? {};
  const valor = rows.reduce((sum, row) => sum + Number(row.valor_atualizado ?? row.valor_original ?? row.valor_acordado ?? 0), 0);
  const lines: PdfLine[] = [];

  lines.push(line("PROCURAÇÃO PARA AÇÃO DE COBRANÇA OU EXECUÇÃO", 13, true, BLUE));
  lines.push(line(`Gerada em ${formatDateBR(new Date())}`, 8));
  section(lines, "Outorgante");
  addWrapped(lines, `Nome: ${condominio.nome ?? "-"}`, 10, true);
  addWrapped(lines, `CNPJ: ${formatDocumento(condominio.cnpj)}`);
  addWrapped(lines, `Endereço: ${formatEndereco(condominio)}`);
  addWrapped(lines, `Síndico(a): ${sindico.nome ?? "não cadastrado"}`);
  addWrapped(lines, `CPF/documento: ${formatDocumento(sindico.documento)}`);
  addWrapped(lines, `E-mail: ${sindico.email ?? "não cadastrado"} | Telefone: ${sindico.telefone ?? "não cadastrado"}`);

  section(lines, "Unidade e débito");
  addWrapped(lines, `Unidade: ${unidade.identificacao ?? "-"}${unidade.bloco ? ` - Bloco ${unidade.bloco}` : ""}`);
  addWrapped(lines, `Responsável/devedor: ${unidade.responsavel_nome ?? "-"}`);
  addWrapped(lines, `Documento: ${formatDocumento(unidade.responsavel_documento)}`);
  addWrapped(lines, `Referências agrupadas: ${rows.length} | Origem: ${origem === "cobranca" ? "cobranças" : "acordos"} | Valor: ${formatCurrency(valor)}`);

  section(lines, "Outorgado");
  addWrapped(lines, "GENSKE SOCIEDADE INDIVIDUAL DE ADVOCACIA", 10, true);
  addWrapped(lines, "CNPJ: 32.814.704/0001-94");
  addWrapped(lines, "Endereço: Rua Jandiatuba, n. 506, conj. 140, Bloco B, CEP: 05716-150, São Paulo - SP");
  addWrapped(lines, "Representado por: Lidiane Genske Baia, OAB/SP n. 203.523");
  addWrapped(lines, "E-mail: contencioso@genskeadvogados.com.br");

  const poderes: PdfLine[] = [];
  poderes.push(line("PODERES", 13, true, BLUE));
  addWrapped(poderes, `Pelo presente instrumento particular de procuração, o outorgante nomeia e constitui como seus bastante procuradores os advogados da Genske Sociedade Individual de Advocacia, para representar ${condominio.nome ?? "o condomínio"} em medidas de cobrança ou execução relacionadas à unidade ${unidade.identificacao ?? "-"}.`);
  addWrapped(poderes, "São conferidos poderes para o foro em geral, com cláusula ad judicia et extra, podendo propor ações, acompanhar processos, apresentar documentos, requerer diligências, assinar petições, receber intimações, celebrar acordos, dar quitação, substabelecer e praticar os atos necessários à defesa dos interesses do outorgante.");
  section(poderes, "Assinatura");
  addWrapped(poderes, "São Paulo, ____ de ______________________ de ______.", 10);
  poderes.push(line("", 12));
  poderes.push(line("____________________________________________________", 10));
  addWrapped(poderes, `${condominio.nome ?? "Condomínio"}`, 9, true);
  addWrapped(poderes, `Síndico(a): ${sindico.nome ?? "não cadastrado"}`);
  addWrapped(poderes, `CPF/documento: ${formatDocumento(sindico.documento)}`);

  return buildPdf([
    renderCover("Procuração", `${condominio.nome ?? "Condomínio"} · Unidade ${unidade.identificacao ?? "-"}`, "GENSKE Advogados"),
    renderTextPage(lines),
    renderTextPage(poderes),
  ]);
}

function safeFilePart(value: unknown) {
  return String(value ?? "documento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "documento";
}

async function salvarDocumento(params: DocumentoGeradoInput & {
  tipo: TipoDocumento;
  buffer: Buffer;
  nomeArquivo: string;
}) {
  const hash = crypto.createHash("sha256").update(params.buffer).digest("hex");
  const storagePath = [
    safeFilePart(params.carteiraId ?? "sem-carteira"),
    safeFilePart(params.loteId),
    `${safeFilePart(params.tipo)}-${hash.slice(0, 12)}.pdf`,
  ].join("/");

  const { error: uploadError } = await params.supabase.storage
    .from(BUCKET)
    .upload(storagePath, params.buffer, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadError) throw new Error(`Erro ao armazenar PDF: ${uploadError.message}`);

  const { data: documento, error: documentoError } = await params.supabase
    .from("documentos_gerados")
    .upsert({
      carteira_id: params.carteiraId ?? null,
      lote_id: params.loteId,
      lote_item_id: params.loteItemId ?? null,
      mensagem_id: params.mensagemId,
      acordo_id: params.acordoId ?? null,
      cobranca_id: params.cobrancaId ?? null,
      condominio_id: params.condominioId ?? null,
      unidade_id: params.unidadeId ?? null,
      tipo: params.tipo,
      nome_arquivo: params.nomeArquivo,
      content_type: "application/pdf",
      storage_bucket: BUCKET,
      storage_path: storagePath,
      tamanho_bytes: params.buffer.length,
      checksum_sha256: hash,
      payload: { origem: params.origem, ids: params.ids },
    } as any, { onConflict: "storage_bucket,storage_path" })
    .select("id")
    .single();
  if (documentoError || !documento?.id) throw new Error(`Erro ao registrar PDF: ${documentoError?.message ?? "documento não retornado"}`);

  const { error: anexoError } = await params.supabase
    .from("mensagem_anexos")
    .upsert({
      mensagem_id: params.mensagemId,
      documento_id: documento.id,
      ordem: params.tipo === "laudo_pre_juridico" ? 1 : 2,
    } as any, { onConflict: "mensagem_id,documento_id" });
  if (anexoError) throw new Error(`Erro ao vincular anexo à mensagem: ${anexoError.message}`);

  return documento.id as string;
}

export async function gerarEAnexarDocumentosPreJuridico(input: DocumentoGeradoInput) {
  if (!input.ids.length || !input.tipos.length) return [];
  const rows = input.origem === "cobranca"
    ? await carregarCobrancas(input.supabase, input.ids, input.scope)
    : await carregarAcordos(input.supabase, input.ids, input.scope);
  if (!rows.length) throw new Error("Nenhum registro encontrado para gerar anexos pré-jurídicos.");

  const first = rows[0] ?? {};
  const condominioNome = safeFilePart(first.condominios?.nome ?? "condominio");
  const unidadeNome = safeFilePart(first.unidades?.identificacao ?? "unidade");
  const documentos: string[] = [];

  if (input.tipos.includes("laudo_pre_juridico")) {
    documentos.push(await salvarDocumento({
      ...input,
      tipo: "laudo_pre_juridico",
      buffer: montarLaudo(rows, input.origem),
      nomeArquivo: `laudo-pre-juridico-${condominioNome}-${unidadeNome}.pdf`,
    }));
  }

  if (input.tipos.includes("procuracao_pre_juridico")) {
    const sindicos = await carregarSindicos(input.supabase, unique(rows.map((row) => row.condominio_id)));
    documentos.push(await salvarDocumento({
      ...input,
      tipo: "procuracao_pre_juridico",
      buffer: montarProcuracao(rows, input.origem, sindicos),
      nomeArquivo: `procuracao-pre-juridico-${condominioNome}-${unidadeNome}.pdf`,
    }));
  }

  return documentos;
}

export async function listarAnexosMensagem(supabase: SupabaseAdmin, mensagemId: string) {
  const { data, error } = await supabase
    .from("mensagem_anexos")
    .select(`
      ordem,
      documento:documentos_gerados(
        id,
        nome_arquivo,
        content_type,
        storage_bucket,
        storage_path
      )
    `)
    .eq("mensagem_id", mensagemId)
    .order("ordem", { ascending: true });
  if (error) throw new Error(`Erro ao carregar anexos da mensagem: ${error.message}`);

  const anexos = [];
  for (const row of (data ?? []) as any[]) {
    const documento = firstRelation(row.documento);
    if (!documento?.storage_bucket || !documento?.storage_path) continue;
    const { data: file, error: downloadError } = await supabase.storage
      .from(documento.storage_bucket)
      .download(documento.storage_path);
    if (downloadError) throw new Error(`Erro ao baixar anexo ${documento.nome_arquivo}: ${downloadError.message}`);
    anexos.push({
      filename: documento.nome_arquivo,
      contentType: documento.content_type || "application/pdf",
      content: Buffer.from(await file.arrayBuffer()),
    });
  }
  return anexos;
}

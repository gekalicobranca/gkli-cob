import { NextResponse } from "next/server";

import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { requireRole } from "@/utils/auth/require-role";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const LINE_HEIGHT = 14;
const BLUE = "0.02 0.31 0.54";

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
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
      condominios:condominio_id (
        id,
        nome,
        cnpj,
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
  if (error) throw new Error(`Erro ao carregar acordos para procuração: ${error.message}`);
  return (data ?? []) as any[];
}

function montarPartes(acordo: any) {
  const lines: PdfLine[] = [];
  const condominio = acordo.condominios ?? {};
  const unidade = acordo.unidades ?? {};

  lines.push(line("PROCURAÇÃO PARA AÇÃO DE COBRANÇA OU EXECUÇÃO", 13, true, BLUE));
  lines.push(line(`Acordo ${acordo.id} - gerado em ${formatDateBR(new Date())}`, 8));

  section(lines, "Outorgante");
  addWrapped(lines, `NOME: ${condominio.nome ?? "Condomínio não informado"}`, 10, true);
  addWrapped(lines, `CNPJ: ${condominio.cnpj ?? "não informado"}`);
  addWrapped(lines, "Endereço: não informado");
  addWrapped(lines, "Representado por seu síndico: [nome completo + CPF]");
  addWrapped(lines, "Nome: ________________________________________________");
  addWrapped(lines, "CPF: _________________________________________________");
  addWrapped(lines, "E-mail: ______________________________________________");

  section(lines, "Unidade e acordo de referência");
  addWrapped(lines, `Unidade: ${unidade.identificacao ?? "-"}${unidade.bloco ? ` - Bloco ${unidade.bloco}` : ""}`);
  addWrapped(lines, `Responsável/devedor: ${unidade.responsavel_nome ?? "não informado"}`);
  addWrapped(lines, `Documento: ${unidade.responsavel_documento ?? "não informado"}`);
  addWrapped(lines, `E-mail: ${unidade.email ?? "não informado"} | Telefone: ${unidade.telefone ?? "não informado"}`);
  addWrapped(lines, `Valor do acordo: ${formatCurrency(Number(acordo.valor_acordado ?? 0))} | Parcelas: ${acordo.quantidade_parcelas ?? "-"} | Data: ${formatDateBR(acordo.data_acordo ?? acordo.created_at)}`);
  addWrapped(lines, `Status operacional: ${acordo.status ?? "-"} / ${acordo.fluxo_status ?? "-"}`);

  section(lines, "Outorgado");
  addWrapped(lines, "GENSKE SOCIEDADE INDIVIDUAL DE ADVOCACIA", 10, true);
  addWrapped(lines, "CNPJ: 32.814.704/0001-94");
  addWrapped(lines, "Endereço: Rua Jandiatuba, n. 506, conj. 140, Bloco B, CEP: 05716-150, São Paulo - SP");
  addWrapped(lines, "Representado por: Lidiane Genske Baia, OAB/SP nº 203.523");
  addWrapped(lines, "CPF: 283.344.978-06");
  addWrapped(lines, "E-mail: contencioso@genskeadvogados.com.br");

  return lines;
}

function montarPoderes(acordo: any) {
  const lines: PdfLine[] = [];
  const condominioNome = acordo.condominios?.nome ?? "Condomínio";
  const unidade = acordo.unidades ?? {};

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
    "São conferidos poderes para o foro em geral, com cláusula ad judicia et extra, podendo propor ações, acompanhar processos, apresentar documentos, requerer diligências, assinar petições, receber intimações, celebrar acordos, dar quitação, substabelecer, praticar atos perante repartições públicas e privadas e adotar as providências necessárias à defesa dos interesses do outorgante.",
    9,
    false,
    88,
  );
  addWrapped(
    lines,
    "A presente procuração é emitida para o encaminhamento jurídico de cobrança condominial, inclusive cobrança de valores vencidos, parcelas de acordo inadimplidas, cotas vincendas relacionadas e demais encargos legais, contratuais e condominiais aplicáveis.",
    9,
    false,
    88,
  );

  section(lines, "Assinatura");
  addWrapped(lines, "São Paulo, ____ de ______________________ de ______.", 10);
  lines.push(line("", 12));
  lines.push(line("____________________________________________________", 10));
  addWrapped(lines, `${condominioNome}`, 9, true);
  addWrapped(lines, "Síndico(a): ________________________________________");
  addWrapped(lines, "CPF: _______________________________________________");

  lines.push(line("", 8));
  addWrapped(lines, "Documento gerado automaticamente pelo GKLI Cobrança para conferência e coleta de assinatura.", 7);

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

    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: "Selecione ao menos um acordo." }, { status: 400 });
    }

    const acordos = await carregarAcordos(ids);
    if (acordos.length === 0) {
      return NextResponse.json({ ok: false, error: "Nenhum acordo encontrado para gerar procuração." }, { status: 404 });
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
    const message = error instanceof Error ? error.message : "Erro ao gerar procuração.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

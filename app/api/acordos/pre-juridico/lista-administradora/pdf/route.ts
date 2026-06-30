import { NextResponse } from "next/server";

import { getCobrancaStatusOperacional } from "@/lib/core/cobranca-status";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { requireRole } from "@/utils/auth/require-role";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 42;
const LINE_HEIGHT = 13;

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

function wrapLine(value: string, maxChars = 92) {
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

function line(content: string, size = 9, bold = false) {
  return { content, size, bold };
}

type PdfLine = ReturnType<typeof line>;

function renderPage(lines: PdfLine[]) {
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
    ops.push(`BT /${font} ${item.size} Tf ${MARGIN} ${y} Td (${escapePdf(item.content)}) Tj ET`);
    y -= Math.max(LINE_HEIGHT, item.size + 4);
  }

  return ops.join("\n");
}

function buildPdf(pages: PdfLine[][]) {
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

  for (const page of pages) {
    const content = Buffer.from(renderPage(page), "latin1");
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

function section(lines: PdfLine[], title: string) {
  lines.push(line("", 5));
  lines.push(line(title.toUpperCase(), 10, true));
}

function addWrapped(lines: PdfLine[], value: string, size = 8, bold = false, maxChars = 94) {
  for (const wrapped of wrapLine(value, maxChars)) {
    lines.push(line(wrapped, size, bold));
  }
}

async function carregarDados(ids: string[]) {
  const supabase = await createClient();
  const scope = await getPermittedCarteiras();

  let acordosQuery = supabase
    .from("acordos")
    .select(`
      id,
      carteira_id,
      condominio_id,
      unidade_id,
      cobranca_id,
      status,
      status_financeiro,
      fluxo_status,
      valor_acordado,
      data_acordo,
      created_at,
      condominios:condominio_id (
        id,
        nome,
        administradora_id,
        administradoras:administradora_id (id,nome)
      ),
      unidades:unidade_id (id,identificacao,bloco,responsavel_nome)
    `)
    .in("id", ids);

  acordosQuery = applyCarteiraScope(acordosQuery, scope.carteiraIds);

  const { data: acordosRaw, error: acordosError } = await acordosQuery;
  if (acordosError) throw new Error(`Erro ao carregar acordos: ${acordosError.message}`);

  const acordos = (acordosRaw ?? []) as any[];
  if (acordos.length === 0) return [];

  const acordoIds = acordos.map((acordo) => acordo.id);
  const { data: vinculosRaw, error: vinculosError } = await supabase
    .from("acordo_cobrancas")
    .select("acordo_id,cobranca_id")
    .in("acordo_id", acordoIds);

  if (vinculosError && vinculosError.code !== "42P01") {
    throw new Error(`Erro ao carregar cobranças vinculadas: ${vinculosError.message}`);
  }

  const unidadeIds = unique(acordos.map((acordo) => acordo.unidade_id));
  const condominioIds = unique(acordos.map((acordo) => acordo.condominio_id));
  let cobrancas: any[] = [];

  if (unidadeIds.length > 0 && condominioIds.length > 0) {
    let cobrancasQuery = supabase
      .from("cobrancas")
      .select("id,carteira_id,condominio_id,unidade_id,competencia,vencimento,valor_original,valor_atualizado,status,status_operacional,status_financeiro")
      .in("unidade_id", unidadeIds)
      .in("condominio_id", condominioIds)
      .order("vencimento", { ascending: true });

    cobrancasQuery = applyCarteiraScope(cobrancasQuery, scope.carteiraIds);

    const { data, error } = await cobrancasQuery;
    if (error) throw new Error(`Erro ao carregar cobranças: ${error.message}`);
    cobrancas = (data ?? []) as any[];
  }

  const vinculos = (vinculosRaw ?? []) as any[];
  return acordos.map((acordo) => {
    const idsVinculadas = new Set(
      vinculos
        .filter((vinculo) => vinculo.acordo_id === acordo.id)
        .map((vinculo) => vinculo.cobranca_id)
        .filter(Boolean),
    );
    if (acordo.cobranca_id) idsVinculadas.add(acordo.cobranca_id);

    const cobrancasDaUnidade = cobrancas.filter(
      (cobranca) => cobranca.condominio_id === acordo.condominio_id && cobranca.unidade_id === acordo.unidade_id,
    );
    const cobrancasForaAcordo = cobrancasDaUnidade.filter((cobranca) => !idsVinculadas.has(cobranca.id));

    return {
      ...acordo,
      cobrancas_da_unidade: cobrancasDaUnidade,
      cobrancas_fora_acordo: cobrancasForaAcordo,
    };
  });
}

function adminKey(acordo: any) {
  const administradora = acordo.condominios?.administradoras;
  return acordo.condominios?.administradora_id ?? administradora?.id ?? "sem-administradora";
}

function montarPaginas(acordos: any[]) {
  const porAdm = new Map<string, any[]>();
  for (const acordo of acordos) {
    const key = adminKey(acordo);
    if (!porAdm.has(key)) porAdm.set(key, []);
    porAdm.get(key)!.push(acordo);
  }

  return Array.from(porAdm.values()).map((rows, index, all) => {
    const adm = rows[0]?.condominios?.administradoras;
    const linhas: PdfLine[] = [];
    const porCondominio = new Map<string, any[]>();
    for (const row of rows) {
      const key = row.condominio_id ?? "sem-condominio";
      if (!porCondominio.has(key)) porCondominio.set(key, []);
      porCondominio.get(key)!.push(row);
    }

    const totalAcordos = rows.length;
    const totalUnidades = new Set(rows.map((row) => row.unidade_id).filter(Boolean)).size;
    const valorAcordos = rows.reduce((sum, row) => sum + Number(row.valor_acordado ?? 0), 0);
    const valorForaAcordo = rows.reduce(
      (sum, row) => sum + (row.cobrancas_fora_acordo ?? []).reduce(
        (subtotal: number, cobranca: any) => subtotal + Number(cobranca.valor_atualizado ?? cobranca.valor_original ?? 0),
        0,
      ),
      0,
    );

    linhas.push(line("GKLI COBRANCA - LISTA PARA ADMINISTRADORA", 13, true));
    linhas.push(line(`Administradora ${index + 1} de ${all.length} - gerado em ${formatDateBR(new Date())}`, 8));
    linhas.push(line("", 5));
    linhas.push(line(adm?.nome ?? "Administradora nao informada", 12, true));
    addWrapped(linhas, `Acordos quebrados: ${totalAcordos} | Unidades: ${totalUnidades} | Valor acordado: ${formatCurrency(valorAcordos)} | Cotas fora do acordo: ${formatCurrency(valorForaAcordo)}`);

    section(linhas, "Resumo por condominio");
    for (const [condominioId, itens] of porCondominio) {
      const condominio = itens[0]?.condominios;
      const unidades = new Set(itens.map((item) => item.unidade_id).filter(Boolean)).size;
      const valor = itens.reduce((sum, item) => sum + Number(item.valor_acordado ?? 0), 0);
      const fora = itens.reduce(
        (sum, item) => sum + (item.cobrancas_fora_acordo ?? []).reduce(
          (subtotal: number, cobranca: any) => subtotal + Number(cobranca.valor_atualizado ?? cobranca.valor_original ?? 0),
          0,
        ),
        0,
      );
      addWrapped(
        linhas,
        `${condominio?.nome ?? condominioId}: ${itens.length} acordo(s), ${unidades} unidade(s), ${formatCurrency(valor)} em acordos, ${formatCurrency(fora)} em cotas fora do acordo.`,
        8,
        true,
      );

      for (const acordo of itens.slice(0, 8)) {
        const unidade = acordo.unidades ?? {};
        const foraAcordo = acordo.cobrancas_fora_acordo ?? [];
        const proximaFora = foraAcordo[0];
        const detalheFora = proximaFora
          ? ` | Fora do acordo: ${foraAcordo.length} cota(s), prox. ${formatDateBR(proximaFora.vencimento)}, ${getCobrancaStatusOperacional(proximaFora)}`
          : "";
        addWrapped(
          linhas,
          `- Unidade ${unidade.identificacao ?? "-"}${unidade.bloco ? ` / Bloco ${unidade.bloco}` : ""} | ${unidade.responsavel_nome ?? "Responsavel nao informado"} | Acordo ${formatCurrency(Number(acordo.valor_acordado ?? 0))} | ${acordo.status ?? "-"} / ${acordo.fluxo_status ?? "-"}${detalheFora}`,
          7,
        );
      }
    }

    section(linhas, "Orientacao operacional");
    addWrapped(linhas, "Lista consolidada para a administradora conferir boletos, cotas vincendas fora do acordo e encaminhamentos necessarios por condominio.", 8);

    return linhas;
  });
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

    const acordos = await carregarDados(ids);
    if (acordos.length === 0) {
      return NextResponse.json({ ok: false, error: "Nenhum acordo encontrado para gerar a lista." }, { status: 404 });
    }

    const pdf = buildPdf(montarPaginas(acordos));

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="lista-administradoras-pre-juridico-${new Date().toISOString().slice(0, 10)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar lista para administradoras.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

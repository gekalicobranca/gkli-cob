import { NextResponse } from "next/server";

import { requireRole } from "@/utils/auth/require-role";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";
import { createClient } from "@/utils/supabase/server";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";
import { getCobrancaStatusOperacional } from "@/lib/core/cobranca-status";

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

function unidadeKey(acordo: any) {
  return `${acordo.condominio_id ?? "sem-condominio"}:${acordo.unidade_id ?? "sem-unidade"}`;
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
      entrada_valor,
      quantidade_parcelas,
      data_acordo,
      created_at,
      condominios:condominio_id (id,nome),
      unidades:unidade_id (id,identificacao,bloco,responsavel_nome,responsavel_email,responsavel_telefone)
    `)
    .in("id", ids);

  acordosQuery = applyCarteiraScope(acordosQuery, scope.carteiraIds);

  const { data: acordosRaw, error: acordosError } = await acordosQuery;
  if (acordosError) throw new Error(`Erro ao carregar acordos: ${acordosError.message}`);

  const acordos = (acordosRaw ?? []) as any[];
  if (acordos.length === 0) return [];

  const acordoIds = acordos.map((acordo) => acordo.id);
  const [parcelasResult, vinculosResult] = await Promise.all([
    supabase
      .from("parcelas_acordo")
      .select("id,acordo_id,numero_parcela,valor,vencimento,status,pago_em,created_at")
      .in("acordo_id", acordoIds)
      .order("vencimento", { ascending: true }),
    supabase
      .from("acordo_cobrancas")
      .select("acordo_id,cobranca_id")
      .in("acordo_id", acordoIds),
  ]);

  if (parcelasResult.error) throw new Error(`Erro ao carregar parcelas: ${parcelasResult.error.message}`);
  if (vinculosResult.error && vinculosResult.error.code !== "42P01") {
    throw new Error(`Erro ao carregar cobranças vinculadas: ${vinculosResult.error.message}`);
  }

  const unidadeIds = unique(acordos.map((acordo) => acordo.unidade_id));
  const condominioIds = unique(acordos.map((acordo) => acordo.condominio_id));
  let cobrancas: any[] = [];

  if (unidadeIds.length > 0 && condominioIds.length > 0) {
    let cobrancasQuery = supabase
      .from("cobrancas")
      .select("id,carteira_id,condominio_id,unidade_id,competencia,vencimento,valor_original,valor_atualizado,status,status_operacional,status_financeiro,created_at")
      .in("unidade_id", unidadeIds)
      .in("condominio_id", condominioIds)
      .order("vencimento", { ascending: true });

    cobrancasQuery = applyCarteiraScope(cobrancasQuery, scope.carteiraIds);

    const { data, error } = await cobrancasQuery;
    if (error) throw new Error(`Erro ao carregar cobranças: ${error.message}`);
    cobrancas = (data ?? []) as any[];
  }

  const cobrancaIds = unique(cobrancas.map((cobranca) => cobranca.id));
  const [timelineAcordosResult, timelineCobrancasResult] = await Promise.all([
    supabase
      .from("timeline_operacional")
      .select("id,acordo_id,cobranca_id,evento_tipo,titulo,descricao,ocorreu_em,created_at")
      .in("acordo_id", acordoIds)
      .order("ocorreu_em", { ascending: false })
      .limit(300),
    cobrancaIds.length > 0
      ? supabase
          .from("timeline_operacional")
          .select("id,acordo_id,cobranca_id,evento_tipo,titulo,descricao,ocorreu_em,created_at")
          .in("cobranca_id", cobrancaIds)
          .order("ocorreu_em", { ascending: false })
          .limit(300)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (timelineAcordosResult.error && timelineAcordosResult.error.code !== "42P01") {
    throw new Error(`Erro ao carregar timeline dos acordos: ${timelineAcordosResult.error.message}`);
  }
  if (timelineCobrancasResult.error && timelineCobrancasResult.error.code !== "42P01") {
    throw new Error(`Erro ao carregar timeline das cobranças: ${timelineCobrancasResult.error.message}`);
  }

  const parcelas = (parcelasResult.data ?? []) as any[];
  const vinculos = (vinculosResult.data ?? []) as any[];
  const timeline = [
    ...((timelineAcordosResult.data ?? []) as any[]),
    ...((timelineCobrancasResult.data ?? []) as any[]),
  ];

  const groups = new Map<string, any>();
  for (const acordo of acordos) {
    const key = unidadeKey(acordo);
    if (!groups.has(key)) {
      groups.set(key, {
        condominio: acordo.condominios,
        unidade: acordo.unidades,
        condominio_id: acordo.condominio_id,
        unidade_id: acordo.unidade_id,
        acordos: [],
      });
    }
    groups.get(key).acordos.push(acordo);
  }

  return Array.from(groups.values()).map((group) => {
    const groupAcordoIds = new Set(group.acordos.map((acordo: any) => acordo.id));
    const vinculosDoGrupo = new Set(
      vinculos
        .filter((vinculo) => groupAcordoIds.has(vinculo.acordo_id))
        .map((vinculo) => vinculo.cobranca_id)
        .filter(Boolean),
    );

    for (const acordo of group.acordos) {
      if (acordo.cobranca_id) vinculosDoGrupo.add(acordo.cobranca_id);
    }

    const cobrancasDaUnidade = cobrancas.filter(
      (cobranca) => cobranca.condominio_id === group.condominio_id && cobranca.unidade_id === group.unidade_id,
    );
    const cobrancaIdsUnidade = new Set(cobrancasDaUnidade.map((cobranca) => cobranca.id));

    return {
      ...group,
      parcelas: parcelas.filter((parcela) => groupAcordoIds.has(parcela.acordo_id)),
      cobrancas: cobrancasDaUnidade,
      cobrancaIdsVinculadas: vinculosDoGrupo,
      timeline: timeline
        .filter((evento) => groupAcordoIds.has(evento.acordo_id) || cobrancaIdsUnidade.has(evento.cobranca_id))
        .sort((a, b) => new Date(b.ocorreu_em ?? b.created_at ?? 0).getTime() - new Date(a.ocorreu_em ?? a.created_at ?? 0).getTime()),
    };
  });
}

function montarPagina(group: any, pageIndex: number, totalPages: number) {
  const lines: PdfLine[] = [];
  const unidade = group.unidade ?? {};
  const condominio = group.condominio ?? {};
  const acordos = group.acordos ?? [];
  const valorAcordos = acordos.reduce((sum: number, acordo: any) => sum + Number(acordo.valor_acordado ?? 0), 0);
  const valorCobrancas = (group.cobrancas ?? []).reduce(
    (sum: number, cobranca: any) => sum + Number(cobranca.valor_atualizado ?? cobranca.valor_original ?? 0),
    0,
  );

  lines.push(line("GKLI COBRANCA - PACOTE PRE-JURIDICO", 13, true));
  lines.push(line(`Unidade ${pageIndex + 1} de ${totalPages} - gerado em ${formatDateBR(new Date())}`, 8));
  lines.push(line("", 5));
  lines.push(line(`${condominio.nome ?? "Condominio nao informado"} - Unidade ${unidade.identificacao ?? "-"}`, 12, true));
  addWrapped(lines, `Bloco: ${unidade.bloco ?? "-"} | Responsavel: ${unidade.responsavel_nome ?? "-"}`);
  addWrapped(lines, `E-mail: ${unidade.responsavel_email ?? "-"} | Telefone: ${unidade.responsavel_telefone ?? "-"}`);

  section(lines, "Resumo");
  addWrapped(lines, `Acordos selecionados: ${acordos.length} | Valor acordado: ${formatCurrency(valorAcordos)} | Cobranças da unidade: ${formatCurrency(valorCobrancas)}`);
  addWrapped(lines, "Documento unico para encaminhamento: consolida dados da unidade, acordo(s), parcelas, cobrancas e timeline operacional.");

  section(lines, "Acordos");
  for (const acordo of acordos.slice(0, 4)) {
    addWrapped(
      lines,
      `Acordo ${acordo.id} | Data ${formatDateBR(acordo.data_acordo ?? acordo.created_at)} | Valor ${formatCurrency(Number(acordo.valor_acordado ?? 0))} | Parcelas ${acordo.quantidade_parcelas ?? "-"} | Status ${acordo.status ?? "-"} / ${acordo.fluxo_status ?? "-"}`,
      8,
    );
  }

  section(lines, "Parcelas do acordo");
  const parcelas = group.parcelas ?? [];
  if (parcelas.length === 0) {
    addWrapped(lines, "Nenhuma parcela localizada para os acordos selecionados.");
  } else {
    for (const parcela of parcelas.slice(0, 10)) {
      addWrapped(lines, `#${parcela.numero_parcela ?? "-"} | Venc. ${formatDateBR(parcela.vencimento)} | Valor ${formatCurrency(Number(parcela.valor ?? 0))} | Status ${parcela.status ?? "-"} | Pago em ${formatDateBR(parcela.pago_em)}`);
    }
  }

  section(lines, "Cobrancas da unidade");
  const cobrancas = group.cobrancas ?? [];
  if (cobrancas.length === 0) {
    addWrapped(lines, "Nenhuma cobranca localizada para a unidade.");
  } else {
    for (const cobranca of cobrancas.slice(0, 10)) {
      const vinculo = group.cobrancaIdsVinculadas?.has(cobranca.id) ? "no acordo" : "fora do acordo";
      addWrapped(lines, `${formatDateBR(cobranca.vencimento)} | Comp. ${cobranca.competencia ?? "-"} | ${formatCurrency(Number(cobranca.valor_atualizado ?? cobranca.valor_original ?? 0))} | ${getCobrancaStatusOperacional(cobranca)} | ${vinculo}`);
    }
  }

  section(lines, "Timeline operacional");
  const timeline = group.timeline ?? [];
  if (timeline.length === 0) {
    addWrapped(lines, "Nenhum evento operacional localizado para o pacote.");
  } else {
    for (const evento of timeline.slice(0, 10)) {
      addWrapped(lines, `${formatDateBR(evento.ocorreu_em ?? evento.created_at)} | ${evento.titulo ?? evento.evento_tipo ?? "Evento"} - ${evento.descricao ?? ""}`);
    }
  }

  lines.push(line("", 5));
  addWrapped(lines, "Observacao: documento gerado automaticamente a partir dos registros operacionais do GKLI Cobranca.", 7);

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

    const groups = await carregarDados(ids);
    if (groups.length === 0) {
      return NextResponse.json({ ok: false, error: "Nenhum acordo encontrado para gerar o PDF." }, { status: 404 });
    }

    const pages = groups.map((group, index) => montarPagina(group, index, groups.length));
    const pdf = buildPdf(pages);

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="pacote-pre-juridico-${new Date().toISOString().slice(0, 10)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar PDF pré-jurídico.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

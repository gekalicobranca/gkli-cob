import { formatCurrency } from '@/utils/formatters/currency';
import type { CondominioAgenteStatus } from '@/features/agente-automatico/queries';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const NAVY = "064258";
const NAVY_DARK = "043246";
const TEAL = "007EA7";
const SOFT = "F6F9FC";
const LINE = "D9E3EF";
const INK = "14213D";
const MUTED = "5E718D";
const GREEN = "12A87A";
const WHITE = "FFFFFF";

type PdfPage = {
  kind: "cover" | "main";
  ops: string[];
};

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

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return `${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}`;
}

function fill(hex: string) {
  return `${hexToRgb(hex)} rg`;
}

function stroke(hex: string) {
  return `${hexToRgb(hex)} RG`;
}

function rect(ops: string[], x: number, y: number, w: number, h: number, color = WHITE, strokeColor?: string) {
  ops.push("q");
  ops.push(fill(color));
  if (strokeColor) ops.push(stroke(strokeColor));
  ops.push(`${x} ${y} ${w} ${h} re ${strokeColor ? "B" : "f"}`);
  ops.push("Q");
}

function circle(ops: string[], cx: number, cy: number, r: number, color: string) {
  const c = r * 0.5522847498;
  ops.push("q");
  ops.push(fill(color));
  ops.push(`${cx + r} ${cy} m`);
  ops.push(`${cx + r} ${cy + c} ${cx + c} ${cy + r} ${cx} ${cy + r} c`);
  ops.push(`${cx - c} ${cy + r} ${cx - r} ${cy + c} ${cx - r} ${cy} c`);
  ops.push(`${cx - r} ${cy - c} ${cx - c} ${cy - r} ${cx} ${cy - r} c`);
  ops.push(`${cx + c} ${cy - r} ${cx + r} ${cy - c} ${cx + r} ${cy} c f`);
  ops.push("Q");
}

// Standard Type 1 font widths, indexed by WinAnsi character code minus 32.
const HELVETICA_WIDTHS = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,761,222,556,333,1000,556,556,333,1000,667,333,1000,761,611,761,761,222,222,333,333,350,556,1000,333,1000,500,333,944,761,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
const HELVETICA_BOLD_WIDTHS = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,761,278,556,500,1000,556,556,333,1000,667,333,1000,761,611,761,761,278,278,500,500,350,556,1000,333,1000,556,333,944,761,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];
function textWidth(value: string, size: number, bold = false) {
  const widths = bold ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
  return Array.from(text(value)).reduce((sum, char) => sum + (widths[char.charCodeAt(0) - 32] ?? 1000), 0) * size / 1000;
}

function drawText(
  ops: string[],
  value: string,
  x: number,
  y: number,
  options: { size?: number; bold?: boolean; color?: string; align?: "left" | "right" | "center" } = {},
) {
  const size = options.size ?? 9;
  const font = options.bold ? "F2" : "F1";
  const content = text(value);
  const approxWidth = textWidth(content, size, options.bold);
  const tx = options.align === "right" ? x - approxWidth : options.align === "center" ? x - approxWidth / 2 : x;
  ops.push(`BT /${font} ${size} Tf ${hexToRgb(options.color ?? INK)} rg ${tx.toFixed(2)} ${y.toFixed(2)} Td (${escapePdf(content)}) Tj ET`);
}

function addPage(pages: PdfPage[], kind: PdfPage["kind"] = "main") {
  const page: PdfPage = { kind, ops: [] };
  pages.push(page);
  return page;
}

function drawMainChrome(page: PdfPage, pageNumber: number, totalPages: number) {
  const ops = page.ops;
  rect(ops, 0, PAGE_HEIGHT - 40, PAGE_WIDTH, 40, NAVY);
  drawText(ops, "CADASTRO DE CONDOMÍNIOS", MARGIN_X, PAGE_HEIGHT - 25, { size: 8, bold: true, color: "BFE8F4" });
  drawText(ops, "Dados cadastrais e parâmetros de cobrança", PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - 25, {
    size: 7,
    color: "D6EDF5",
    align: "right",
  });
  ops.push(`${hexToRgb(LINE)} RG 0.6 w ${MARGIN_X} 28 m ${PAGE_WIDTH - MARGIN_X} 28 l S`);
  drawText(ops, "GKLI Cobrança", MARGIN_X, 16, { size: 7, color: MUTED });
  drawText(ops, `Página ${pageNumber} de ${totalPages}`, PAGE_WIDTH - MARGIN_X, 16, { size: 7, color: MUTED, align: "right" });
}

function buildPdf(pages: PdfPage[]) {
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

  const totalPages = pages.length;
  pages.forEach((page, index) => {
    if (page.kind === "main") drawMainChrome(page, index + 1, totalPages);
  });

  const pageRefs: number[] = [];
  const fontRegular = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontBold = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  for (const page of pages) {
    const content = Buffer.from(page.ops.join("\n"), "latin1");
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


export type CondominioRelatorio = {
  agente_remoto_status?: CondominioAgenteStatus;
  id: string;
  carteira_id?: string | null;
  carteiras?: { nome?: string | null } | null;
  [key: string]: unknown;
};

function display(value: unknown) {
  return value === null || value === undefined || value === '' ? 'Não informado' : String(value);
}
function flag(value: unknown) {
  return value === null || value === undefined ? 'Não informado' : value ? 'Sim' : 'Não';
}
function quantity(value: unknown, suffix: string) {
  return value === null || value === undefined || value === '' ? 'Não informado' : `${value} ${suffix}`;
}
function money(value: unknown) {
  return value === null || value === undefined || value === '' ? 'Não informado' : formatCurrency(Number(value));
}
function month(value: unknown) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})/);
  return match ? `${match[2]}/${match[1]}` : 'Não informado';
}

// Wrap at measured font widths; split long tokens without dropping any text.
function linesFor(value: unknown, width: number, size = 8) {
  const result: string[] = [];
  for (const paragraph of text(value).split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && textWidth(line + ' ' + word, size, true) > width) {
        result.push(line);
        line = '';
      }
      for (const char of (line ? ' ' : '') + word) {
        if (line && textWidth(line + char, size, true) > width) {
          result.push(line);
          line = '';
        }
        line += char;
      }
    }
    result.push(line);
  }
  return result.length ? result : [''];
}

export function montarRelatorioCondominios(
  rows: CondominioRelatorio[],
  reguas: Map<string, string> = new Map(),
  filters: string[] = [],
  generatedAt = new Date(),
) {
  const pages: PdfPage[] = [];
  const cover = addPage(pages, 'cover');
  rect(cover.ops, 0, 0, PAGE_WIDTH, PAGE_HEIGHT, SOFT);
  rect(cover.ops, 0, 512, PAGE_WIDTH, 330, NAVY);
  rect(cover.ops, 0, 512, PAGE_WIDTH, 40, NAVY_DARK);
  circle(cover.ops, 510, 765, 42, '2D6173');
  drawText(cover.ops, 'GKLI COBRANÇA', MARGIN_X, 774, { size: 9, bold: true, color: 'BFE8F4' });
  drawText(cover.ops, 'Relatório executivo', MARGIN_X, 711, { size: 28, bold: true, color: WHITE });
  drawText(cover.ops, 'Cadastro de condomínios', MARGIN_X, 674, { size: 25, bold: true, color: WHITE });
  drawText(cover.ops, 'Informações cadastrais e parâmetros de cobrança', MARGIN_X, 637, { size: 11, color: 'D6EDF5' });
  const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(generatedAt);
  drawText(cover.ops, `Gerado em ${date} (São Paulo)`, MARGIN_X, 605, { size: 9, color: 'D6EDF5' });
  const portfolios = new Map<string, { nome: string; rows: CondominioRelatorio[] }>();
  for (const row of rows) {
    const key = row.carteira_id ?? 'sem-carteira';
    const portfolio = portfolios.get(key) ?? { nome: row.carteiras?.nome || 'Sem carteira', rows: [] };
    portfolio.rows.push(row);
    portfolios.set(key, portfolio);
  }
  const kpis = [
    ['Condomínios', rows.length, 'cadastros no recorte'],
    ['Ativos', rows.filter(row => row.status === 'ativo').length, 'com status ativo'],
    ['Carteiras', new Set(rows.map(row => row.carteira_id).filter(Boolean)).size, 'carteiras representadas'],
    ['Administradoras', new Set(rows.map(row => String(row.administradora ?? '').trim().toLocaleUpperCase('pt-BR')).filter(Boolean)).size, 'administradoras informadas'],
  ] as const;
  for (const [i, [label, value, note]] of kpis.entries()) {
    const x = MARGIN_X + (i % 2) * 264;
    const y = 388 - Math.floor(i / 2) * 100;
    rect(cover.ops, x, y, 247, 82, WHITE, LINE);
    rect(cover.ops, x, y, 3, 82, i % 2 ? GREEN : TEAL);
    drawText(cover.ops, label.toUpperCase(), x + 13, y + 62, { size: 8, color: MUTED });
    drawText(cover.ops, value.toLocaleString('pt-BR'), x + 13, y + 32, { size: 23, bold: true });
    drawText(cover.ops, note, x + 13, y + 13, { size: 8, color: MUTED });
  }
  drawText(cover.ops, 'Resumo por carteira e fichas individuais dos condomínios.', MARGIN_X, 240, { size: 9, color: MUTED });
  drawText(cover.ops, 'Abrange todos os resultados dos filtros, além da página exibida na tela.', MARGIN_X, 222, { size: 9, color: MUTED });
  drawText(cover.ops, 'Acesso limitado às carteiras permitidas ao usuário.', MARGIN_X, 204, { size: 9, color: MUTED });

  let page = addPage(pages);
  let y = 766;
  let context = 'Resumo executivo';
  function ensure(needed: number) {
    if (y - needed >= 52) return;
    page = addPage(pages);
    y = 766;
    for (const line of linesFor(`${context} - continuação`, CONTENT_WIDTH, 10)) {
      drawText(page.ops, line, MARGIN_X, y, { size: 10, bold: true });
      y -= 13;
    }
    y -= 10;
  }
  function paragraph(value: string, size = 9, color = MUTED) {
    const lineHeight = Math.max(14, size * 1.3);
    for (const line of linesFor(value, CONTENT_WIDTH, size)) {
      ensure(lineHeight);
      drawText(page.ops, line, MARGIN_X, y, { size, color });
      y -= lineHeight;
    }
  }
  function section(title: string, needed = 64) {
    ensure(needed);
    rect(page.ops, MARGIN_X, y - 20, CONTENT_WIDTH, 20, NAVY);
    drawText(page.ops, title, MARGIN_X + 9, y - 14, { size: 9, bold: true, color: WHITE });
    y -= 28;
  }
  function fields(items: [string, string][]) {
    for (let i = 0; i < items.length; i += 2) {
      const pair = items.slice(i, i + 2).map(([label, value]) => ({
        label: linesFor(label, 235, 7), value: linesFor(value, 235, 8),
      }));
      const labelCount = Math.max(...pair.map(item => item.label.length));
      const valueCount = Math.max(...pair.map(item => item.value.length));
      for (let offset = 0; offset < valueCount;) {
        ensure(labelCount * 9 + 22);
        const count = Math.min(valueCount - offset, Math.floor((y - 52 - labelCount * 9 - 8) / 10));
        const height = labelCount * 9 + count * 10 + 8;
        rect(page.ops, MARGIN_X, y - height, CONTENT_WIDTH, height, SOFT);
        pair.forEach((item, column) => {
          const x = MARGIN_X + 8 + column * 256;
          item.label.forEach((line, j) => drawText(page.ops, line, x, y - 9 - j * 9, { size: 7, color: MUTED }));
          item.value.slice(offset, offset + count).forEach((line, j) => drawText(page.ops, line, x, y - labelCount * 9 - 12 - j * 10, { size: 8 }));
        });
        y -= height + 3;
        offset += count;
      }
    }
    y -= 4;
  }
  drawText(page.ops, 'Resumo executivo', MARGIN_X, y, { size: 19, bold: true });
  y -= 25;
  paragraph('Filtros aplicados: ' + (filters.length ? filters.join(' | ') : 'Todos os condomínios permitidos'));
  y -= 10;
  section('Visão por carteira');
  if (!rows.length) paragraph('Nenhum condomínio encontrado para os filtros selecionados.');
  for (const portfolio of [...portfolios.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))) {
    const cotas = portfolio.rows.map(row => row.valor_cota_condominial).filter(value => value !== null && value !== undefined && value !== '').map(Number).filter(Number.isFinite);
    fields([
      ['Carteira', portfolio.nome],
      ['Condomínios / ativos', `${portfolio.rows.length} / ${portfolio.rows.filter(row => row.status === 'ativo').length}`],
      ['Cota média cadastrada', cotas.length ? formatCurrency(cotas.reduce((a, b) => a + b, 0) / cotas.length) : 'Não informado'],
      ['Pré-jurídico / operação virtual habilitados', `${portfolio.rows.filter(row => row.pre_juridico_habilitado).length} / ${portfolio.rows.filter(row => row.operacao_virtual_habilitada).length}`],
    ]);
  }
  paragraph('Cota média calculada apenas sobre valores informados. Campos ausentes são indicados nas fichas; zero é preservado.');
  paragraph('Réguas sem vínculo específico usam o padrão da carteira ou fallback do sistema.');
  paragraph('Agente remoto configurado: receita ativa vinculada ao condomínio, com roteiro definido e administradora ativa.');

  const reguaName = (id: unknown) => id ? reguas.get(String(id)) || 'Vinculada; nome indisponível' : 'Padrão da carteira / fallback do sistema';
  for (const row of rows) {
    context = display(row.nome_operacional || row.nome);
    page = addPage(pages);
    y = 764;
    paragraph(context, 16, INK);
    y -= 5;
    section('Informações cadastrais');
    const address = [row.endereco_logradouro, row.endereco_numero, row.endereco_complemento, row.endereco_bairro, [row.endereco_cidade, row.endereco_uf].filter(Boolean).join('/'), row.endereco_cep ? `CEP ${row.endereco_cep}` : null].filter(Boolean).join(', ');
    fields([
      ['Nome oficial', display(row.nome)], ['Nome operacional', display(row.nome_operacional)],
      ['CNPJ', display(row.cnpj)], ['Status / classificação operacional', `${display(row.status)} / ${display(row.classificacao_operacional)}`],
      ['Carteira', display(row.carteiras?.nome)], ['Administradora', display(row.administradora)],
      ['Endereço completo', display(address)], ['Data do cadastro', row.created_at ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(String(row.created_at))) : 'Não informado'],
    ]);
    section('Contatos');
    fields([
      ['E-mail do síndico', display(row.sindico_email)], ['Celular do síndico', display(row.sindico_celular)],
      ['E-mail do gerente', display(row.gerente_email)], ['Celular do gerente', display(row.gerente_celular)],
    ]);
    section('Parâmetros de cobrança e acordos');
    fields([
      ['Dia de vencimento da cota', display(row.vencimento_cota_dia)], ['Valor médio da cota', money(row.valor_cota_condominial)],
      ['Início da cobrança após vencimento', quantity(row.inicio_cobranca_dias, 'dias')], ['Prazo de cobrança ativa', quantity(row.dias_cobranca_ativa, 'dias')],
      ['Pré-jurídico habilitado', flag(row.pre_juridico_habilitado)], ['Expiração da régua pré-jurídica', quantity(row.dias_expiracao_regua_pre_juridico, 'dias')],
      ['Parcelas sem aprovação do síndico', display(row.parcelas_acordo_sem_aprovacao_sindico)], ['Reemissão de parcela em atraso', Number(row.dias_reemissao_parcela_acordo_atrasada) === 0 && row.dias_reemissao_parcela_acordo_atrasada != null ? 'Não permitida (0 dias)' : quantity(row.dias_reemissao_parcela_acordo_atrasada, 'dias')],
    ]);
    section('Réguas vinculadas');
    fields([
      ['Cobrança', reguaName(row.regua_cobranca_id)], ['Acordos', reguaName(row.regua_acordo_id)],
      ['Pré-jurídico', reguaName(row.regua_pre_juridico_id)],
    ]);
    section('Automação e bloqueios');
    fields([
      ['Operação virtual habilitada', flag(row.operacao_virtual_habilitada)], ['Captação automática habilitada', flag(row.captacao_automatica_habilitada)],
      ['Agenda mensal da captação (São Paulo)', row.captacao_dia_mes || row.captacao_horario ? `Dia ${display(row.captacao_dia_mes)} - ${display(row.captacao_horario ? String(row.captacao_horario).slice(0, 5) : null)}` : 'Não informado'], ['Bloqueio garantidora habilitado', flag(row.bloqueio_garantidora_habilitado)],
      ['Competências do bloqueio garantidora', row.bloqueio_garantidora_inicio || row.bloqueio_garantidora_fim ? `${month(row.bloqueio_garantidora_inicio)} a ${month(row.bloqueio_garantidora_fim)}` : 'Não informado'],
      ['Receita de agente remoto configurada', row.agente_remoto_status === 'configurado' ? 'Sim' : row.agente_remoto_status === 'nao_configurado' ? 'Não' : row.agente_remoto_status === 'indisponivel' ? 'Não foi possível verificar' : 'Não informado'],
    ]);
    if (row.observacoes) {
      section('Observações', 42);
      paragraph(String(row.observacoes), 8, INK);
    }
  }
  return buildPdf(pages);
}

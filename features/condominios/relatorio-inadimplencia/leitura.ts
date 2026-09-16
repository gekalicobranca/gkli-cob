import * as XLSX from 'xlsx'
import { AnaliseInadimplencia, ContextoRelatorio, ItemRelatorio, ProcessoRelatorio, ReciboRelatorio, dataIso, natureza, normalizar, somarValores } from './modelo'

export function linhasPlanilha(buffer: Buffer): Record<string, string>[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellText: true, sheetRows: 200001 })
  const sheet = wb.Sheets[wb.SheetNames[0]]; const rows = new Map<number, Record<string, string>>()
  // Algumas exportações Hubert declaram !ref=A1 apesar de conterem milhares de células.
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith('!')) continue
    const pos = XLSX.utils.decode_cell(address)
    if (pos.r > 200000) throw new Error('Planilha excede o limite de 200 mil linhas.')
    const row = rows.get(pos.r) ?? { linha: String(pos.r + 1) }
    row[XLSX.utils.encode_col(pos.c)] = String((cell as XLSX.CellObject).w ?? (cell as XLSX.CellObject).v ?? '').replace(/\s+/g, ' ').trim()
    rows.set(pos.r, row)
  }
  return [...rows].sort(([a], [b]) => a - b).map(([, r]) => r)
}
function centavos(s: string): number {
  if (!String(s ?? '').trim()) throw new Error('Valor financeiro ausente na origem.')
  const v = String(s).replace(/R\$|\s/g, '')
  const n = Number(v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v)
  if (!Number.isFinite(n)) throw new Error('Valor financeiro inválido na origem.')
  return Math.round(n * 100)
}
function base(arquivo: string, data?: string) {
  const extraida = arquivo.match(/\d{4}-\d{2}-\d{2}/)?.[0]
  const dataBase = dataIso(data) ?? dataIso(extraida) ?? new Date().toISOString().slice(0, 10)
  return { versao: 1 as const, arquivo, dataBase, dataBaseInferida: !dataIso(data) && !dataIso(extraida), qualidade: 'completa' as const, recibos: [] as ReciboRelatorio[], itens: [] as ItemRelatorio[], observacoes: [] as string[] }
}
function conferir(a: AnaliseInadimplencia) {
  const totals = somarValores(a.recibos)
  for (const k of ['principal', 'multa', 'correcaoJuros', 'total'] as const) if (a.totais[k] !== totals[k]) throw new Error(`A soma de ${k} não confere com o resumo do arquivo.`)
  for (const r of a.recibos) if (r.principal !== null && r.multa !== null && r.correcaoJuros !== null && r.principal + r.multa + r.correcaoJuros !== r.total) throw new Error(`A composição do recibo ${r.id} não confere.`)
  return a
}
function htmlText(v: string) {
  return v.replace(/<[^>]*>/g, ' ').replace(/&#(x[0-9a-f]+|\d+);/gi, (_, c) => String.fromCodePoint(c[0].toLowerCase() === 'x' ? parseInt(c.slice(1), 16) : Number(c)))
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/\s+/g, ' ').trim()
}
/** Retorna null apenas para formatos não suportados; inconsistências de formatos reconhecidos falham explicitamente. */
export function lerAnaliseOriginal(buffer: Buffer, arquivo: string, data?: string): AnaliseInadimplencia | null {
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b
  const raw = isZip ? '' : new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  if (!isZip && /Total Recibo/i.test(raw) && /Total Unidade/i.test(raw)) {
    const text = raw.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(buffer) : raw
    const rows = [...text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => [...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => htmlText(c[1])))
    const a: AnaliseInadimplencia = { ...base(arquivo, data), condominioFonte: '', encargosPorNatureza: true, totais: { principal: null, multa: null, correcaoJuros: null, total: 0 } }
    let bloco = '', unidade = '', responsavel = '', atual: ReciboRelatorio | null = null, somaItens = 0, somaUnidade = 0, unidadeConferida = true, resumo = false
    const vistos = new Set<string>()
    for (const r of rows) {
      if (r[0]?.startsWith('Condomínio:')) a.condominioFonte = r[0].slice(11).trim()
      const u = r[0]?.match(/^Bloco:\s*(.*?)\s+Unidade:\s*(\S+)(?:\s+(.*))?$/i)
      if (u) {
        if (atual || !unidadeConferida) throw new Error('Recibo ou total da unidade ausente na exportação.')
        bloco = u[1]; unidade = u[2]; responsavel = u[3] ?? ''; somaUnidade = 0; unidadeConferida = false
      }
      if (r.length === 8 && /^(?:[A-Z]+\s+)?\d+$/i.test(r[0])) {
        const vencimento = dataIso(r[1]), id = `${bloco}::${unidade}::${r[0]}`
        if (!unidade || !vencimento) throw new Error('Recibo sem unidade ou vencimento válido.')
        if (!atual) {
          if (vistos.has(id)) throw new Error('Recibo duplicado na exportação.')
          vistos.add(id); somaItens = 0
          atual = { id, bloco, unidade, responsavel, vencimento, principal: null, multa: null, correcaoJuros: null, total: 0 }
        }
        if (atual.id !== id || atual.vencimento !== vencimento) throw new Error('Total do recibo ausente ou vencimento divergente.')
        const valor = centavos(r[5]); somaItens += valor
        a.itens.push({ reciboId: id, conta: r[3], historico: r[4], natureza: /^RATEIO MENSAL\b/.test(normalizar(r[4])) ? 'Taxa condominial' : natureza(r[4]), principal: null, total: valor })
        if (r[6]) {
          atual.total = centavos(r[6])
          if (somaItens !== atual.total) throw new Error(`Itens não conferem com o total do recibo ${id}.`)
          somaUnidade += atual.total; a.recibos.push(atual); atual = null
        }
        if (r[7]) {
          if (atual || somaUnidade !== centavos(r[7])) throw new Error('Total da unidade não confere com os recibos.')
          unidadeConferida = true
        }
      }
      if (r.some(c => /^Total do condomínio\b/i.test(c))) { a.totais.total = centavos(r.at(-1)!); resumo = true }
    }
    if (atual || !unidadeConferida || !resumo || !a.recibos.length) throw new Error('Exportação incompleta: faltam recibos ou totais.')
    a.observacoes.push('Valores e vencimentos lidos por recibo, preservando bloco e unidade. A origem não discrimina principal, multa e juros; esses componentes não foram presumidos como zero.')
    return conferir(a)
  }
  if (!isZip && raw.includes('Total do Recibo:')) {
    const text = raw.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(buffer) : raw
    const rows = [...text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => [...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => htmlText(c[1])))
    const a: AnaliseInadimplencia = { ...base(arquivo, data), condominioFonte: '', encargosPorNatureza: true, totais: { principal: 0, multa: 0, correcaoJuros: 0, total: 0 } }
    let bloco = '', unidade = '', responsavel = '', vencimento: string | null = null, id = ''; let resumo = false
    for (const [i, r] of rows.entries()) {
      if (r[0]?.startsWith('Condomínio:')) a.condominioFonte = r[0].split(':').slice(1).join(':').trim()
      const u = r[0]?.match(/^Bloco: (.*?) Unidade: (\S+)(?: (.*))?$/)
      if (u) { bloco = u[1].toUpperCase(); unidade = u[2]; responsavel = u[3] ?? '' }
      if (r.length === 12 && /\d/.test(r[0]) && r[5] === 'R$') {
        if (r[1]) { vencimento = dataIso(r[1]); id = `r${i + 1}` }
        if (!id || !unidade || !vencimento) throw new Error('Recibo sem unidade ou vencimento válido.')
        const v = r.slice(-6).map(centavos)
        a.itens.push({ reciboId: id, conta: r[3], historico: r[4], natureza: natureza(r[4]), principal: v[1], total: v[5] })
      } else if (r[0] === 'Total do Recibo:') {
        const v = r.slice(-6).map(centavos)
        a.recibos.push({ id, bloco, unidade, responsavel, vencimento, principal: v[1], multa: v[2], correcaoJuros: v[3] + v[4], total: v[5] })
      } else if (r[0]?.startsWith('Quantidade de unidade')) {
        const v = r.slice(-6).map(centavos); a.totais = { principal: v[1], multa: v[2], correcaoJuros: v[3] + v[4], total: v[5] }; resumo = true
      }
    }
    if (!resumo) throw new Error('Resumo financeiro ausente na exportação HTML.')
    if (a.itens.reduce((s, i) => s + (i.total ?? 0), 0) !== a.totais.total) throw new Error('Os detalhes não conferem com o total do condomínio.')
    return conferir(a)
  }
  if (!isZip) return null
  const wb = XLSX.read(buffer,{type:'buffer',cellText:true})
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (Object.values(sheet).some((c:any) => typeof c?.v === 'string' && c.v.startsWith('Condomínio:')) && sheet.A4?.v === 'Recibo') {
    const map = new Map<number, Record<string,string>>()
    for (const [address,cell] of Object.entries(sheet)) {
      if(address.startsWith('!')) continue
      const pos=XLSX.utils.decode_cell(address),r=map.get(pos.r)??{}
      r[XLSX.utils.encode_col(pos.c)]=String((cell as XLSX.CellObject).v??'').trim();map.set(pos.r,r)
    }
    const a:AnaliseInadimplencia={...base(arquivo,data),condominioFonte:'',encargosPorNatureza:true,totais:{principal:0,multa:0,correcaoJuros:0,total:0}}
    let bloco='',unidade='',responsavel='',id='',vencimento:string|null=null,resumo=false
    for(const [n,r] of [...map].sort(([a],[b])=>a-b)) {
      if(r.A?.startsWith('Condomínio:')) a.condominioFonte=r.A.slice(11).trim()
      const u=r.A?.match(/^Bloco (.*?) - Unidade (.*?)\s*:\s*(.*)$/)
      if(u){bloco=u[1];unidade=u[2];responsavel=u[3]}
      if(r.B && dataIso(r.B)){id=`r${n+1}`;vencimento=dataIso(r.B)}
      const vals=()=>({principal:centavos(r.H),multa:centavos(r.I),correcaoJuros:centavos(r.J)+centavos(r.K),total:centavos(r.L)})
      if(r.D && /^\d+$/.test(r.D) && r.E){
        if(!id||!unidade||!vencimento)throw new Error('Detalhe sem unidade/recibo/vencimento na planilha.')
        a.itens.push({reciboId:id,conta:r.D,historico:r.E,natureza:natureza(r.E,r.D,'condopro'),principal:centavos(r.H),total:centavos(r.L)})
      }else if(r.E==='Total do recibo:')a.recibos.push({id,bloco,unidade,responsavel,vencimento,...vals()})
      else if(r.F==='Total acumulado:'){a.totais=vals();resumo=true}
    }
    if(!resumo)throw new Error('Resumo acumulado ausente na planilha.')
    if(a.itens.reduce((s,i)=>s+(i.total??0),0)!==a.totais.total)throw new Error('Itens não conferem com total acumulado da planilha.')
    a.observacoes.push('Valores numéricos originais das células utilizados; formatos de exibição que ocultam números não foram tratados como ausência de valor.')
    return conferir(a)
  }
  let rows = linhasPlanilha(buffer)
  if (rows.some(r => r.F === 'Referência' && r.N)) rows = rows.map(r => Object.fromEntries(Object.entries(r).map(([k,v]) => [k === 'linha' ? k : XLSX.utils.encode_col(Math.max(0,XLSX.utils.decode_col(k)-1)),v])))
  if (!rows.some(r => r.C === 'Cotas Atrasadas' || r.B === 'Cotas Atrasadas') || !rows.some(r => /Hubert Condominios|Lello Condomínios/i.test(r.K ?? ''))) return null
  const a: AnaliseInadimplencia = { ...base(arquivo, data), condominioFonte: '', encargosPorNatureza: false, totais: { principal: 0, multa: 0, correcaoJuros: 0, total: 0 } }
  let unidade = '', responsavel = '', atual: ReciboRelatorio | null = null; let resumo = 0, semValor = 0
  const campos = { 'VALOR TOTAL ORIGINAL': 'principal', 'VALOR TOTAL MULTAS': 'multa', 'VALOR TOTAL CORREÇÕES/JUROS': 'correcaoJuros', 'VALOR TOTAL COM MULTA/CORREÇÕES/JUROS': 'total' } as const
  for (const r of rows) {
    if (r.E === 'Referência') a.condominioFonte = r.M
    if (r.E === 'Unidade') { unidade = r.K; responsavel = r.M }
    if (dataIso(r.I)) {
      if (!unidade) throw new Error('Recibo sem unidade.')
      atual = { id: `r${r.linha}`, bloco: '', unidade, responsavel, vencimento: dataIso(r.I), principal: centavos(r.O), multa: centavos(r.Q), correcaoJuros: centavos(r.R), total: centavos(r.V) }; a.recibos.push(atual)
    }
    if (/^\d+$/.test(r.J) && r.O) {
      if (!atual) throw new Error('Detalhe sem recibo correspondente.')
      if (!r.R) semValor++
      a.itens.push({ reciboId: atual.id, conta: r.J, historico: r.O, natureza: natureza(r.O, r.J, 'hubert'), principal: r.R ? centavos(r.R) : null, total: null })
    }
    if (r.B in campos) { a.totais[campos[r.B as keyof typeof campos]] = centavos(r.U); resumo++ }
  }
  if (resumo !== 4) throw new Error('Resumo financeiro Hubert incompleto.')
  for (const r of a.recibos) {
    const items = a.itens.filter(i => i.reciboId === r.id); const soma = items.reduce((s, i) => s + (i.principal ?? 0), 0)
    const descontos = items.filter(i => /\bDESCONTO\b/.test(normalizar(i.historico)) && (i.principal ?? 0) > 0)
    const abatimento = descontos.reduce((s, i) => s + i.principal!, 0)
    if (soma !== r.principal && descontos.length && soma - 2 * abatimento === r.principal) {
      for (const i of descontos) i.principal = -i.principal!
      a.observacoes.push(`Unidade ${r.unidade}, recibo ${r.id}: desconto explícito apresentado positivo foi tratado como abatimento, reconciliando com o principal do recibo.`)
    } else if (soma !== r.principal && soma < r.principal! && items.some(i=>i.principal===null)) {
      const diferenca=r.principal!-soma
      a.itens.push({reciboId:r.id,conta:'',historico:'Diferença entre principal do recibo e detalhes informados',natureza:'Natureza não discriminada',principal:diferenca,total:null})
      a.observacoes.push(`Recibo ${r.id}, unidade ${r.unidade}: R$ ${(diferenca/100).toFixed(2)} do principal não discriminados nos detalhes. Diferença aritmética apresentada separadamente, sem atribuir natureza ao campo vazio.`)
    } else if (soma !== r.principal) throw new Error(`Os detalhes do recibo ${r.id} não conferem com o principal.`)
  }
  if (semValor) a.observacoes.push(`${semValor} detalhes sem valor informado; não foram convertidos em zero. Detalhes conhecidos e eventuais diferenças não discriminadas reconciliam com o principal.`)
  a.observacoes.push('Encargos disponíveis somente por recibo. A separação por natureza apresenta principal, sem rateio de multa, correção ou juros.', 'Conta Hubert 1002: os históricos CONDOMINIO, COTA e C. foram classificados como taxa condominial; fundos, consumos, IPTU e obras permanecem separados.')
  return conferir(a)
}
export function analiseResumida(ranking: any, arquivo: string): AnaliseInadimplencia {
  const recibos: ReciboRelatorio[] = (ranking?.unidades ?? []).map((r: any, i: number) => ({ id: `resumo${i}`, bloco: String(r.bloco ?? ''), unidade: String(r.unidade ?? ''), responsavel: String(r.responsavel ?? ''), vencimento: null,
    principal: r.valorPrincipal == null ? null : Math.round(r.valorPrincipal * 100), multa: r.multa == null ? null : Math.round(r.multa * 100), correcaoJuros: r.correcao == null || r.juros == null ? null : Math.round((r.correcao + r.juros) * 100), total: Math.round(Number(r.valor ?? 0) * 100) }))
  return { ...base(arquivo), qualidade: 'resumida', condominioFonte: ranking?.condominio ?? '', recibos, itens: [], totais: somarValores(recibos), encargosPorNatureza: false, observacoes: ['Este ranking antigo conserva apenas totais por unidade. Anexe o relatório original para separar naturezas e calcular valores acima de 60 dias e 5 anos. Não foi atribuído o saldo inteiro ao vencimento mais antigo.'] }
}
export function lerProcessos(buffer: Buffer, arquivo: string, cnpj: string): ProcessoRelatorio[] {
  const rows = linhasPlanilha(buffer)
  const header = rows.find(r => Object.values(r).some(v => normalizar(v) === 'PROCESSO') && Object.values(r).some(v => normalizar(v) === 'ESCRITORIO RESPONSAVEL'))
  if (!header) throw new Error('Use a planilha de processos com as colunas Processo, CNPJ, Parte contrária e Escritório responsável.')
  const col = (...nomes: string[]) => Object.entries(header).find(([, v]) => nomes.includes(normalizar(v)))?.[0]
  const mapping: Record<string, string | undefined> = { B: col('CNPJ'), C: col('PROCESSO'), G: col('CLASSE'), H: col('ASSUNTO'), I: col('SITUACAO'), L: col('POLO DO CONDOMINIO', 'POLO'), M: col('PARTE CONTRARIA IDENTIFICADA', 'PARTE CONTRARIA'), N: col('UNIDADE IDENTIFICADA', 'UNIDADE'), O: col('ADVOGADO DO CONDOMINIO', 'ADVOGADO'), P: col('ESCRITORIO RESPONSAVEL'), Q: col('FONTE PRINCIPAL'), S: col('OBSERVACOES') }
  const result: ProcessoRelatorio[] = []
  for (const original of rows) {
    const r: Record<string, string> = { linha: original.linha }
    for (const [target, source] of Object.entries(mapping)) r[target] = source ? original[source] ?? '' : ''
    const publicacao = col('ULTIMA PUBLICACAO'), adicional = col('FONTE ADICIONAL')
    r.S = [r.S, publicacao && original[publicacao] ? `Última publicação informada: ${original[publicacao]}.` : '', adicional && original[adicional] ? `Fonte adicional: ${original[adicional]}` : ''].filter(Boolean).join(' ')
    if (!/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(r.C ?? '')) continue
    if (!cnpj || r.B?.replace(/\D/g, '') !== cnpj.replace(/\D/g, '')) throw new Error('A planilha contém processo de outro CNPJ ou CNPJ ausente. Separe os registros deste condomínio.')
    const polo = normalizar(r.L); const propria = /EXEQUENTE|AUTOR|REQUERENTE/.test(polo) && /EXECUCAO|CUMPRIMENTO|COBRANCA|DESPESAS CONDOMINIAIS/.test(normalizar(`${r.G} ${r.H}`))
    const unidadeFonte = normalizar(r.N)
    const explicita = unidadeFonte.match(/^(\d+)\s+([A-Z]|BUSS)$/) ?? unidadeFonte.match(/^SALA\s+(\d+)\b.*?\bTORRE\s+([A-Z])\b/)
    result.push({ numero: r.C, parte: r.M ?? '', unidade: explicita?.[1] ?? r.N ?? '', bloco: explicita?.[2], unidadeConfirmada: Boolean(explicita), classe: r.G ?? '', assunto: r.H ?? '', polo: r.L ?? '', situacao: r.I ?? '', advogado: r.O ?? '', escritorio: r.P ?? '', fonte: r.Q ?? '', observacoes: [explicita ? `Unidade descrita na fonte: ${r.N}.` : '', r.S].filter(Boolean).join(' '), origem: `${arquivo}, linha ${r.linha}`, cobrancaPropria: propria })
  }
  if (!result.length) throw new Error('Nenhum processo numerado encontrado na planilha.')
  return result
}
export function lerPreJuridico(buffer: Buffer, arquivo: string, cnpj: string): NonNullable<ContextoRelatorio['preJuridico']> {
  const rows = linhasPlanilha(buffer)
  if (!rows.some(r => normalizar(r.G) === 'CONDOMINIO' && normalizar(r.H) === 'UNIDADE')) throw new Error('Formato do controle pré-jurídico não reconhecido.')
  return rows.filter(r => r.H && cnpj && r.F?.replace(/\D/g, '') === cnpj.replace(/\D/g, '') && !/CANCELAD/.test(normalizar(r.O))).map(r => ({ bloco: r.I === '0' ? '' : r.I ?? '', unidade: r.H, responsavel: r.B ?? '', situacao: [r.L, r.M, r.N, r.O].filter(Boolean).join('; '), origem: `${arquivo}, linha ${r.linha}` }))
}

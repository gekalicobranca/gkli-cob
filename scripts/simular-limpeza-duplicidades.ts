import { createHash } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { identidadeRecibo, competenciaNormalizada } from '../features/importacoes/identidade-recibo'

// Deliberadamente sem cliente de banco, credenciais ou modo aplicar.
const [manifestPath, snapshotPath, evidencePath, outputDir, ...extra] = process.argv.slice(2)
if (!outputDir || extra.length) throw new Error('Uso: tsx scripts/simular-limpeza-duplicidades.ts manifesto.json snapshot.json evidencias.json pasta-saida')
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const read = (path: string) => readFileSync(resolve(path), 'utf8').replace(/^\uFEFF/, '')
const manifestText = read(manifestPath)
const snapshotText = read(snapshotPath)
const evidenceText = read(evidencePath)
const manifest = JSON.parse(manifestText)
const snapshot = JSON.parse(snapshotText)
if (manifest.tipo !== 'plano_preliminar_nao_executavel' || manifest.versao !== 2) throw new Error('Formato de manifesto não suportado.')
if (manifest.evidencias_sha256 !== hash(evidenceText)) throw new Error('Hash das evidências diverge do manifesto.')
if (manifest.snapshot_em !== snapshot.capturedAt) throw new Error('Snapshot não corresponde ao manifesto.')
const charges = new Map<string, any>(snapshot.cobrancas.map((row: any) => [row.id, row]))
const portfolios = new Map<string, string>(snapshot.carteiras.map((row: any) => [row.id, row.nome]))
const cents = (value: unknown) => {
  const numeric = Number(value)
  if (value == null || !Number.isFinite(numeric)) throw new Error('Valor ausente ou inválido no snapshot.')
  return Math.round(numeric * 100)
}
const seen = new Set<string>()
const groups = manifest.grupos.map((group: any) => {
  const records: any[] = group.candidatos
  if (records.length < 2) throw new Error('Grupo sem repetição.')
  const full = records.map(record => {
    if (seen.has(record.id)) throw new Error('Registro aparece em mais de um grupo.')
    seen.add(record.id)
    const row = charges.get(record.id)
    if (!row) throw new Error(`Registro ${record.id} não encontrado no snapshot.`)
    for (const key of ['status', 'status_operacional', 'status_financeiro', 'competencia', 'automacao_bloqueada', 'created_at']) {
      if (record[key] !== row[key]) throw new Error(`Divergência entre manifesto e snapshot: ${record.id}/${key}`)
    }
    if (cents(row.valor_atualizado ?? row.valor_original) !== group.valor_por_registro_centavos || cents(row.valor_original) !== cents(record.valor_original)) throw new Error('Valores divergentes do manifesto.')
    if (identidadeRecibo(row)?.recibo !== group.recibo || row.vencimento !== group.vencimento) throw new Error('Identidade divergente do manifesto.')
    return row
  })
  if (new Set(full.map(row => `${row.carteira_id}|${row.condominio_id}|${row.unidade_id}`)).size !== 1) throw new Error('Identidade de unidade/carteira ambígua.')
  const impact = (records.filter(row => row.fila).length - 1) * group.valor_por_registro_centavos
  if (impact !== group.impacto_potencial_fila_centavos) throw new Error('Impacto inconsistente com o manifesto.')
  const blockers = ['Revalidar dados em produção, inventário completo de dependências e janela sem envios em trânsito.']
  const formal = records.filter(row => ['acordos', 'acordo_cobrancas', 'fechamento_pagamentos'].some(key => row.links[key] > 0))
  const sent = records.filter(row => row.sentMessages > 0)
  if (formal.length) blockers.push('Conciliar instrumentos, parcelas e pagamentos antes de escolher o registro definitivo.')
  if (records.some(row => identidadeRecibo({ recibo: row.recibo })?.marcador)) blockers.push('Conferir marcador de jurídico/acordo com a origem.')
  if (group.cruzamento_bases_externas.length) blockers.push('Conferir referências nas três bases externas; não presumir quitação nem cobertura integral.')
  if (records.length > 2) blockers.push('Triplicidade exige decisão individual.')
  if (records.some(row => row.messages || row.links.lote_itens)) blockers.push('Reconciliar mensagens, agendas e itens de lote, incluindo os consolidados; preservar histórico.')
  if (new Set(records.map(row => competenciaNormalizada(row.competencia)).filter(Boolean)).size > 1) blockers.push('Competências conflitantes.')
  if (records.some(row => !row.fontes.length || row.fontes.some((source: any) => cents(source.valorPrincipal) !== cents(row.valor_original) || cents(source.valorTotal) !== cents(row.valor_atualizado)))) blockers.push('Revisar diferença entre fonte persistida e valor atual.')

  let suggested: any = null
  let reason = 'Sem preferência automática: depende de conciliar vínculos e situação.'
  if (formal.length === 1) { suggested = formal[0]; reason = 'Único registro com vínculo financeiro formal no inventário consultado; proposta depende da validação do instrumento.' }
  else if (!formal.length && sent.length === 1) { suggested = sent[0]; reason = 'Único registro com evidência de envio no inventário consultado; preservar continuidade e histórico, após revisar todas as agendas.' }
  else if (!formal.length && !sent.length && records.every(row => !row.messages && !Object.values(row.links).some(Boolean)) && blockers.length === 1) {
    suggested = [...records].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0]
    reason = 'Sem vínculos ou conflitos conhecidos, desempate por criação/ID; inventário completo ainda necessário.'
  }
  return {
    ...group, carteira_id: full[0].carteira_id, carteira: portfolios.get(full[0].carteira_id) ?? 'Sem carteira',
    estado: 'bloqueado_para_aplicacao', preservar_id: null, arquivar_ids: [], operacoes: [],
    proposta_condicional: { preservar_id: suggested?.id ?? null, arquivar_ids: suggested ? records.filter(row => row.id !== suggested.id).map(row => row.id) : [], justificativa: reason },
    bloqueios: blockers,
  }
})
const impact = groups.reduce((sum: number, group: any) => sum + group.impacto_potencial_fila_centavos, 0)
if (groups.length !== manifest.total_grupos || seen.size !== manifest.registros || impact !== manifest.impacto_potencial_centavos) throw new Error('Totais do manifesto não conferem.')
const totals = new Map<string, { grupos: number; excedentes: number; centavos: number }>()
for (const group of groups) {
  const item = totals.get(group.carteira) ?? { grupos: 0, excedentes: 0, centavos: 0 }
  item.grupos++; item.excedentes += group.candidatos.length - 1; item.centavos += group.impacto_potencial_fila_centavos
  totals.set(group.carteira, item)
}
const result = {
  tipo: 'simulacao_nao_executavel', gerada_em: new Date().toISOString(), snapshot_em: snapshot.capturedAt,
  manifesto_sha256: hash(manifestText), snapshot_sha256: hash(snapshotText), evidencias_sha256: hash(evidenceText),
  fontes_externas: manifest.bases_externas,
  resumo: { grupos: groups.length, registros: seen.size, propostas_condicionais: groups.filter((group: any) => group.proposta_condicional.preservar_id).length, grupos_liberados: 0, impacto_aplicado_centavos: 0, impacto_potencial_centavos: impact, por_carteira: Object.fromEntries(totals) },
  bloqueios_globais: ['Simulação sobre snapshot histórico; não comprova estado atual.', 'Arquivamento e consumidores ainda não implementados.', 'Nenhuma proposta condicional autoriza aplicação.'],
  grupos: groups,
}
const money = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const lines = [
  '# Simulação de limpeza — somente leitura', '',
  `Snapshot: ${result.snapshot_em}. Manifesto SHA-256: ${result.manifesto_sha256}.`, '',
  `${groups.length} grupos / ${seen.size} registros. Excesso potencial: ${money(impact)}. Nenhuma alteração executada.`, '',
  `${result.resumo.propostas_condicionais} propostas condicionais de registro a preservar. **Zero grupos liberados para aplicação.** As propostas priorizam vínculos formais e continuidade do histórico; dependem da revisão dos bloqueios de cada grupo.`, '',
  'O valor potencial não é redução autorizada nem saldo final disponível para cobrança. Todos os grupos exigem novo inventário em produção e conciliação de agendas. Nenhuma cobrança foi excluída, suspensa ou baixada.', '',
  '| Carteira | Grupos | Cópias excedentes | Repetição potencial |', '| --- | ---: | ---: | ---: |',
  ...Array.from(totals, ([name, item]) => `| ${name} | ${item.grupos} | ${item.excedentes} | ${money(item.centavos)} |`), '',
  ...groups.flatMap((group: any) => [
    `## ${group.condominio} — ${group.unidade} / bloco ${group.bloco}`, '',
    `Grupo ${group.grupo_id}; recibo ${group.recibo}; vencimento ${group.vencimento}; repetição potencial ${money(group.impacto_potencial_fila_centavos)}.`, '',
    `**Proposta condicional:** ${group.proposta_condicional.preservar_id ?? 'sem escolha'}. ${group.proposta_condicional.justificativa}`, '',
    ...group.candidatos.map((row: any) => `- [${row.id}](https://gkli-cob.vercel.app/app/cobrancas/${row.id}) — recibo ${row.recibo}; ${row.status_operacional}; mensagens ${row.messages}, com indicação de envio ${row.sentMessages}.`), '',
    '**Bloqueios:**', '', ...group.bloqueios.map((text: string) => `- ${text}`), '',
    ...group.cruzamento_bases_externas.flatMap((ref: any) => ref.fontes.map((source: any) => `- Fonte: ${source.arquivo}, aba ${source.sheet}, linha ${source.row}: ${source.classificacao}.`)), '',
  ]),
]
const out = resolve(outputDir)
if ([manifestPath, snapshotPath, evidencePath].some(path => [join(out, 'simulacao-limpeza.json'), join(out, 'simulacao-limpeza.md')].includes(resolve(path)))) throw new Error('Saída não pode sobrescrever uma entrada.')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'simulacao-limpeza.json'), JSON.stringify(result, null, 2) + '\n')
writeFileSync(join(out, 'simulacao-limpeza.md'), lines.join('\n') + '\n')
console.log(JSON.stringify(result.resumo, null, 2))

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { parseRelatorioBuffer } from '../../features/conversao-relatorio/server/parse-relatorio-buffer'
import { coletorManual } from '../../features/agente-automatico/executor-manual.mjs'
import { argumentosColetor } from './integracao.mjs'
import { interpretarTabela } from '../manager-acordos/relatorio.mjs'

const executar = promisify(execFile)

export function validarRelatorioEspelhamento(
  convertido: Awaited<ReturnType<typeof parseRelatorioBuffer>>,
  aplicar: boolean,
) {
  if (!convertido.ok || !convertido.preview.padraoDetectado) {
    throw Error('O arquivo não pôde ser validado integralmente pelo conversor do app.')
  }
  const { cobrancas, semPendencias, inconsistencias } = convertido.preview
  const avisoCotasAntigas = /^\d+ cota\(s\) com vencimento superior a 5 anos foram desprezadas\.$/
  const avisos = aplicar ? [] : inconsistencias.filter(mensagem => avisoCotasAntigas.test(mensagem))
  if ((!cobrancas.length && !semPendencias && !avisos.length) || inconsistencias.length !== avisos.length) {
    throw Error('O arquivo não pôde ser validado integralmente pelo conversor do app.')
  }
  return { cobrancas, avisos }
}

export async function captarCotasEspelhamento(db, job, receitas, signal) {
  const { data: cadastro, error: erroCadastro } = await db.from('condominios').select('cnpj').eq('id', job.condominio_id).eq('carteira_id', job.carteira_id).single()
  if (erroCadastro) throw Error('Cadastro do condomínio indisponível para a captação.')
  const cotas = [], fontes = [], avisos: string[] = []
  const pasta = await mkdtemp(path.join(os.tmpdir(), 'gkli-espelhamento-'))
  try {
    for (const receita of receitas) {
      signal.throwIfAborted()
      const { data: id, error } = await db.rpc('easy_espelhamento_captar_fonte', {
        p_espelhamento: job.id, p_tentativa: job.tentativas, p_receita: receita.receita_id,
      })
      if (error) throw Error('Não foi possível reservar a fonte de inadimplência do espelhamento.')
      let { data: execucao } = await db.from('agente_execucoes').select('status,origem,finalizado_em').eq('id', id).single()
      if (execucao?.origem !== 'espelhamento') throw Error('Execução de captação fora da origem do espelhamento.')
      if (execucao.status === 'pendente') {
        const arquivo = path.join('scripts', 'agente-automatico', coletorManual(receita.script_key))
        try {
          await executar(process.execPath, [arquivo], {
            windowsHide: true, signal, timeout: 7 * 60_000, maxBuffer: 1024 * 1024,
            env: { ...process.env, AGENTE_EXECUCAO_ID: id, AGENTE_ESPELHAMENTO: 'true', AGENTE_RUN_ONCE: 'true',
              AGENTE_SUPERVISIONADO: 'true', AGENTE_HEADLESS: 'true', AGENTE_DIAGNOSTICO_RECEITA: '', AGENTE_DOWNLOAD_DIR: pasta },
          })
        } catch {
          await db.from('agente_execucoes').update({ status: 'precisa_intervencao', finalizado_em: new Date().toISOString(),
            erro_mensagem: 'Coletor do espelhamento interrompido. O relatório requer nova coleta.' }).eq('id', id).eq('origem', 'espelhamento').in('status', ['pendente', 'em_execucao'])
        }
        ;({ data: execucao } = await db.from('agente_execucoes').select('status,origem,finalizado_em').eq('id', id).single())
      }
      if (execucao?.status !== 'sucesso' || !execucao.finalizado_em) throw Error('O agente remoto não concluiu a coleta de inadimplência.')
      const { data: arquivos, error: erroArquivos } = await db.from('agente_arquivos')
        .select('nome_arquivo,tipo_arquivo,storage_path,hash_arquivo').eq('execucao_id', id)
      if (!erroArquivos && !arquivos.length && receita.script_key === 'captacao_sell') {
        const { data: evidencia } = await db.from('agente_logs').select('metadata_json').eq('execucao_id', id).eq('step', 'sem_inadimplencia').maybeSingle()
        if (/^[0-9a-f]{64}$/.test(evidencia?.metadata_json?.evidencia_sha256 ?? '')) {
          fontes.push({ execucao: id, arquivo: 'Confirmação de ausência de inadimplência', hash: evidencia.metadata_json.evidencia_sha256 })
          continue
        }
      }
      if (erroArquivos || arquivos.length !== 1 || !arquivos[0].storage_path.split('/').includes(id)) throw Error('Arquivo da coleta ausente ou ambíguo.')
      const arquivo = arquivos[0]
      const { data: blob, error: erroDownload } = await db.storage.from('agente-relatorios').download(arquivo.storage_path)
      if (erroDownload) throw Error('Não foi possível recuperar o arquivo da coleta.')
      const bytes = Buffer.from(await blob.arrayBuffer())
      if (createHash('sha256').update(bytes).digest('hex') !== arquivo.hash_arquivo) throw Error('Arquivo da coleta diverge do original do agente.')
      const convertido = await parseRelatorioBuffer({ buffer: bytes, filename: arquivo.nome_arquivo, mimeType: arquivo.tipo_arquivo,
        condominioCnpj: cadastro.cnpj ?? undefined, tipoConversao: 'cobrancas', somenteAnoCorrente: false })
      const validacao = validarRelatorioEspelhamento(convertido, job.aplicar)
      avisos.push(...validacao.avisos)
      cotas.push(...validacao.cobrancas.map(cota => ({
        unidade: cota.unidade, bloco: cota.bloco, recibo: cota.recibo, vencimento: cota.vencimento ?? cota.vencimentoMaisAntigo,
        principal: cota.valorPrincipal, total: cota.valorTotal, multa: cota.multa, juros: cota.juros, correcao: cota.correcao,
        honorarios: cota.honorarios, situacao: cota.situacaoOrigem, componentes: cota.parcelas.length,
      })))
      fontes.push({ execucao: id, arquivo: arquivo.nome_arquivo, hash: arquivo.hash_arquivo })
    }
    return { cotas, fontes, avisos }
  } finally {
    await rm(pasta, { recursive: true, force: true }).catch(() => {})
  }
}

export async function coletarAcordosManager(codigo: string, condominioId: string, signal: AbortSignal) {
  if (!/^\d+$/.test(codigo)) throw Error('Código da Manager não configurado.')
  const pasta = await mkdtemp(path.join(os.tmpdir(), 'gkli-acordos-espelhamento-'))
  try {
    await executar(process.execPath, ['scripts/manager-acordos/worker.mjs', '--codigo', codigo, '--saida', pasta],
      { windowsHide: true, signal, timeout: 6 * 60_000, maxBuffer: 1024 * 1024 })
    const dirs = (await readdir(pasta, { withFileTypes: true })).filter(entry => entry.isDirectory())
    if (dirs.length !== 1) throw Error('Saída de acordos da Manager fora do padrão.')
    const raiz = path.join(pasta, dirs[0].name)
    const resumo = JSON.parse(await readFile(path.join(raiz, 'resumo.json'), 'utf8'))
    const fonte = resumo.resultados?.find(item => item.status === 'sucesso' && String(item.codigo_cliente).replace(/^0+/, '') === codigo.replace(/^0+/, ''))
    if (!fonte?.arquivo_json || !/^manager-\d+-acordos\.json$/.test(fonte.arquivo_json)) throw Error('Demonstrativo de acordos da Manager ausente.')
    const doc = JSON.parse(await readFile(path.join(raiz, fonte.arquivo_json), 'utf8'))
    if (!doc.condominios?.some(c => c.id === condominioId) || doc.filtro !== 'somente_em_aberto' || !Array.isArray(doc.acordos)) {
      throw Error('Demonstrativo de acordos da Manager não pertence ao condomínio selecionado.')
    }
    return doc.acordos
  } finally {
    await rm(pasta, { recursive: true, force: true }).catch(() => {})
  }
}

export async function coletarAcordosWebware(db, job, portal: 'bbz' | 'atipass', signal: AbortSignal) {
  const { data, error } = await db.from('agente_acordos_configuracoes').select('alvos_portal').eq('condominio_id', job.condominio_id)
    .eq('carteira_id', job.carteira_id).eq('administradora', portal === 'bbz' ? 'BBZ' : 'ATIPASS').eq('habilitado', true).maybeSingle()
  if (error || !data?.alvos_portal?.length) return null
  const pasta = await mkdtemp(path.join(os.tmpdir(), 'gkli-acordos-webware-'))
  const acordos = []
  try {
    for (const [indice, alvo] of data.alvos_portal.entries()) {
      const destino = path.join(pasta, String(indice))
      await executar(process.execPath, argumentosColetor(process.cwd(), portal, alvo, destino), {
        windowsHide: true, signal, timeout: 7 * 60_000, maxBuffer: 1024 * 1024,
      })
      const raiz = path.join(destino, portal)
      const dirs = (await readdir(raiz, { withFileTypes: true })).filter(d => d.isDirectory())
      if (dirs.length !== 1) throw Error('Demonstrativo Webware fora do padrão.')
      const doc = JSON.parse(await readFile(path.join(raiz, dirs[0].name, 'acordos.json'), 'utf8'))
      if (doc.codigo !== alvo.codigo || doc.condominio !== alvo.nome || doc.status !== 'sucesso' || doc.filtro !== 'aberto_e_baixado') {
        throw Error('Demonstrativo Webware fora do alvo confirmado.')
      }
      if (doc.sem_acordos_confirmado) continue
      if (!Array.isArray(doc.linhas_portal) || !doc.linhas_portal.length) throw Error('Demonstrativo Webware sem as linhas de acordos.')
      const totais = [], grade = []
      for (const [pagina, linhas] of doc.linhas_portal.entries()) {
        for (const linha of linhas) {
          if (/total geral/i.test(linha[0]?.texto)) totais.push(linha)
          else if (pagina === 0 || linha[0]?.texto !== 'Bloco') grade.push(linha)
        }
      }
      if (!totais.length) throw Error('Paginação do demonstrativo exige revisão.')
      const totalIgual = totais.every(t => JSON.stringify(t) === JSON.stringify(totais[0]))
      const paginas = doc.linhas_portal
      if (!totalIgual && totais.length !== paginas.length) throw Error('Total por página do demonstrativo incompleto.')
      const registros = totalIgual
        ? interpretarTabela([...grade, totais[0]]).acordos
        : paginas.flatMap(linhas => interpretarTabela(linhas).acordos)
      const processos = new Set(registros.map(a => a.processo))
      if (processos.size !== registros.length || doc.processos?.some(numero => !processos.has(numero))) {
        throw Error('Processos ausentes ou repetidos na paginação do demonstrativo.')
      }
      acordos.push(...registros)
    }
    return acordos
  } finally {
    await rm(pasta, { recursive: true, force: true }).catch(() => {})
  }
}

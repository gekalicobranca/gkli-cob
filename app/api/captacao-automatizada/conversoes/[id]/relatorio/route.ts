import { NextResponse } from 'next/server'
import { requireAuthenticatedApiUser } from '@/app/api/_lib/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { analiseResumida, lerAnaliseOriginal, lerPreJuridico, lerProcessos } from '@/features/condominios/relatorio-inadimplencia/leitura'
import { gerarPdfInadimplencia } from '@/features/condominios/relatorio-inadimplencia/pdf'
import { nomeArquivoRelatorio } from '@/features/condominios/relatorio-inadimplencia/arquivo'
import { AnaliseInadimplencia, ContextoRelatorio, dataIso, normalizar } from '@/features/condominios/relatorio-inadimplencia/modelo'
import { competenciaDaDataBase, contextoFromGkitJurSnapshot, fetchGkitJurRelatorioInadimplencia, snapshotErroGkitJur, snapshotSucessoGkitJur, temMesmoCnpjDoJur } from '@/features/condominios/relatorio-inadimplencia/gkit-jur'

export const runtime = 'nodejs'
export const maxDuration = 60
type Params = { params: Promise<{ id: string }> }
async function carregar(id: string) {
  const auth = await requireAuthenticatedApiUser()
  if (auth.response) return { response: auth.response }
  const db = createAdminClient()
  const { data: row, error } = await db.from('conversoes_relatorio').select('id, carteira_id, condominio_id, nome_arquivo, preview_json, atualizado_em').eq('id', id).like('origem', 'captacao_automatizada:%').maybeSingle()
  if (error || !row) return { response: NextResponse.json({ error: 'Ranking não encontrado.' }, { status: 404 }) }
  // Autorizar pelas colunas persistidas, nunca pelo carteiraId editável no preview.
  const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', auth.user!.id).maybeSingle()
  if (profileError) return { response: NextResponse.json({ error: 'Não foi possível validar seu acesso.' }, { status: 403 }) }
  if (profile?.role !== 'admin') {
    const { data: acesso, error: acessoError } = await db.from('usuarios_carteiras').select('carteira_id').eq('user_id', auth.user!.id).eq('carteira_id', row.carteira_id).maybeSingle()
    if (acessoError || !acesso) return { response: NextResponse.json({ error: 'Você não tem acesso a esta carteira.' }, { status: 403 }) }
  }
  const { data: condominio, error: condoError } = await db.from('condominios').select('id, nome, nome_operacional, cnpj, carteira_id').eq('id', row.condominio_id).eq('carteira_id', row.carteira_id).maybeSingle()
  if (condoError || !condominio) return { response: NextResponse.json({ error: 'Condomínio do ranking não encontrado nesta carteira.' }, { status: 404 }) }
  return { db, row, condominio }
}
async function responder(ctx: Awaited<ReturnType<typeof carregar>>, preview: any) {
  if (ctx.response) return ctx.response
  const { data: unidades, error } = await ctx.db!.from('unidades').select('bloco, identificacao, acao_judicial').eq('condominio_id', ctx.condominio!.id)
  if (error) throw new Error('Não foi possível consultar as indicações judiciais das unidades.')
  const analise: AnaliseInadimplencia = preview.analiseInadimplencia ?? analiseResumida(preview.rankingMensal, ctx.row!.nome_arquivo)
  if (!analise.recibos.length) return NextResponse.json({ error: 'Não há dados financeiros neste ranking. Anexe o relatório original.' }, { status: 422 })
  const bytes = await gerarPdfInadimplencia(analise, preview.relatorioInadimplenciaContexto ?? {}, {
    nome: ctx.condominio!.nome, cnpj: ctx.condominio!.cnpj,
    indicacoesApp: (unidades ?? []).map(u => ({ bloco: u.bloco ?? '', unidade: u.identificacao ?? '', acaoJudicial: Boolean(u.acao_judicial) })),
  })
  const nomeArquivo = nomeArquivoRelatorio(ctx.condominio!.cnpj, ctx.condominio!.nome)
  return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nomeArquivo}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}
async function consultarJur(ctx: Awaited<ReturnType<typeof carregar>>, preview: any) {
  const cnpj = String(ctx.condominio!.cnpj ?? '').replace(/\D/g, '')
  if (!cnpj) throw new Error('Condomínio sem CNPJ para consulta ao GKIT-Jur.')
  const analise: AnaliseInadimplencia = preview.analiseInadimplencia ?? analiseResumida(preview.rankingMensal, ctx.row!.nome_arquivo)
  const competencia = competenciaDaDataBase(analise.dataBase)
  try {
    const response = await fetchGkitJurRelatorioInadimplencia({ cnpj, competencia })
    if (!temMesmoCnpjDoJur(response, cnpj)) throw new Error('O GKIT-Jur retornou cliente com CNPJ diferente do condomínio.')
    return contextoFromGkitJurSnapshot(snapshotSucessoGkitJur({ cnpj, competencia, response }))
  } catch (error) {
    return contextoFromGkitJurSnapshot(snapshotErroGkitJur({
      cnpj,
      competencia,
      erro: error instanceof Error ? error.message : 'Falha ao consultar GKIT-Jur.',
    }))
  }
}
export async function GET(_: Request, { params }: Params) {
  try { const ctx = await carregar((await params).id); if (ctx.response) return ctx.response; return await responder(ctx, ctx.row!.preview_json ?? {}) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Não foi possível gerar o relatório.' }, { status: 422 }) }
}
export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await carregar((await params).id); if (ctx.response) return ctx.response
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Origem da solicitação não autorizada.' }, { status: 403 })
    if (Number(request.headers.get('content-length') ?? 0) > 35 * 1024 * 1024) return NextResponse.json({ error: 'Envie no máximo 35 MB de arquivos por vez.' }, { status: 413 })
    const form = await request.formData(); const preview: any = { ...(ctx.row!.preview_json as any ?? {}) }
    const contexto: ContextoRelatorio = { ...(preview.relatorioInadimplenciaContexto ?? {}) }
    const data = String(form.get('dataBase') ?? '').trim()
    if (data && !dataIso(data)) throw new Error('Informe uma data-base válida.')
    let alterou = false
    const usarGkitJur = ['true', 'on', '1', 'sim'].includes(String(form.get('gkitJur') ?? '').trim().toLowerCase())
    if (usarGkitJur) {
      const contextoJur = await consultarJur(ctx, preview)
      Object.assign(contexto, contextoJur)
      contexto.fontes = [...(contexto.fontes ?? []), ...(contextoJur.fontes ?? [])]
      alterou = true
    }
    for (const campo of ['original', 'processos', 'preJuridico']) {
      const file = form.get(campo)
      if (!(file instanceof File) || !file.size) continue
      if (file.size > 25 * 1024 * 1024) throw new Error('Cada arquivo pode ter no máximo 25 MB.')
      if (!/\.xlsx?$/i.test(file.name)) throw new Error('Envie planilhas XLS ou XLSX.')
      const buffer = Buffer.from(await file.arrayBuffer())
      if (campo === 'original') {
        const a = lerAnaliseOriginal(buffer, file.name, data || undefined)
        if (!a) throw new Error('Este formato ainda não permite a análise detalhada. O ranking resumido continua disponível.')
        const canon = (s: string) => normalizar(s.replace(/^\s*\d+\s*-\s*/, '')).replace(/\b(CONDOMINIO|COND|CONDOMINIUM)\b/g, '').replace(/\s+/g, ' ').trim()
        const fonte = canon(a.condominioFonte)
        if (!fonte || ![ctx.condominio!.nome, ctx.condominio!.nome_operacional].filter(Boolean).some(n => canon(n!) === fonte)) throw new Error('O condomínio identificado no relatório original não corresponde ao cadastro. Confira o arquivo e o nome operacional.')
        preview.analiseInadimplencia = a
      } else if (campo === 'processos') contexto.processos = lerProcessos(buffer, file.name, ctx.condominio!.cnpj ?? '')
      else contexto.preJuridico = lerPreJuridico(buffer, file.name, ctx.condominio!.cnpj ?? '')
      contexto.fontes = [...(contexto.fontes ?? []).filter(f => !f.startsWith(`${campo}: `)), `${campo}: ${file.name}`]
      alterou = true
    }
    if (data && preview.analiseInadimplencia) { preview.analiseInadimplencia = { ...preview.analiseInadimplencia, dataBase: dataIso(data), dataBaseInferida: false }; alterou = true }
    if (!alterou) throw new Error('Selecione uma fonte ou informe a data-base.')
    contexto.atualizadoEm = new Date().toISOString(); preview.relatorioInadimplenciaContexto = contexto
    // Renderizar antes de persistir; uma fonte inválida não substitui o contexto salvo.
    const result = await responder(ctx, preview)
    if (result.status !== 200) return result
    let update = ctx.db!.from('conversoes_relatorio').update({ preview_json: preview, atualizado_em: new Date().toISOString() }).eq('id', ctx.row!.id).eq('carteira_id', ctx.row!.carteira_id)
    if (ctx.row!.atualizado_em) update = update.eq('atualizado_em', ctx.row!.atualizado_em)
    const { data: saved, error } = await update.select('id').maybeSingle()
    if (error) throw new Error('Não foi possível salvar as fontes do relatório.')
    if (!saved) return NextResponse.json({ error: 'Este ranking mudou durante a geração. Atualize a página e tente novamente.' }, { status: 409 })
    return result
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Não foi possível atualizar o relatório.' }, { status: 422 }) }
}

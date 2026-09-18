import { listCobrancasCatalogo } from '@/features/cobrancas/queries'
import { dataCatalogo, montarCatalogo, type CotaCatalogo } from '@/features/cobrancas/catalogo'
import { gerarCatalogoPdf } from '@/features/cobrancas/catalogo-pdf'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const scope = await getPermittedCarteiras()
  const params = new URL(request.url).searchParams
  const get = (key: string) => params.get(key)?.trim() || ''
  const rows = await listCobrancasCatalogo(scope, {
    search: get('q'), administradoraId: get('administradora_id'), condominioId: get('condominio_id'),
    unidadeId: get('unidade_id'), vencimentoDe: get('vencimento_de'), vencimentoAte: get('vencimento_ate'),
  })
  const data = dataCatalogo()
  const pdf = await gerarCatalogoPdf(montarCatalogo(rows as CotaCatalogo[], data), data)
  return new Response(Buffer.from(pdf), { headers: {
    'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="catalogo-cobranca-${data}.pdf"`,
    'Cache-Control': 'private, no-store',
  } })
}

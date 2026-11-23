import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireRole } from '@/utils/auth/require-role'
import { createAdminClient } from '@/utils/supabase/admin'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { carregarEntregaWork } from '@/features/keila/work-entrega'

export default async function EntregaKeilaWork({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(['admin', 'gestor', 'operador'])
  const { id } = await params
  const scope = await getPermittedCarteiras()
  const entrega = await carregarEntregaWork(createAdminClient(), id, scope.carteiraIds)
  if (!entrega) notFound()

  return (
    <section className="mx-auto max-w-xl space-y-5 p-6">
      <h1 className="text-2xl font-semibold">Relatório Lello · Keila</h1>
      <dl className="space-y-2">
        <div><dt>Condomínio</dt><dd>{entrega.condominio}</dd></div>
        <div><dt>Código Lello</dt><dd>{entrega.codigo}</dd></div>
        <div><dt>Vencimento inicial</dt><dd>{entrega.periodo.de}</dd></div>
        <div><dt>Vencimento final</dt><dd>{entrega.periodo.ate}</dd></div>
      </dl>
      {entrega.execucao.status === 'sucesso' ? <p role="status">Relatório anexado ao atendimento.</p> : (
        <form action={`/api/keila/work/${id}`} method="post" encType="multipart/form-data" className="space-y-4">
          <label htmlFor="arquivo" className="block">Relatório original Cotas Atrasadas (XLSX, até 4 MB)</label>
          <input id="arquivo" name="arquivo" type="file" accept=".xlsx" required />
          <button type="submit" className="block rounded-md bg-slate-900 px-4 py-2 text-white">Anexar ao atendimento</button>
        </form>
      )}
      <Link className="underline" href={`/app/gestao/keila?caso=${entrega.casoId}`}>Abrir atendimento</Link>
    </section>
  )
}

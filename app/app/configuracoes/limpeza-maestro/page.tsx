import Link from 'next/link'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/utils/auth/require-admin'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'
const caminho = '/app/configuracoes/limpeza-maestro'
const dataHora = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo',
})

async function salvar(form: FormData) {
  'use server'
  const admin = await requireAdmin()
  const escolha = form.get('ativa')
  if (escolha !== 'sim' && escolha !== 'nao') redirect(caminho + '?resultado=erro')
  const { error } = await createAdminClient().from('maestro_limpeza_diaria')
    .update({ ativa: escolha === 'sim', alterada_por: admin.id, alterada_em: new Date().toISOString() })
    .eq('id', true).select('id').single()
  if (error) redirect(caminho + '?resultado=erro')
  revalidatePath(caminho)
  redirect(caminho + '?resultado=salvo')
}

export default async function LimpezaMaestroPage({ searchParams }: {
  searchParams: Promise<{ resultado?: string }>
}) {
  await requireAdmin()
  const { resultado } = await searchParams
  const { data, error } = await createAdminClient().from('maestro_limpeza_diaria')
    .select('ativa,executada_em,cancelados').eq('id', true).single()

  return <main className="max-w-3xl space-y-5">
    <Link href="/app/configuracoes" className="text-sm underline">Voltar para Configurações</Link>
    <h1 className="text-2xl font-semibold">Limpeza da fila do Maestro</h1>
    <p>Todos os dias às 06h de Brasília, a rotina cancela os pedidos do Maestro e do Easy Maestro que já estavam na fila nesse horário e ainda aguardavam a primeira tentativa de coleta.</p>
    <p>Pedidos em andamento, com evidência de processamento ou agendados para depois das 06h continuam na fila ou no histórico. Cada cancelamento fica registrado na auditoria.</p>
    {error || !data ? <p role="alert">Não foi possível consultar a rotina. Atualize a página para tentar novamente.</p> : <>
      <section className="space-y-3 rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Agendamento {data.ativa ? 'ativo' : 'pausado'}</h2>
        <p>{data.executada_em
          ? `Última limpeza em ${dataHora.format(new Date(data.executada_em))} (Brasília). Pedidos cancelados: ${data.cancelados}.`
          : 'A primeira limpeza ainda não foi executada.'}</p>
        <form action={salvar}>
          <input type="hidden" name="ativa" value={data.ativa ? 'nao' : 'sim'} />
          <button className="min-h-11 rounded-lg border px-4 font-medium" type="submit">
            {data.ativa ? 'Pausar limpeza diária' : 'Ativar limpeza diária'}
          </button>
        </form>
      </section>
      {resultado === 'salvo' && <p role="status">Configuração salva.</p>}
      {resultado === 'erro' && <p role="alert">Não foi possível salvar a configuração. Tente novamente.</p>}
    </>}
  </main>
}

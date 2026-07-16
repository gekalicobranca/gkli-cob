import {
  listAgenteAdministradoras,
  listAgenteExecucoes,
  listAgenteReceitas,
  listCarteirasParaAgente,
} from '@/features/agente-automatico/queries'
import {
  criarAgenteAdministradora,
  criarAgenteReceita,
  executarAgenteReceita,
  marcarExecucaoComoSucessoManual,
  validarArquivoAgente,
} from '@/features/agente-automatico/actions'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

function statusTone(status: string) {
  if (status === 'sucesso') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'falha') return 'bg-red-50 text-red-700 border-red-200'
  if (status === 'em_execucao') return 'bg-blue-50 text-blue-700 border-blue-200'
  if (status === 'precisa_intervencao') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-slate-50 text-slate-700 border-slate-200'
}

export default async function AgenteAutomaticoPage() {
  const scope = await getPermittedCarteiras()
  const carteiraIds = scope.carteiraIds

  const [carteiras, administradoras, receitas, execucoes] = await Promise.all([
    listCarteirasParaAgente(carteiraIds),
    listAgenteAdministradoras(carteiraIds),
    listAgenteReceitas(carteiraIds),
    listAgenteExecucoes(carteiraIds),
  ])

  const totalSucesso = execucoes.filter((item) => item.status === 'sucesso').length
  const totalFalha = execucoes.filter((item) => item.status === 'falha').length
  const totalPendentes = execucoes.filter((item) => item.status === 'pendente').length

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Inteligência"
        title="Agente automático"
        description="Coleta assistida de planilhas e relatórios de inadimplência em portais de administradoras."
      />

      <section className="grid gap-4 md:grid-cols-4">
        <Card className="p-5">
          <p className="text-sm text-slate-500">Administradoras</p>
          <p className="mt-2 text-3xl text-slate-900">{administradoras.length}</p>
        </Card>

        <Card className="p-5">
          <p className="text-sm text-slate-500">Receitas de coleta</p>
          <p className="mt-2 text-3xl text-slate-900">{receitas.length}</p>
        </Card>

        <Card className="p-5">
          <p className="text-sm text-slate-500">Pendentes</p>
          <p className="mt-2 text-3xl text-slate-900">{totalPendentes}</p>
        </Card>

        <Card className="p-5">
          <p className="text-sm text-slate-500">Sucesso / Falha</p>
          <p className="mt-2 text-3xl text-slate-900">
            {totalSucesso}/{totalFalha}
          </p>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg text-slate-900">Nova administradora</h2>
          <p className="mt-1 text-sm text-slate-500">
            Cadastre o portal da administradora.
          </p>

          <form action={criarAgenteAdministradora} className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm text-slate-600">Carteira</span>
              <Select
                name="carteira_id"
                required
                className="mt-1"
              >
                <option value="">Selecione</option>
                {carteiras.map((carteira) => (
                  <option key={carteira.id} value={carteira.id}>
                    {carteira.nome}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block">
              <span className="text-sm text-slate-600">Administradora</span>
              <Input
                name="nome"
                required
                placeholder="Ex.: Administradora Modelo"
                className="mt-1"
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-600">URL do portal</span>
              <Input
                name="url_portal"
                required
                placeholder="https://portal..."
                className="mt-1"
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-600">Tipo de portal</span>
              <Input
                name="tipo_portal"
                defaultValue="portal_web"
                className="mt-1"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-600">
                <input name="exige_captcha" type="checkbox" />
                Exige captcha
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-600">
                <input name="exige_2fa" type="checkbox" />
                Exige 2FA
              </label>
            </div>

            <label className="block">
              <span className="text-sm text-slate-600">Observações</span>
              <Textarea
                name="observacoes"
                rows={3}
                className="mt-1"
              />
            </label>

            <Button type="submit">
              Salvar administradora
            </Button>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg text-slate-900">Nova receita de coleta</h2>
          <p className="mt-1 text-sm text-slate-500">
            A receita representa o roteiro operacional do robô.
          </p>

          <form action={criarAgenteReceita} className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm text-slate-600">Carteira</span>
              <Select
                name="carteira_id"
                required
                className="mt-1"
              >
                <option value="">Selecione</option>
                {carteiras.map((carteira) => (
                  <option key={carteira.id} value={carteira.id}>
                    {carteira.nome}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block">
              <span className="text-sm text-slate-600">Administradora</span>
              <Select
                name="administradora_id"
                required
                className="mt-1"
              >
                <option value="">Selecione</option>
                {administradoras.map((adm) => (
                  <option key={adm.id} value={adm.id}>
                    {adm.nome}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block">
              <span className="text-sm text-slate-600">Nome da receita</span>
              <Input
                name="nome"
                required
                placeholder="Ex.: Baixar inadimplência mensal"
                className="mt-1"
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-600">Tipo de arquivo esperado</span>
              <Select
                name="tipo_arquivo_esperado"
                defaultValue="xlsx"
                className="mt-1"
              >
                <option value="xlsx">XLSX</option>
                <option value="csv">CSV</option>
                <option value="pdf">PDF</option>
                <option value="zip">ZIP</option>
              </Select>
            </label>

            <label className="block">
              <span className="text-sm text-slate-600">Script key</span>
              <Input
                name="script_key"
                placeholder="Ex.: adm_modelo_inadimplencia"
                className="mt-1"
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-600">Descrição operacional</span>
              <Textarea
                name="descricao"
                rows={4}
                placeholder="Ex.: Entrar no portal, acessar financeiro, exportar inadimplência..."
                className="mt-1"
              />
            </label>

            <Button type="submit">
              Salvar receita
            </Button>
          </form>
        </Card>
      </section>

      <Card className="p-6">
        <h2 className="text-lg text-slate-900">Receitas disponíveis</h2>
        <p className="mt-1 text-sm text-slate-500">
          Receitas configuradas para coleta e validação.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {receitas.map((receita) => (
            <article key={receita.id} className="rounded-lg border border-slate-200 p-5">
              <p className="text-sm text-slate-500">
                {receita.administradora?.nome ?? 'Administradora'}
              </p>
              <h3 className="mt-1 text-base text-slate-900">{receita.nome}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {receita.descricao || 'Sem descrição operacional.'}
              </p>

              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                  {receita.tipo_arquivo_esperado.toUpperCase()}
                </span>

                <form action={executarAgenteReceita}>
                  <input type="hidden" name="receita_id" value={receita.id} />
                  <Button type="submit">
                    Executar coleta
                  </Button>
                </form>
              </div>
            </article>
          ))}

          {!receitas.length && (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500">
              Nenhuma receita cadastrada ainda.
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg text-slate-900">Histórico de execuções</h2>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-3 pr-4">Data</th>
                <th className="py-3 pr-4">Administradora</th>
                <th className="py-3 pr-4">Receita</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Ações</th>
              </tr>
            </thead>
            <tbody>
              {execucoes.map((execucao) => (
                <tr key={execucao.id} className="border-b border-slate-100">
                  <td className="py-4 pr-4 text-slate-600">
                    {new Date(execucao.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="py-4 pr-4 text-slate-700">
                    {execucao.administradora?.nome ?? '-'}
                  </td>
                  <td className="py-4 pr-4 text-slate-700">
                    {execucao.receita?.nome ?? '-'}
                  </td>
                  <td className="py-4 pr-4">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs ${statusTone(
                        execucao.status,
                      )}`}
                    >
                      {execucao.status.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td className="py-4 pr-4">
                    <div className="flex flex-wrap gap-2">
                      <form action={marcarExecucaoComoSucessoManual}>
                        <input type="hidden" name="execucao_id" value={execucao.id} />
                        <Button type="submit" variant="secondary" size="sm">
                          Marcar sucesso
                        </Button>
                      </form>

                      <form action={validarArquivoAgente}>
                        <input type="hidden" name="execucao_id" value={execucao.id} />
                        <input type="hidden" name="status" value="validado" />
                        <Button type="submit" variant="secondary" size="sm">
                          Validar
                        </Button>
                      </form>

                      <form action={validarArquivoAgente}>
                        <input type="hidden" name="execucao_id" value={execucao.id} />
                        <input type="hidden" name="status" value="rejeitado" />
                        <Button type="submit" variant="danger" size="sm">
                          Rejeitar
                        </Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}

              {!execucoes.length && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                    Nenhuma execução registrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  )
}

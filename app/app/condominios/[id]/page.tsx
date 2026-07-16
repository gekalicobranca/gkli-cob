import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Activity, ClipboardList, Download, FileClock, History, Home, Landmark, PencilLine, Users } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { StatusBadge } from '@/components/data/status-badge'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listCarteirasForSelect } from '@/features/cadastros/queries'
import { getCondominioIntegral, listEventosDoCondominio, listImportacoesDoCondominio, listResponsaveisDoCondominio, listUnidadesDoCondominio } from '@/features/condominios/queries'
import { listReguasForSelect } from '@/features/reguas/queries'
import { updateCondominioIntegral } from '@/features/condominios/actions'
import { ClassificacaoOperacionalBadge, ClassificacaoOperacionalField } from '@/features/condominios/components/classificacao-operacional'

export default async function CondominioIntegralPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scope = await getPermittedCarteiras()
  const [condominio, carteiras, reguasCobranca, reguasAcordo] = await Promise.all([
    getCondominioIntegral(id, scope),
    listCarteirasForSelect(scope),
    listReguasForSelect(scope, 'cobranca'),
    listReguasForSelect(scope, 'acordo'),
  ])

  if (!condominio) notFound()

  const [unidades, responsaveis, importacoes, eventos] = await Promise.all([
    listUnidadesDoCondominio(condominio.id, scope),
    listResponsaveisDoCondominio(condominio.id, scope),
    listImportacoesDoCondominio(condominio, scope),
    listEventosDoCondominio(condominio, scope),
  ])

  const unidadesAtivas = unidades.filter((row: any) => ['ativo', 'ativa'].includes(String(row.status ?? '').toLowerCase())).length
  const baseContatos = responsaveis.length ? responsaveis : unidades
  const contatosComTelefone = baseContatos.filter((row: any) => row.telefone).length
  const contatosComEmail = baseContatos.filter((row: any) => row.email).length
  const coberturaContato = baseContatos.length ? Math.round(((contatosComTelefone + contatosComEmail) / (baseContatos.length * 2)) * 100) : 0
  const responsaveisAtivos = responsaveis.filter((row: any) => row.ativo !== false).length
  const ultimaImportacao = importacoes[0]
  const nomeExibicao = condominio.nome_operacional || condominio.nome || 'Condomínio'

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Base Cadastral · Condomínio Integral"
        title={nomeExibicao}
        description={condominio.nome_operacional && condominio.nome_operacional !== condominio.nome ? `Razão/Nome oficial: ${condominio.nome}` : 'Cadastro integral, exportações e parâmetros operacionais do condomínio.'}
        actions={
          <>
            <ButtonLink href={`/api/condominios/${condominio.id}/exportacoes/unidades`} variant="secondary"><Download size={16} />Exportar unidades</ButtonLink>
            <ButtonLink href={`/api/condominios/${condominio.id}/exportacoes/cobrancas`} variant="secondary"><Download size={16} />Exportar cobranças</ButtonLink>
            <ButtonLink href={`/api/condominios/${condominio.id}/exportacoes/acordos`} variant="secondary"><Download size={16} />Exportar acordos</ButtonLink>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <ClassificacaoOperacionalBadge value={condominio.classificacao_operacional} />
        <span className="text-sm text-slate-500">Classificação usada para orientar tom, prioridade e cuidado operacional.</span>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Kpi icon={<Home size={18} />} label="Unidades" value={String(unidades.length)} detail={`${unidadesAtivas} ativas`} />
        <Kpi icon={<Users size={18} />} label="Responsáveis" value={String(responsaveis.length)} detail={`${responsaveisAtivos} ativos`} />
        <Kpi icon={<Users size={18} />} label="Cobertura contatos" value={`${coberturaContato}%`} detail={`${contatosComTelefone} telefones · ${contatosComEmail} e-mails`} />
        <Kpi icon={<ClipboardList size={18} />} label="Importações" value={String(importacoes.length)} detail={ultimaImportacao ? `última em ${formatDateTime(ultimaImportacao.created_at)}` : 'sem importações'} />
        <Kpi icon={<Activity size={18} />} label="Eventos" value={String(eventos.length)} detail="auditoria operacional" />
      </section>

      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <Tab href="#cadastro" icon={<PencilLine size={15} />} label="Cadastro" />
        <Tab href="#cobranca" icon={<Landmark size={15} />} label="Cobrança" />
        <Tab href="#reguas" icon={<Activity size={15} />} label="Réguas" />
        <Tab href="#unidades" icon={<Home size={15} />} label="Unidades" />
        <Tab href="#responsaveis" icon={<Users size={15} />} label="Responsáveis" />
        <Tab href="#historico" icon={<History size={15} />} label="Histórico" />
        <Tab href="#auditoria" icon={<FileClock size={15} />} label="Auditoria" />
      </div>

      <form action={updateCondominioIntegral} className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
        <input type="hidden" name="id" value={condominio.id} />

        <Card id="cadastro" className="space-y-5 scroll-mt-24">
          <div>
            <Badge tone="primary">Cadastro</Badge>
            <h2 className="mt-3 text-lg font-medium text-slate-950">Dados principais</h2>
            <p className="mt-1 text-sm text-slate-500">Edite o cadastro sem depender de uma nova importação CSV.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Carteira"><SearchableSelect name="carteira_id" options={carteiras.map((carteira: any) => ({ value: carteira.id, label: carteira.nome }))} selectedValue={condominio.carteira_id ?? ''} placeholder="Digite parte da carteira" required /></FormField>
            <FormField label="Status"><Select name="status" defaultValue={condominio.status ?? 'ativo'}><option value="ativo">Ativo</option><option value="inativo">Inativo</option><option value="pausado">Pausado</option></Select></FormField>
            <FormField label="Nome oficial do condomínio"><Input name="nome" defaultValue={condominio.nome ?? ''} required /></FormField>
            <FormField label="Nome operacional"><Input name="nome_operacional" defaultValue={condominio.nome_operacional ?? ''} placeholder="Como a operação identifica este condomínio" /></FormField>
            <FormField label="CNPJ"><Input name="cnpj" defaultValue={condominio.cnpj ?? ''} /></FormField>
            <FormField label="Administradora"><Input name="administradora" defaultValue={condominio.administradora ?? ''} /></FormField>
          </div>

          <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <p className="text-sm font-medium text-slate-950">Endereço do condomínio</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Usado em documentos operacionais e jurídicos, como a procuração pré-jurídica.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-6">
              <FormField label="Logradouro"><Input name="endereco_logradouro" defaultValue={condominio.endereco_logradouro ?? ''} /></FormField>
              <FormField label="Número"><Input name="endereco_numero" defaultValue={condominio.endereco_numero ?? ''} /></FormField>
              <FormField label="Complemento"><Input name="endereco_complemento" defaultValue={condominio.endereco_complemento ?? ''} /></FormField>
              <FormField label="Bairro"><Input name="endereco_bairro" defaultValue={condominio.endereco_bairro ?? ''} /></FormField>
              <FormField label="Cidade"><Input name="endereco_cidade" defaultValue={condominio.endereco_cidade ?? ''} /></FormField>
              <FormField label="UF"><Input name="endereco_uf" defaultValue={condominio.endereco_uf ?? ''} maxLength={2} /></FormField>
              <FormField label="CEP"><Input name="endereco_cep" defaultValue={condominio.endereco_cep ?? ''} /></FormField>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <ClassificacaoOperacionalField defaultValue={condominio.classificacao_operacional ?? 'prata'} />
          </div>

          <FormField label="Observações internas">
            <Textarea name="observacoes" defaultValue={condominio.observacoes ?? ''} placeholder="Observações do condomínio, regras combinadas, exceções operacionais..." />
          </FormField>
        </Card>

        <Card id="cobranca" className="space-y-5 scroll-mt-24">
          <div>
            <Badge tone="primary">Cobrança</Badge>
            <h2 className="mt-3 text-lg font-medium text-slate-950">Parâmetros operacionais</h2>
            <p className="mt-1 text-sm text-slate-500">Campos usados para importação, régua e leitura operacional.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Dia de vencimento da cota"><Input name="vencimento_cota_dia" type="number" min="1" max="31" defaultValue={condominio.vencimento_cota_dia ?? 10} /></FormField>
            <FormField label="Valor médio da cota"><Input name="valor_cota_condominial" defaultValue={String(condominio.valor_cota_condominial ?? 0).replace('.', ',')} /></FormField>
            <FormField label="Início da cobrança após X dias"><Input name="inicio_cobranca_dias" type="number" min="0" max="365" defaultValue={condominio.inicio_cobranca_dias ?? 30} /></FormField>
            <FormField label="Expirar para pré-jurídico após a régua" hint="Em branco desativa. Ex.: régua 30 + expiração 60 = pré-jurídico em D+90."><Input name="dias_expiracao_regua_pre_juridico" type="number" min="0" max="3650" defaultValue={condominio.dias_expiracao_regua_pre_juridico ?? ''} placeholder="Sem expiração automática" /></FormField>
            <FormField label="Parcelas permitidas sem aprovação do síndico"><Input name="parcelas_acordo_sem_aprovacao_sindico" type="number" min="0" max="120" defaultValue={condominio.parcelas_acordo_sem_aprovacao_sindico ?? 0} /></FormField>
            <FormField label="Dias para reemissão de parcela de acordo em atraso"><Input name="dias_reemissao_parcela_acordo_atrasada" type="number" min="0" max="365" defaultValue={condominio.dias_reemissao_parcela_acordo_atrasada ?? 0} /></FormField>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                name="operacao_virtual_habilitada"
                defaultChecked={Boolean(condominio.operacao_virtual_habilitada)}
                className="mt-1 h-4 w-4 rounded border-slate-300 accent-[var(--gkli-primary)]"
              />
              <span>
                <span className="block font-medium text-slate-950">Permitir operação virtual</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  Quando habilitado, a Keila pode considerar este condomínio para filas, tarefas e lotes supervisionados.
                </span>
              </span>
            </label>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            <p className="font-semibold">Regras operacionais de acordos</p>
            <p className="mt-1">Acima do limite de parcelas, o sistema envia primeiro a aprovação pública ao síndico. Somente após esse aceite o termo é enviado ao devedor. Se os dias de reemissão forem 0, parcelas vencidas não poderão ser reemitidas pelo acompanhamento.</p>
          </div>

          <div id="reguas" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="text-sm font-medium text-slate-800">Réguas vinculadas</p>
            <p className="mt-2">Se nenhuma régua específica for selecionada, o motor usa a régua padrão da carteira ou o fallback do sistema.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <FormField label="Régua de cobrança">
                <Select name="regua_cobranca_id" defaultValue={condominio.regua_cobranca_id ?? ''}>
                  <option value="">Usar padrão/fallback</option>
                  {reguasCobranca.map((regua: any) => (<option key={regua.id} value={regua.id}>{regua.nome}{regua.carteiras?.nome ? ` · ${regua.carteiras.nome}` : ' · global'}</option>))}
                </Select>
              </FormField>
              <FormField label="Régua de acordos">
                <Select name="regua_acordo_id" defaultValue={condominio.regua_acordo_id ?? ''}>
                  <option value="">Usar padrão/fallback</option>
                  {reguasAcordo.map((regua: any) => (<option key={regua.id} value={regua.id}>{regua.nome}{regua.carteiras?.nome ? ` · ${regua.carteiras.nome}` : ' · global'}</option>))}
                </Select>
              </FormField>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <ButtonLink href="/app/condominios" variant="secondary">Cancelar</ButtonLink>
            <Button type="submit">Salvar Condomínio Integral</Button>
          </div>
        </Card>
      </form>

      <section id="unidades" className="scroll-mt-24">
        <Card className="overflow-hidden p-0">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between">
            <div><Badge tone="primary">Unidades</Badge><h2 className="mt-3 text-lg font-medium text-slate-950">Unidades vinculadas</h2><p className="mt-1 text-sm text-slate-500">Primeira leitura para saneamento cadastral antes da régua.</p></div>
            <ButtonLink href="/app/unidades/nova" variant="secondary">Nova unidade</ButtonLink>
          </div>
          {unidades.length === 0 ? <div className="p-5 text-sm text-slate-500">Nenhuma unidade vinculada a este condomínio.</div> : (
            <div className="divide-y divide-slate-100">{unidades.slice(0, 12).map((unidade: any) => (<Link key={unidade.id} href={`/app/unidades/${unidade.id}`} className="grid gap-3 px-5 py-4 transition hover:bg-slate-50 lg:grid-cols-[1fr_1.2fr_1fr_1fr_90px] lg:items-center"><div><p className="text-sm font-medium text-slate-950">{unidade.identificacao}</p><p className="mt-1 text-xs text-slate-500">Bloco {unidade.bloco || '-'}</p></div><div><p className="text-sm text-slate-700">{unidade.responsavel_nome || 'Responsável não informado'}</p><p className="mt-1 text-xs text-slate-500">{unidade.responsavel_documento || '-'}</p></div><div className="text-sm text-slate-600">{unidade.telefone || '-'}</div><div className="truncate text-sm text-slate-600">{unidade.email || '-'}</div><StatusBadge status={unidade.status} /></Link>))}</div>
          )}
        </Card>
      </section>

      <section id="responsaveis" className="scroll-mt-24">
        <Card className="overflow-hidden p-0">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between">
            <div><Badge tone="primary">Responsáveis</Badge><h2 className="mt-3 text-lg font-medium text-slate-950">Responsáveis importados</h2><p className="mt-1 text-sm text-slate-500">Base de apoio usada para contato, régua e mensageria. Não altera o total de unidades operacionais.</p></div>
            <ButtonLink href={`/app/responsaveis?condominio_id=${condominio.id}`} variant="secondary">Ver todos</ButtonLink>
          </div>
          {responsaveis.length === 0 ? <div className="p-5 text-sm text-slate-500">Nenhum responsável de apoio vinculado a este condomínio.</div> : (
            <div className="divide-y divide-slate-100">{responsaveis.slice(0, 12).map((responsavel: any) => (<Link key={responsavel.id} href={`/app/responsaveis/${responsavel.id}`} className="grid gap-3 px-5 py-4 transition hover:bg-slate-50 lg:grid-cols-[1fr_1.2fr_1fr_1fr_110px] lg:items-center"><div><p className="text-sm font-medium text-slate-950">{responsavel.unidade}</p><p className="mt-1 text-xs text-slate-500">Bloco {responsavel.bloco || '-'}</p></div><div><p className="text-sm text-slate-700">{responsavel.responsavel_nome || 'Responsável não informado'}</p><p className="mt-1 text-xs text-slate-500">{responsavel.responsavel_documento || '-'}</p></div><div className="text-sm text-slate-600">{responsavel.telefone || '-'}</div><div className="truncate text-sm text-slate-600">{responsavel.email || '-'}</div><Badge tone={responsavel.ativo === false ? 'slate' : 'green'}>{responsavel.ativo === false ? 'Inativo' : 'Ativo'}</Badge></Link>))}</div>
          )}
        </Card>
      </section>

      <section id="historico" className="scroll-mt-24">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 p-5"><Badge tone="primary">Histórico</Badge><h2 className="mt-3 text-lg font-medium text-slate-950">Histórico operacional</h2><p className="mt-1 text-sm text-slate-500">Eventos do Condomínio Integral e importações recentes ficam concentrados aqui.</p></div>
          {eventos.length === 0 && importacoes.length === 0 ? <div className="p-5 text-sm text-slate-500">Nenhum histórico encontrado para este condomínio.</div> : (
            <div className="grid gap-5 p-5 xl:grid-cols-[1fr_.9fr]">
              <div className="space-y-3"><div className="flex items-center gap-2 text-sm text-slate-700"><FileClock size={16} className="text-[var(--gkli-primary)]" />Timeline de alterações</div>{eventos.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Rode a migration da Fase 2 para começar a registrar eventos de auditoria.</div> : <div className="space-y-3">{eventos.map((evento: any) => <TimelineItem key={evento.id} evento={evento} />)}</div>}</div>
              <div className="space-y-3"><div className="flex items-center gap-2 text-sm text-slate-700"><ClipboardList size={16} className="text-[var(--gkli-primary)]" />Importações relacionadas</div>{importacoes.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Nenhuma importação recente encontrada para a carteira deste condomínio.</div> : <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">{importacoes.map((importacao: any) => (<Link key={importacao.id} href={`/app/importacoes/${importacao.id}`} className="block p-4 transition hover:bg-slate-50"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-950">{importacao.arquivo_nome || 'Importação'}</p><p className="mt-1 text-xs text-slate-500">{importacao.tipo} · {formatDate(importacao.created_at)}</p><p className="mt-2 text-xs text-slate-500">{importacao.total_validas ?? 0} válidas · {importacao.total_invalidas ?? 0} inválidas</p></div><StatusBadge status={importacao.status} /></div></Link>))}</div>}</div>
            </div>
          )}
        </Card>
      </section>

      <section id="auditoria" className="scroll-mt-24">
        <Card className="space-y-4">
          <div><Badge tone="primary">Auditoria</Badge><h2 className="mt-3 text-lg font-medium text-slate-950">Alterações rastreadas</h2><p className="mt-1 text-sm text-slate-500">Na Fase 2, toda edição salva no Condomínio Integral registra usuário, data e campos alterados.</p></div>
          <div className="grid gap-3 md:grid-cols-3"><AuditInfo title="Quem alterou" text="Nome e e-mail do usuário autenticado." /><AuditInfo title="O que mudou" text="Campos antes/depois em JSON estruturado." /><AuditInfo title="Quando mudou" text="Linha do tempo ordenada por data." /></div>
        </Card>
      </section>
    </div>
  )
}

function Kpi({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) { return <Card className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</p><p className="mt-3 text-3xl font-medium tracking-tight text-slate-950">{value}</p><p className="mt-1 text-sm text-slate-500">{detail}</p></div><div className="rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">{icon}</div></div></Card> }
function Tab({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) { return <a href={href} className="inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">{icon}{label}</a> }
function AuditInfo({ title, text }: { title: string; text: string }) { return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-medium text-slate-900">{title}</p><p className="mt-2 text-sm text-slate-500">{text}</p></div> }
function TimelineItem({ evento }: { evento: any }) { const changes = Object.entries(evento.diferencas ?? {}); return <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="text-sm font-medium text-slate-950">{evento.titulo}</p><p className="mt-1 text-xs text-slate-500">{formatDateTime(evento.criado_em)} · {evento.usuario_nome || evento.usuario_email || 'Usuário'}</p>{evento.descricao ? <p className="mt-2 text-sm text-slate-600">{evento.descricao}</p> : null}</div><Badge tone="slate">{formatEventoTipo(evento.evento_tipo)}</Badge></div>{changes.length > 0 ? <div className="mt-4 grid gap-2 md:grid-cols-2">{changes.slice(0, 6).map(([field, change]: [string, any]) => <div key={field} className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><p className="uppercase tracking-[0.14em] text-slate-400">{formatField(field)}</p><p className="mt-2"><span className="text-slate-400">Antes:</span> {formatAuditValue(change?.antes)}</p><p className="mt-1"><span className="text-slate-400">Depois:</span> {formatAuditValue(change?.depois)}</p></div>)}</div> : null}</div> }
function formatEventoTipo(value?: string | null) { return value ? value.replaceAll('_', ' ') : 'evento' }
function formatField(value: string) { return value.replaceAll('_', ' ') }
function formatAuditValue(value: unknown) { if (value === null || value === undefined || value === '') return '-'; if (typeof value === 'boolean') return value ? 'sim' : 'não'; return String(value) }
function formatDate(value?: string | null) { if (!value) return '-'; return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) }
function formatDateTime(value?: string | null) { if (!value) return '-'; return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }

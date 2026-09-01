import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Activity, BarChart3, ChevronDown, ClipboardList, Download, FileClock, History, Home, Landmark, PencilLine, Users } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { StatusBadge } from '@/components/data/status-badge'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listCarteirasForSelect } from '@/features/cadastros/queries'
import { getCondominioIntegral, listEventosDoCondominio, listImportacoesDoCondominio, listRankingsDoCondominio, listResponsaveisDoCondominio, listUnidadesDoCondominio } from '@/features/condominios/queries'
import { listReguasForSelect } from '@/features/reguas/queries'
import { updateCondominioIntegral } from '@/features/condominios/actions'
import { ClassificacaoOperacionalBadge, ClassificacaoOperacionalField } from '@/features/condominios/components/classificacao-operacional'

type CondominioAba = 'cadastro' | 'cobranca' | 'reguas' | 'historico' | 'auditoria' | 'rankings'

const ABAS_CONDOMINIO: Array<{ id: CondominioAba; label: string; icon: React.ReactNode }> = [
  { id: 'cadastro', label: 'Cadastro', icon: <PencilLine size={15} /> },
  { id: 'cobranca', label: 'Cobrança', icon: <Landmark size={15} /> },
  { id: 'reguas', label: 'Régua', icon: <Activity size={15} /> },
  { id: 'historico', label: 'Histórico', icon: <History size={15} /> },
  { id: 'auditoria', label: 'Auditoria', icon: <FileClock size={15} /> },
  { id: 'rankings', label: 'Rankings', icon: <BarChart3 size={15} /> },
]

function normalizeAba(value?: string | string[] | null): CondominioAba {
  const raw = Array.isArray(value) ? value[0] : value
  return ABAS_CONDOMINIO.some((aba) => aba.id === raw) ? raw as CondominioAba : 'cadastro'
}

export default async function CondominioIntegralPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ aba?: string | string[] }> }) {
  const { id } = await params
  const query = await searchParams
  const abaAtiva = normalizeAba(query?.aba)
  const scope = await getPermittedCarteiras()
  const [condominio, carteiras, reguasCobranca, reguasAcordo] = await Promise.all([
    getCondominioIntegral(id, scope),
    listCarteirasForSelect(scope),
    listReguasForSelect(scope, 'cobranca'),
    listReguasForSelect(scope, 'acordo'),
  ])

  if (!condominio) notFound()

  const [unidades, responsaveis, importacoes, eventos, rankings] = await Promise.all([
    listUnidadesDoCondominio(condominio.id, scope),
    listResponsaveisDoCondominio(condominio.id, scope),
    listImportacoesDoCondominio(condominio, scope),
    listEventosDoCondominio(condominio, scope),
    listRankingsDoCondominio(condominio, scope),
  ])

  const unidadesAtivas = unidades.filter((row: any) => ['ativo', 'ativa'].includes(String(row.status ?? '').toLowerCase())).length
  const baseContatos = responsaveis.length ? responsaveis : unidades
  const contatosComTelefone = baseContatos.filter((row: any) => row.telefone).length
  const contatosComEmail = baseContatos.filter((row: any) => row.email).length
  const coberturaContato = baseContatos.length ? Math.round(((contatosComTelefone + contatosComEmail) / (baseContatos.length * 2)) * 100) : 0
  const responsaveisAtivos = responsaveis.filter((row: any) => row.ativo !== false).length
  const contatosReguaPreenchidos = [
    condominio.sindico_email,
    condominio.sindico_celular,
    condominio.gerente_email,
    condominio.gerente_celular,
  ].filter((value) => String(value ?? '').trim()).length
  const contatosReguaCompletos = contatosReguaPreenchidos === 4
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

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Kpi icon={<Home size={18} />} label="Unidades" value={String(unidades.length)} detail={`${unidadesAtivas} ativas`} />
        <Kpi icon={<Users size={18} />} label="Responsáveis" value={String(responsaveis.length)} detail={`${responsaveisAtivos} ativos`} />
        <Kpi icon={<Users size={18} />} label="Cobertura contatos" value={`${coberturaContato}%`} detail={`${contatosComTelefone} telefones · ${contatosComEmail} e-mails`} />
        <Kpi icon={<Users size={18} />} label="Contatos da régua" value={`${contatosReguaPreenchidos}/4`} detail={contatosReguaCompletos ? 'síndico e gerente completos' : 'complete síndico e gerente'} />
        <Kpi icon={<ClipboardList size={18} />} label="Importações" value={String(importacoes.length)} detail={ultimaImportacao ? `última em ${formatDateTime(ultimaImportacao.created_at)}` : 'sem importações'} />
        <Kpi icon={<Activity size={18} />} label="Eventos" value={String(eventos.length)} detail="auditoria operacional" />
      </section>

      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {ABAS_CONDOMINIO.map((aba) => (
          <Tab
            key={aba.id}
            href={aba.id === 'cadastro' ? `/app/condominios/${condominio.id}` : `/app/condominios/${condominio.id}?aba=${aba.id}`}
            icon={aba.icon}
            label={aba.label}
            active={abaAtiva === aba.id}
          />
        ))}
      </div>

      {['cadastro', 'cobranca', 'reguas'].includes(abaAtiva) ? <form action={updateCondominioIntegral} className="space-y-4">
        <input type="hidden" name="id" value={condominio.id} />
        <input type="hidden" name="aba" value={abaAtiva} />
        <HiddenCondominioFields condominio={condominio} activeTab={abaAtiva} />

        {abaAtiva === 'cadastro' ? <CollapsibleArea id="cadastro" title="Dados principais" description="Identificação, endereço, classificação e observações do condomínio." defaultOpen>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Carteira">
              <Select name="carteira_id" defaultValue={condominio.carteira_id ?? ''} required>
                <option value="" disabled>Selecione uma carteira</option>
                {carteiras.map((carteira: any) => (
                  <option key={carteira.id} value={carteira.id}>{carteira.nome}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Status"><Select name="status" defaultValue={condominio.status ?? 'ativo'}><option value="ativo">Ativo</option><option value="inativo">Inativo</option><option value="pausado">Pausado</option></Select></FormField>
            <FormField label="Nome oficial do condomínio"><Input name="nome" defaultValue={condominio.nome ?? ''} required /></FormField>
            <FormField label="Nome operacional"><Input name="nome_operacional" defaultValue={condominio.nome_operacional ?? ''} placeholder="Como a operação identifica este condomínio" /></FormField>
            <FormField label="CNPJ"><Input name="cnpj" defaultValue={condominio.cnpj ?? ''} /></FormField>
            <FormField label="Administradora"><Input name="administradora" defaultValue={condominio.administradora ?? ''} /></FormField>
            <FormField label="Máscara da unidade" hint="0 = número, A = letra, * = qualquer caractere. Em branco não bloqueia."><Input name="mascara_unidade" defaultValue={condominio.mascara_unidade ?? ''} placeholder="Ex.: 000000" className="uppercase" /></FormField>
            <FormField label="Máscara do bloco" hint="Será exigida na criação manual e na importação."><Input name="mascara_bloco" defaultValue={condominio.mascara_bloco ?? ''} placeholder="Ex.: 0 ou A" className="uppercase" /></FormField>
          </div>

          <div className={`space-y-4 rounded-3xl border p-4 ${contatosReguaCompletos ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
            <div>
              <p className="text-sm font-medium text-slate-950">Contatos para réguas</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Prontidão {contatosReguaPreenchidos}/4: e-mail e celular do síndico, e-mail e celular do gerente do condomínio.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="E-mail do síndico"><Input name="sindico_email" type="email" defaultValue={condominio.sindico_email ?? ''} placeholder="sindico@email.com" /></FormField>
              <FormField label="Celular do síndico"><Input name="sindico_celular" inputMode="tel" defaultValue={condominio.sindico_celular ?? ''} placeholder="(11) 99999-9999" /></FormField>
              <FormField label="E-mail do gerente"><Input name="gerente_email" type="email" defaultValue={condominio.gerente_email ?? ''} placeholder="gerente@email.com" /></FormField>
              <FormField label="Celular do gerente"><Input name="gerente_celular" inputMode="tel" defaultValue={condominio.gerente_celular ?? ''} placeholder="(11) 99999-9999" /></FormField>
            </div>
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
        </CollapsibleArea> : null}

        {abaAtiva === 'cobranca' ? <CollapsibleArea id="cobranca" title="Parâmetros operacionais" description="Cobrança, acordos e automações vinculadas." defaultOpen>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Dia de vencimento da cota"><Input name="vencimento_cota_dia" type="number" min="1" max="31" defaultValue={condominio.vencimento_cota_dia ?? 10} /></FormField>
            <FormField label="Valor médio da cota"><Input name="valor_cota_condominial" defaultValue={String(condominio.valor_cota_condominial ?? 0).replace('.', ',')} /></FormField>
            <FormField label="Início da cobrança após X dias"><Input name="inicio_cobranca_dias" type="number" min="0" max="365" defaultValue={condominio.inicio_cobranca_dias ?? 30} /></FormField>
            <FormField label="Dias de cobrança ativa" hint="Período em que a cobrança permanece disponível para acordos."><Input name="dias_cobranca_ativa" type="number" min="0" max="3650" defaultValue={condominio.dias_cobranca_ativa ?? 60} /></FormField>
            <FormField label="Parcelas permitidas sem aprovação do síndico"><Input name="parcelas_acordo_sem_aprovacao_sindico" type="number" min="0" max="120" defaultValue={condominio.parcelas_acordo_sem_aprovacao_sindico ?? 0} /></FormField>
            <FormField label="Dias para reemissão de parcela de acordo em atraso"><Input name="dias_reemissao_parcela_acordo_atrasada" type="number" min="0" max="365" defaultValue={condominio.dias_reemissao_parcela_acordo_atrasada ?? 0} /></FormField>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" name="pre_juridico_habilitado" defaultChecked={Boolean(condominio.pre_juridico_habilitado)} className="mt-1 h-4 w-4 rounded border-slate-300 accent-[var(--gkli-primary)]" /><span><span className="block font-medium text-slate-950">Enviar automaticamente ao Pré-Jurídico</span><span className="mt-1 block text-xs leading-5 text-slate-500">Após o prazo, envia apenas cobranças sem acordo. Desmarcado, a cobrança permanece como está.</span></span></label>
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

          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input type="checkbox" name="captacao_automatica_habilitada" defaultChecked={Boolean(condominio.captacao_automatica_habilitada)} className="mt-1 h-4 w-4 rounded border-slate-300 accent-[var(--gkli-primary)]" />
              <span><span className="block font-medium text-slate-950">Habilitar captação automática</span><span className="mt-1 block text-xs leading-5 text-slate-500">O agente coleta e converte o relatório, mas aguarda a validação do operador antes de importar cobranças.</span></span>
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2"><FormField label="Dia do mês" hint="Entre 1 e 28"><Input name="captacao_dia_mes" type="number" min="1" max="28" defaultValue={condominio.captacao_dia_mes ?? 10} /></FormField><FormField label="Horário mensal" hint="Fuso de São Paulo"><Input name="captacao_horario" type="time" defaultValue={String(condominio.captacao_horario ?? '08:00').slice(0, 5)} /></FormField></div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input type="checkbox" name="bloqueio_garantidora_habilitado" defaultChecked={Boolean(condominio.bloqueio_garantidora_habilitado)} className="mt-1 h-4 w-4 rounded border-slate-300 accent-[var(--gkli-primary)]" />
              <span><span className="block font-medium text-slate-950">Bloqueio Garantidora</span><span className="mt-1 block text-xs leading-5 text-slate-600">Cotas com competência dentro do período serão importadas como suspensas e não entrarão na régua de cobrança.</span></span>
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FormField label="Mês inicial"><Input name="bloqueio_garantidora_inicio" type="month" defaultValue={String(condominio.bloqueio_garantidora_inicio ?? '').slice(0, 7)} /></FormField>
              <FormField label="Mês final"><Input name="bloqueio_garantidora_fim" type="month" defaultValue={String(condominio.bloqueio_garantidora_fim ?? '').slice(0, 7)} /></FormField>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            <p className="font-semibold">Regras operacionais de acordos</p>
            <p className="mt-1">Acima do limite de parcelas, o sistema envia primeiro a aprovação pública ao síndico. Somente após esse aceite o termo é enviado ao devedor. Se os dias de reemissão forem 0, parcelas vencidas não poderão ser reemitidas pelo acompanhamento.</p>
          </div>

        </CollapsibleArea> : null}

        {abaAtiva === 'reguas' ? <CollapsibleArea id="reguas" title="Régua" description="Réguas de cobrança e acordos vinculadas ao condomínio." defaultOpen>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
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
        </CollapsibleArea> : null}
        <div className="flex justify-end gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><ButtonLink href="/app/condominios" variant="secondary">Cancelar</ButtonLink><Button type="submit">Salvar Condomínio Integral</Button></div>
      </form> : null}

      {abaAtiva === 'historico' ? <section id="historico" className="scroll-mt-24">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 p-5"><Badge tone="primary">Histórico</Badge><h2 className="mt-3 text-lg font-medium text-slate-950">Histórico operacional</h2><p className="mt-1 text-sm text-slate-500">Eventos do Condomínio Integral e importações recentes ficam concentrados aqui.</p></div>
          {eventos.length === 0 && importacoes.length === 0 ? <div className="p-5 text-sm text-slate-500">Nenhum histórico encontrado para este condomínio.</div> : (
            <div className="grid gap-5 p-5 xl:grid-cols-[1fr_.9fr]">
              <div className="space-y-3"><div className="flex items-center gap-2 text-sm text-slate-700"><FileClock size={16} className="text-[var(--gkli-primary)]" />Timeline de alterações</div>{eventos.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Rode a migration da Fase 2 para começar a registrar eventos de auditoria.</div> : <div className="space-y-3">{eventos.map((evento: any) => <TimelineItem key={evento.id} evento={evento} />)}</div>}</div>
              <div className="space-y-3"><div className="flex items-center gap-2 text-sm text-slate-700"><ClipboardList size={16} className="text-[var(--gkli-primary)]" />Importações relacionadas</div>{importacoes.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Nenhuma importação recente encontrada para a carteira deste condomínio.</div> : <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">{importacoes.map((importacao: any) => (<Link key={importacao.id} href={`/app/importacoes/${importacao.id}`} className="block p-4 transition hover:bg-slate-50"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-950">{importacao.arquivo_nome || 'Importação'}</p><p className="mt-1 text-xs text-slate-500">{importacao.tipo} · {formatDate(importacao.created_at)}</p><p className="mt-2 text-xs text-slate-500">{importacao.total_validas ?? 0} válidas · {importacao.total_invalidas ?? 0} inválidas</p></div><StatusBadge status={importacao.status} /></div></Link>))}</div>}</div>
            </div>
          )}
        </Card>
      </section> : null}

      {abaAtiva === 'auditoria' ? <section id="auditoria" className="scroll-mt-24">
        <Card className="space-y-4">
          <div><Badge tone="primary">Auditoria</Badge><h2 className="mt-3 text-lg font-medium text-slate-950">Alterações rastreadas</h2><p className="mt-1 text-sm text-slate-500">Na Fase 2, toda edição salva no Condomínio Integral registra usuário, data e campos alterados.</p></div>
          <div className="grid gap-3 md:grid-cols-3"><AuditInfo title="Quem alterou" text="Nome e e-mail do usuário autenticado." /><AuditInfo title="O que mudou" text="Campos antes/depois em JSON estruturado." /><AuditInfo title="Quando mudou" text="Linha do tempo ordenada por data." /></div>
        </Card>
      </section> : null}

      {abaAtiva === 'rankings' ? <section id="rankings" className="scroll-mt-24">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 p-5">
            <Badge tone="primary">Rankings</Badge>
            <h2 className="mt-3 text-lg font-medium text-slate-950">Rankings mensais</h2>
            <p className="mt-1 text-sm text-slate-500">Arquivos gerados pela captação/importação antes do recorte operacional das cobranças.</p>
          </div>
          {rankings.length === 0 ? (
            <div className="p-5 text-sm text-slate-500">Nenhum ranking mensal gerado para este condomínio.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rankings.map((ranking: any) => <RankingItem key={ranking.id} ranking={ranking} />)}
            </div>
          )}
        </Card>
      </section> : null}
    </div>
  )
}

function Kpi({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) { return <Card className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</p><p className="mt-3 text-3xl font-medium tracking-tight text-slate-950">{value}</p><p className="mt-1 text-sm text-slate-500">{detail}</p></div><div className="rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">{icon}</div></div></Card> }
function CollapsibleArea({ id, title, description, defaultOpen = false, children }: { id: string; title: string; description: string; defaultOpen?: boolean; children: React.ReactNode }) { return <details id={id} name="condominio-secoes" open={defaultOpen} className="group scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden"><div><p className="text-base font-semibold text-slate-950">{title}</p><p className="mt-1 text-sm text-slate-500">{description}</p></div><ChevronDown size={19} className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" /></summary><div className="space-y-5 border-t border-slate-100 p-5">{children}</div></details> }
function HiddenInput({ name, value }: { name: string; value: unknown }) {
  return <input type="hidden" name={name} value={String(value ?? '')} />
}

function HiddenCheckbox({ name, checked }: { name: string; checked: boolean }) {
  return checked ? <input type="hidden" name={name} value="on" /> : null
}

function HiddenCondominioFields({ condominio, activeTab }: { condominio: any; activeTab: CondominioAba }) {
  return <>
    {activeTab !== 'cadastro' ? <>
      <HiddenInput name="carteira_id" value={condominio.carteira_id} />
      <HiddenInput name="status" value={condominio.status ?? 'ativo'} />
      <HiddenInput name="nome" value={condominio.nome} />
      <HiddenInput name="nome_operacional" value={condominio.nome_operacional} />
      <HiddenInput name="cnpj" value={condominio.cnpj} />
      <HiddenInput name="administradora" value={condominio.administradora} />
      <HiddenInput name="mascara_unidade" value={condominio.mascara_unidade} />
      <HiddenInput name="mascara_bloco" value={condominio.mascara_bloco} />
      <HiddenInput name="sindico_email" value={condominio.sindico_email} />
      <HiddenInput name="sindico_celular" value={condominio.sindico_celular} />
      <HiddenInput name="gerente_email" value={condominio.gerente_email} />
      <HiddenInput name="gerente_celular" value={condominio.gerente_celular} />
      <HiddenInput name="endereco_logradouro" value={condominio.endereco_logradouro} />
      <HiddenInput name="endereco_numero" value={condominio.endereco_numero} />
      <HiddenInput name="endereco_complemento" value={condominio.endereco_complemento} />
      <HiddenInput name="endereco_bairro" value={condominio.endereco_bairro} />
      <HiddenInput name="endereco_cidade" value={condominio.endereco_cidade} />
      <HiddenInput name="endereco_uf" value={condominio.endereco_uf} />
      <HiddenInput name="endereco_cep" value={condominio.endereco_cep} />
      <HiddenInput name="classificacao_operacional" value={condominio.classificacao_operacional ?? 'prata'} />
      <HiddenInput name="observacoes" value={condominio.observacoes} />
    </> : null}
    {activeTab !== 'cobranca' ? <>
      <HiddenInput name="vencimento_cota_dia" value={condominio.vencimento_cota_dia ?? 10} />
      <HiddenInput name="valor_cota_condominial" value={String(condominio.valor_cota_condominial ?? 0).replace('.', ',')} />
      <HiddenInput name="inicio_cobranca_dias" value={condominio.inicio_cobranca_dias ?? 30} />
      <HiddenInput name="dias_cobranca_ativa" value={condominio.dias_cobranca_ativa ?? 60} />
      <HiddenInput name="parcelas_acordo_sem_aprovacao_sindico" value={condominio.parcelas_acordo_sem_aprovacao_sindico ?? 0} />
      <HiddenInput name="dias_reemissao_parcela_acordo_atrasada" value={condominio.dias_reemissao_parcela_acordo_atrasada ?? 0} />
      <HiddenCheckbox name="pre_juridico_habilitado" checked={Boolean(condominio.pre_juridico_habilitado)} />
      <HiddenCheckbox name="operacao_virtual_habilitada" checked={Boolean(condominio.operacao_virtual_habilitada)} />
      <HiddenCheckbox name="captacao_automatica_habilitada" checked={Boolean(condominio.captacao_automatica_habilitada)} />
      <HiddenInput name="captacao_dia_mes" value={condominio.captacao_dia_mes} />
      <HiddenInput name="captacao_horario" value={String(condominio.captacao_horario ?? '08:00').slice(0, 5)} />
      <HiddenCheckbox name="bloqueio_garantidora_habilitado" checked={Boolean(condominio.bloqueio_garantidora_habilitado)} />
      <HiddenInput name="bloqueio_garantidora_inicio" value={String(condominio.bloqueio_garantidora_inicio ?? '').slice(0, 7)} />
      <HiddenInput name="bloqueio_garantidora_fim" value={String(condominio.bloqueio_garantidora_fim ?? '').slice(0, 7)} />
    </> : null}
    {activeTab !== 'reguas' ? <>
      <HiddenInput name="regua_cobranca_id" value={condominio.regua_cobranca_id} />
      <HiddenInput name="regua_acordo_id" value={condominio.regua_acordo_id} />
    </> : null}
  </>
}

function Tab({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) { return <Link href={href} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${active ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`}>{icon}{label}</Link> }
function RankingItem({ ranking }: { ranking: any }) {
  const item = ranking.rankingMensal ?? {}
  return <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-slate-950">{item.competencia ? `Competência ${item.competencia}` : ranking.nome_arquivo || 'Ranking mensal'}</p>
        <StatusBadge status={ranking.status} />
      </div>
      <p className="mt-1 text-xs text-slate-500">{ranking.nome_arquivo || 'Arquivo da captação'} · gerado em {formatDateTime(item.geradoEm || ranking.atualizado_em || ranking.criado_em)}</p>
      <p className="mt-2 text-sm text-slate-600">{item.totalUnidades ?? 0} unidades · {formatCurrency(item.valorTotal ?? 0)}</p>
      {Array.isArray(item.resumoStatus) && item.resumoStatus.length ? <div className="mt-3 flex flex-wrap gap-2">{item.resumoStatus.map((status: any) => <span key={status.status} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{status.status}: {status.unidades}</span>)}</div> : null}
    </div>
    <ButtonLink href={`/api/captacao-automatizada/conversoes/${ranking.id}/ranking`} variant="secondary"><Download size={16} />Baixar ranking</ButtonLink>
  </div>
}
function AuditInfo({ title, text }: { title: string; text: string }) { return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-medium text-slate-900">{title}</p><p className="mt-2 text-sm text-slate-500">{text}</p></div> }
function TimelineItem({ evento }: { evento: any }) { const changes = Object.entries(evento.diferencas ?? {}); return <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="text-sm font-medium text-slate-950">{evento.titulo}</p><p className="mt-1 text-xs text-slate-500">{formatDateTime(evento.criado_em)} · {evento.usuario_nome || evento.usuario_email || 'Usuário'}</p>{evento.descricao ? <p className="mt-2 text-sm text-slate-600">{evento.descricao}</p> : null}</div><Badge tone="slate">{formatEventoTipo(evento.evento_tipo)}</Badge></div>{changes.length > 0 ? <div className="mt-4 grid gap-2 md:grid-cols-2">{changes.slice(0, 6).map(([field, change]: [string, any]) => <div key={field} className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><p className="uppercase tracking-[0.14em] text-slate-400">{formatField(field)}</p><p className="mt-2"><span className="text-slate-400">Antes:</span> {formatAuditValue(change?.antes)}</p><p className="mt-1"><span className="text-slate-400">Depois:</span> {formatAuditValue(change?.depois)}</p></div>)}</div> : null}</div> }
function formatEventoTipo(value?: string | null) { return value ? value.replaceAll('_', ' ') : 'evento' }
function formatField(value: string) { return value.replaceAll('_', ' ') }
function formatAuditValue(value: unknown) { if (value === null || value === undefined || value === '') return '-'; if (typeof value === 'boolean') return value ? 'sim' : 'não'; return String(value) }
function formatDate(value?: string | null) { if (!value) return '-'; return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) }
function formatDateTime(value?: string | null) { if (!value) return '-'; return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function formatCurrency(value: unknown) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0)) }

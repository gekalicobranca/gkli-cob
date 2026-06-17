import { notFound } from 'next/navigation'
import { ArrowLeft, Eye, PauseCircle, Plus, Save, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listCarteirasForSelect } from '@/features/cadastros/queries'
import { listTemplatesParaLote } from '@/features/lotes/queries'
import { getReguaOperacional } from '@/features/reguas/queries'
import { alternarEtapaRegua, atualizarReguaOperacional, excluirReguaOperacional, salvarEtapaRegua } from '@/features/reguas/actions'
import { TEMPLATE_CATEGORIES, categoryLabel } from '@/features/mensageria/render-template'
import { ReguaActionButton } from './regua-action-button'

export default async function ReguaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scope = await getPermittedCarteiras()
  const [regua, carteiras] = await Promise.all([
    getReguaOperacional(id, scope),
    listCarteirasForSelect(scope),
  ])

  if (!regua) notFound()

  const templates = await listTemplatesParaLote(scope, regua.carteira_id)
  const previewHref = regua.tipo === 'acordo' ? '/app/regua-acordo' : '/app/regua-cobranca'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mensageria · Editor de régua"
        title={regua.nome}
        description="Configure dados principais, etapas, delays, canal, template e ação operacional."
        actions={
          <>
            <ButtonLink href="/app/mensageria/reguas" variant="header"><ArrowLeft size={16} /> Voltar</ButtonLink>
            <ButtonLink href={previewHref} variant="header"><Eye size={16} /> Prévia</ButtonLink>
          </>
        }
      />

      <section className="space-y-5">
        <form action={atualizarReguaOperacional.bind(null, regua.id)}>
          <Card className="space-y-5">
            <div>
              <Badge tone={regua.tipo === 'acordo' ? 'blue' : 'primary'}>{regua.tipo === 'acordo' ? 'Acordos' : 'Cobrança'}</Badge>
              <h2 className="mt-3 text-lg font-semibold text-slate-950">Dados da régua</h2>
              <p className="mt-1 text-sm text-slate-500">Essa configuração pode ser usada como fallback ou vinculada ao condomínio.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(260px,1.4fr)_160px_minmax(220px,1fr)_150px_120px_150px]">
              <FormField label="Nome"><Input name="nome" defaultValue={regua.nome} required /></FormField>
              <FormField label="Tipo"><Select name="tipo" defaultValue={regua.tipo}><option value="cobranca">Cobrança</option><option value="acordo">Acordos</option></Select></FormField>
              <FormField label="Carteira"><Select name="carteira_id" defaultValue={regua.carteira_id ?? ''}><option value="">Global / fallback</option>{carteiras.map((carteira: any) => <option key={carteira.id} value={carteira.id}>{carteira.nome}</option>)}</Select></FormField>
              <FormField label="Status"><Select name="status" defaultValue={regua.status ?? 'ativa'}><option value="ativa">Ativa</option><option value="rascunho">Rascunho</option><option value="inativa">Inativa</option></Select></FormField>
              <FormField label="Prioridade"><Input name="prioridade" type="number" defaultValue={String(regua.prioridade ?? 0)} /></FormField>
              <FormField label="Padrão"><label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600"><input name="padrao" type="checkbox" defaultChecked={Boolean(regua.padrao)} className="h-4 w-4 rounded border-slate-300" /> Usar como padrão</label></FormField>
            </div>
            <FormField label="Descrição"><Textarea name="descricao" defaultValue={regua.descricao ?? ''} className="min-h-20" /></FormField>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <ReguaActionButton
                type="submit"
                form="excluir-regua-form"
                variant="danger"
                confirmMessage="Confirmar exclusão desta régua? Só será excluída se não houver etapas nem vínculos com condomínios."
                pendingLabel="Excluindo..."
              >
                <Trash2 size={16} /> Excluir régua
              </ReguaActionButton>
              <Button type="submit"><Save size={16} /> Salvar régua</Button>
            </div>
          </Card>
        </form>
        <form id="excluir-regua-form" action={excluirReguaOperacional.bind(null, regua.id)} />

        <Card className="space-y-5">
          <div>
            <Badge tone="primary">Nova etapa</Badge>
            <h2 className="mt-3 text-lg font-semibold text-slate-950">Adicionar etapa ao fluxo</h2>
            <p className="mt-1 text-sm text-slate-500">Use delay negativo para acordo preventivo, como D-2 antes do vencimento da parcela.</p>
          </div>
          <EtapaForm reguaId={regua.id} tipo={regua.tipo} templates={templates as any[]} />
        </Card>
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Etapas configuradas</h2>
          <p className="mt-1 text-sm text-slate-500">Ordem visual do fluxo. Desative uma etapa sem apagar histórico.</p>
        </div>
        {!regua.etapas?.length ? (
          <div className="p-6 text-sm text-slate-500">Nenhuma etapa criada. O motor continuará usando as etapas default até uma régua ativa possuir etapas.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {regua.etapas.map((etapa: any) => (
              <div key={etapa.id} className="grid gap-5 px-5 py-5 xl:grid-cols-[1fr_.9fr]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={etapa.ativo === false ? 'slate' : 'green'}>{etapa.ativo === false ? 'inativa' : 'ativa'}</Badge>
                    <Badge tone="primary">#{etapa.ordem}</Badge>
                    <Badge tone={etapa.tom === 'agressivo' ? 'red' : etapa.tom === 'leve' ? 'blue' : 'yellow'}>{etapa.tom ?? 'médio'}</Badge>
                    <Badge tone="blue">{categoryLabel(etapa.categoria_template)}</Badge>
                    <Badge tone="slate">D{Number(etapa.delay_dias) >= 0 ? '+' : ''}{etapa.delay_dias}</Badge>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-950">{etapa.nome || `Etapa ${etapa.ordem}`}</p>
                  <p className="mt-1 text-sm text-slate-500">{etapa.canal ?? 'whatsapp'} · {etapa.acao ?? 'enviar mensagem'} · {etapa.delay_referencia ?? 'vencimento'}</p>
                  <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{etapa.template}</p>
                  <form action={alternarEtapaRegua.bind(null, etapa.id, regua.id, etapa.ativo === false)} className="mt-3">
                    <Button type="submit" variant="secondary"><PauseCircle size={16} /> {etapa.ativo === false ? 'Reativar etapa' : 'Desativar etapa'}</Button>
                  </form>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-950">Editar etapa</p>
                  <div className="mt-4"><EtapaForm reguaId={regua.id} tipo={regua.tipo} templates={templates as any[]} etapa={etapa} compact /></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function EtapaForm({ reguaId, tipo, templates, etapa, compact = false }: { reguaId: string; tipo: string; templates: any[]; etapa?: any; compact?: boolean }) {
  const action = salvarEtapaRegua.bind(null, reguaId)
  const defaultReferencia = tipo === 'acordo' ? 'parcela' : 'vencimento'
  return (
    <form action={action} className="space-y-4">
      {etapa?.id ? <input type="hidden" name="etapa_id" value={etapa.id} /> : null}
      <div className={compact ? "grid gap-4 md:grid-cols-2" : "grid gap-4 lg:grid-cols-4"}>
        <FormField label="Nome"><Input name="nome" defaultValue={etapa?.nome ?? ''} placeholder="Ex.: Primeiro aviso" /></FormField>
        <FormField label="Ordem"><Input name="ordem" type="number" defaultValue={String(etapa?.ordem ?? 1)} /></FormField>
        <FormField label="Delay"><Input name="delay_dias" type="number" defaultValue={String(etapa?.delay_dias ?? 0)} /></FormField>
        <FormField label="Referência"><Select name="delay_referencia" defaultValue={etapa?.delay_referencia ?? defaultReferencia}><option value="vencimento">Vencimento da cobrança</option><option value="atraso">Dias em atraso</option><option value="parcela">Vencimento da parcela</option><option value="acordo">Data do acordo</option></Select></FormField>
        <FormField label="Canal"><Select name="canal" defaultValue={etapa?.canal ?? 'whatsapp'}><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="manual">Ação manual</option></Select></FormField>
        <FormField label="Intensidade"><Select name="tom" defaultValue={etapa?.tom ?? 'medio'}><option value="leve">Leve</option><option value="medio">Médio</option><option value="agressivo">Agressivo</option></Select></FormField>
        <FormField label="Ação"><Select name="acao" defaultValue={etapa?.acao ?? 'enviar_mensagem'}><option value="enviar_mensagem">Enviar mensagem</option><option value="gerar_pendencia">Gerar pendência</option><option value="acao_humana">Ação humana</option><option value="follow_up">Follow-up</option></Select></FormField>
        <FormField label="Situação do template"><Select name="categoria_template" defaultValue={etapa?.categoria_template ?? (tipo === 'acordo' ? 'lembrete_acordo' : 'cobranca_inicial')}>{TEMPLATE_CATEGORIES.map((categoria) => <option key={categoria} value={categoria}>{categoryLabel(categoria)}</option>)}</Select></FormField>
        <FormField label="Template fixo opcional"><Select name="template_id" defaultValue={etapa?.template_id ?? ''}><option value="">Resolver automático por carteira/situação</option>{templates.map((tpl: any) => <option key={tpl.id} value={tpl.id}>{tpl.nome} · {tpl.canal}</option>)}</Select></FormField>
        <FormField label="Horário início"><Input name="horario_inicio" type="time" defaultValue={etapa?.horario_inicio ?? '09:00'} /></FormField>
        <FormField label="Horário fim"><Input name="horario_fim" type="time" defaultValue={etapa?.horario_fim ?? '18:00'} /></FormField>
      </div>
      <FormField label="Fallback textual da etapa" hint="Opcional. Se não houver template fixo, o motor procura: carteira → global → fallback GKLI. Variáveis: {{carteira}}, {{responsavel}}, {{unidade}}, {{condominio}}, {{vencimento}}, {{valor}}, {{parcela_numero}}, {{valor_parcela}}.">
        <Textarea name="template" defaultValue={etapa?.template ?? ''} className={compact ? 'min-h-24' : 'min-h-28'} />
      </FormField>
      <input type="hidden" name="ativo" value="off" /><label className="inline-flex items-center gap-2 text-sm text-slate-600"><input name="ativo" type="checkbox" value="on" defaultChecked={etapa?.ativo !== false} className="h-4 w-4 rounded border-slate-300" /> Etapa ativa</label>
      <div className="flex justify-end"><Button type="submit"><Plus size={16} /> {etapa?.id ? 'Salvar etapa' : 'Adicionar etapa'}</Button></div>
    </form>
  )
}

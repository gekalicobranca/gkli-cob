import { CONDUCAO_PROCESSO } from '@/features/unidades/conducao-processo'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

export function ConducaoProcessoBadge({ unidade }: { unidade?: { acao_judicial?: boolean; conducao_processo?: string | null } | null }) {
  if (!unidade?.acao_judicial) return null
  const label = CONDUCAO_PROCESSO[unidade.conducao_processo as keyof typeof CONDUCAO_PROCESSO] ?? 'Não informado'
  return <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">Judicial · {label}</span>
}

export function ConducaoProcessoFields({ unidade = {} }: { unidade?: { conducao_processo?: string | null; advogado_externo_nome?: string | null; advogado_externo_contato?: string | null } }) {
  return <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
    <legend className="px-1 text-sm font-semibold text-slate-800">Condução do processo</legend>
    <FormField label="Quem conduz o processo" hint="Nosso escritório ou outro advogado mantém a unidade marcada com ação judicial.">
      <Select name="conducao_processo" defaultValue={unidade.conducao_processo ?? 'nao_informado'}>
        {Object.entries(CONDUCAO_PROCESSO).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select>
    </FormField>
    <FormField label="Nome do advogado externo (opcional)"><Input name="advogado_externo_nome" maxLength={200} defaultValue={unidade.advogado_externo_nome ?? ''} /></FormField>
    <FormField label="Contato do advogado externo (opcional)"><Input name="advogado_externo_contato" maxLength={300} defaultValue={unidade.advogado_externo_contato ?? ''} placeholder="E-mail ou telefone" /></FormField>
  </fieldset>
}

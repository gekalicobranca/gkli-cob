import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

export function OperadorField({ operadores, value, carteira = false }: {
  operadores: { id: string; nome: string }[]; value?: string | null; carteira?: boolean
}) {
  return <FormField label={carteira ? 'Operador padrão' : 'Operador do condomínio'} hint={carteira ? 'Responsável pelos condomínios sem operador específico. O vínculo não concede acesso à carteira.' : 'Em branco, utiliza automaticamente o operador da carteira.'}>
    <Select name="operador_id" defaultValue={value ?? ''}>
      <option value="">{carteira ? 'Sem operador padrão' : 'Usar operador da carteira'}</option>
      {value && !operadores.some(item => item.id === value) ? <option value={value}>Operador indisponível — selecione outro</option> : null}
      {operadores.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}
    </Select>
  </FormField>
}

export function GrupoField({ grupos, value }: { grupos: string[]; value?: string | null }) {
  return <FormField label="Grupo" hint="Selecione um grupo existente ou digite um novo. Ex.: nome do síndico profissional. Em branco, fica sem grupo.">
    <Input name="grupo" list="grupos-condominios" maxLength={120} defaultValue={value ?? ''} placeholder="Ex.: Síndico João" />
    <datalist id="grupos-condominios">{grupos.map(grupo => <option key={grupo} value={grupo} />)}</datalist>
  </FormField>
}

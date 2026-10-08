import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { proporAtendimentoKeila, aceitarAtendimentoKeila } from '@/features/keila/casos-actions'
import { solicitarBoletosKeila } from '@/features/keila/acordos'
import { proporAtendimentoLidia, aceitarAtendimentoLidia } from '@/features/lidia/actions'
import type { AgenteVirtualId } from '@/features/agentes-virtuais/perfis'
import type { KeilaCaso } from '@/features/keila/queries'

export function NegociacaoKeila({ caso, unidades, podeEditar, agenteId = 'keila' }: {
  agenteId?: AgenteVirtualId; caso: KeilaCaso; unidades: { id: string; identificacao: string; bloco: string | null }[]; podeEditar: boolean
}) {
  const liberado = podeEditar && caso.condominio?.operacao_virtual_habilitada && !['atendimento_humano', 'concluido'].includes(caso.payload.estado)
  const dinheiro = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const propor = agenteId === 'lidia' ? proporAtendimentoLidia : proporAtendimentoKeila
  const aceitar = agenteId === 'lidia' ? aceitarAtendimentoLidia : aceitarAtendimentoKeila
  const configurado = !!caso.condominio
  return <Card className="space-y-4 p-5"><h3 className="font-semibold">Propostas e acordos</h3>
    <p className="text-sm text-slate-600">Pedido de proposta: possível acordo. Aceite: acordo firmado. Pagamento confirmado: acordo efetivado.</p>
    <p className="text-sm">{configurado ? `Despesas: ${caso.condominio?.despesas_acordo_avista_percentual ?? 10}% à vista e ${caso.condominio?.despesas_acordo_parcelado_percentual ?? 20}% parcelado. Limite sem aprovação: ${caso.condominio?.parcelas_acordo_sem_aprovacao_sindico || 'livre'}.` : 'Condomínio não encontrado para este atendimento.'}</p>
    <p className="text-sm text-amber-800">As ações abaixo registram negociações reais e alteram as cobranças. Os valores vêm do cadastro atual do app; confira a atualização antes de apresentar a proposta. Nenhum e-mail é enviado.</p>
    {unidades.map(u => {
      const acordo = caso.payload.acordos?.find(a => a.unidade_id === u.id)
      return <section key={u.id} className="space-y-3 rounded-lg border p-3"><h4 className="font-medium">Unidade {u.identificacao}</h4>
        {acordo ? <><p className="text-sm">{acordo.exige_aprovacao ? 'Aguardando aprovação do condomínio' : acordo.etapa === 'possivel_acordo' ? 'Possível acordo' : acordo.etapa === 'acordo_firmado' ? 'Acordo firmado' : 'Acordo efetivado'} · {dinheiro(acordo.total)} · {acordo.percentual}% de despesas</p>
          {acordo.exige_aprovacao ? <p className="text-sm">Pedido acima do limite: encaminhar para aprovação do condomínio. Nenhum encaminhamento foi enviado.</p> : null}
          <ul className="text-sm">{acordo.parcelas.map(p => <li key={p.numero}>{p.numero}ª parcela: {dinheiro(p.valor)} · {p.vencimento.split('-').reverse().join('/')}</li>)}</ul>
          {acordo.etapa !== 'possivel_acordo' ? <><Link className="text-sm text-sky-700 underline" href={`/app/acordos/${acordo.id}`}>Acordo {acordo.id} · registrar pagamento na rotina financeira</Link>
            <details className="text-sm"><summary>Solicitação de cadastro e boletos à administradora</summary><p className="mt-3">Para: {acordo.destinatario || 'Confirmar o e-mail da cobrança da administradora antes do envio.'}</p><p>Cc: {acordo.cc.join('; ')}</p><p className="mt-2 font-medium">{acordo.assunto}</p><pre className="mt-3 whitespace-pre-wrap font-sans">{solicitarBoletosKeila(acordo, caso.condominio?.nome ?? '', 'equipe de cobrança', agenteId)}</pre></details></> : liberado && !acordo.exige_aprovacao ?
              <form action={aceitar} className="space-y-3"><input type="hidden" name="id" value={caso.id} /><input type="hidden" name="unidade_id" value={u.id} /><FormField label="Evidência do aceite recebido"><Textarea name="evidencia" aria-label="Evidência do aceite recebido" required maxLength={4000} placeholder="Resposta recebida, remetente e data. Não registre um aceite simulado." /></FormField><Button type="submit">Registrar aceite e firmar acordo</Button></form> : null}
        </> : null}
        {liberado && configurado && (!acordo || acordo.etapa === 'possivel_acordo') ? <form action={propor} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={caso.id} /><input type="hidden" name="unidade_id" value={u.id} />
          <FormField label="Quantidade de parcelas" hint="1 para pagamento à vista. Acima do limite, a proposta depende de aprovação."><Input name="parcelas" aria-label="Quantidade de parcelas" type="number" min="1" max="120" step="1" required defaultValue="1" /></FormField>
          <FormField label="Primeiro vencimento"><Input name="vencimento" aria-label="Primeiro vencimento" type="date" required /></FormField><Button type="submit" variant="secondary">{acordo ? 'Recalcular proposta' : 'Preparar proposta'}</Button>
        </form> : null}
      </section>
    })}
  </Card>
}

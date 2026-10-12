import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createAdminClient } from '@/utils/supabase/admin'
import { carregarFlowsWebmail, KEILA_WEBMAIL_URL } from '@/features/keila/webmail'
import { registrarWebmailKeila } from '@/features/keila/webmail-actions'
import { validarLinkWebmail } from '@/features/keila/webmail'
import type { KeilaEmail } from '@/features/keila/casos'

export function LinksWebmail({ emails }: { emails: KeilaEmail[] }) {
  const links = emails.flatMap(email => {
    try { const href = validarLinkWebmail(email.webmail_url ?? ''); return href ? [{ href, email }] : [] }
    catch { return [] }
  })
  return links.length ? <Card className="space-y-3 p-5"><h3 className="font-semibold">Conversas no webmail</h3>{links.map(({ href, email }) => <ButtonLink key={email.chave} href={href} target="_blank" rel="noopener noreferrer" variant="secondary">Abrir no Outlook · {email.remetente}</ButtonLink>)}</Card> : null
}

export async function WebmailKeila({ carteiraIds, podeEditar }: { carteiraIds: string[] | null; podeEditar: boolean }) {
  const { condominio, mensagens } = await carregarFlowsWebmail(createAdminClient(), carteiraIds)
  if (!condominio) return <Card className="p-5">Você não tem acesso ao piloto do Safira.</Card>
  return <Card className="space-y-4 p-5">
    <h2 className="text-lg font-semibold">Webmail da Keila · Piloto Safira</h2>
    <p className="text-sm text-slate-600">Abra a caixa keila@gekali.com.br, confira a conta conectada e localize a resposta. Selecione abaixo o e-mail original enviado pelo flow e registre o retorno para continuar o atendimento na Keila.</p>
    <ButtonLink href={KEILA_WEBMAIL_URL} target="_blank" rel="noopener noreferrer">Abrir webmail</ButtonLink>
    <p className="text-sm text-slate-500">Teste supervisionado. A leitura e o envio pelo navegador ainda são manuais; abrir o webmail não conecta a sessão ao app.</p>
    {podeEditar && mensagens.length ? <form action={registrarWebmailKeila} className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2"><FormField label="E-mail original do flow"><Select name="mensagem_id" aria-label="E-mail original do flow" required><option value="">Selecione o destinatário e o flow</option>{mensagens.map(m => <option key={m.id} value={m.id}>{m.destinatario} · {m.flow_nome} · {m.email_assunto}</option>)}</Select></FormField></div>
      <FormField label="Resposta recebida em (São Paulo)"><Input name="recebido_em" aria-label="Resposta recebida em (São Paulo)" type="datetime-local" required /></FormField>
      <FormField label="Link da mensagem no Outlook (opcional)"><Input name="webmail_url" aria-label="Link da mensagem no Outlook (opcional)" type="url" maxLength={4000} placeholder="https://outlook.office.com/..." /></FormField>
      <div className="md:col-span-2"><FormField label="Conteúdo da resposta recebida"><Textarea name="conteudo" aria-label="Conteúdo da resposta recebida" required maxLength={10000} rows={6} /></FormField></div>
      <Button type="submit">Registrar retorno e abrir atendimento</Button>
    </form> : <p className="text-sm text-slate-500">{podeEditar ? 'Nenhum e-mail enviado pelos flows do Safira disponível para registrar retorno.' : 'Seu perfil permite apenas consultar.'}</p>}
  </Card>
}

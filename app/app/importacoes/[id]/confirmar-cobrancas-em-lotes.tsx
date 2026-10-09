'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { confirmarImportacaoEmLotes } from '@/features/importacoes/actions'

type Props = { id: string; total: number; processadas: number; gravadas: number; retomada: boolean }

export function ConfirmarCobrancasEmLotes({ id, total, processadas, gravadas, retomada }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const rodando = useRef(false)
  const [progresso, setProgresso] = useState({ processadas, total, gravadas })
  const [erro, setErro] = useState('')
  const [iniciada, setIniciada] = useState(retomada)
  const exibido = { processadas: Math.max(processadas, progresso.processadas), total,
    gravadas: Math.max(gravadas, progresso.gravadas) }

  function confirmar(formData: FormData) {
    if (rodando.current) return
    rodando.current = true
    setErro('')
    setIniciada(true)
    startTransition(async () => {
      try {
        for (;;) {
          const resultado = await confirmarImportacaoEmLotes(formData)
          if ('erro' in resultado) {
            setErro(resultado.erro)
            break
          }
          setProgresso(resultado)
          if (resultado.concluida) {
            router.refresh()
            break
          }
        }
      } catch {
        setErro('A conexão foi interrompida. O progresso foi salvo. Atualize a página e use Retomar importação; a limpeza não será repetida.')
      } finally {
        rodando.current = false
      }
    })
  }

  return (
    <form id="confirmar-importacao-form" action={confirmar} className="max-w-md space-y-2">
      <input type="hidden" name="importacao_id" value={id} />
      <Button type="submit" disabled={pending} loading={pending} loadingLabel="Importando...">
        {iniciada ? 'Retomar importação' : 'Confirmar importação'}
      </Button>
      {!pending && iniciada && <Button type="button" variant="secondary" onClick={() => router.refresh()}>Atualizar progresso</Button>}
      {(iniciada || gravadas > 0) && (
        <div role="status" aria-live="polite" className="text-sm">
          <p>{exibido.processadas} de {exibido.total} linhas conferidas · {exibido.gravadas} cobranças gravadas.</p>
          <progress value={exibido.processadas} max={Math.max(1, exibido.total)} className="mt-1 h-2 w-full" aria-label="Linhas conferidas" />
          <p className="text-xs">{pending ? 'Mantenha esta página aberta. O progresso é salvo a cada lote.' : 'A importação ainda não foi concluída. A retomada preserva as cobranças já gravadas.'}</p>
        </div>
      )}
      {erro && <p role="alert" className="rounded-lg bg-white p-3 text-sm text-rose-800">{erro}</p>}
    </form>
  )
}

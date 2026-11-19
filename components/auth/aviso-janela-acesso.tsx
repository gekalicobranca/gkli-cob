'use client'

import { useEffect } from 'react'
import { CAMINHO_AVISO_ACESSO, FIM_JANELA_ACESSO, INICIO_JANELA_ACESSO } from '@/utils/auth/janela-acesso'

export function AvisoJanelaAcesso() {
  useEffect(() => {
    const conferirHorario = () => {
      const agora = Date.now()
      if (agora >= INICIO_JANELA_ACESSO && agora < FIM_JANELA_ACESSO) {
        window.location.replace(CAMINHO_AVISO_ACESSO)
      }
    }
    const timer = window.setTimeout(conferirHorario, Math.max(0, INICIO_JANELA_ACESSO - Date.now()))
    window.addEventListener('focus', conferirHorario)
    window.addEventListener('pageshow', conferirHorario)
    document.addEventListener('visibilitychange', conferirHorario)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', conferirHorario)
      window.removeEventListener('pageshow', conferirHorario)
      document.removeEventListener('visibilitychange', conferirHorario)
    }
  }, [])
  return null
}

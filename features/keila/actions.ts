'use server'

import { redirect } from 'next/navigation'

// Compatibilidade com atalhos antigos: a Keila acompanha atendimentos.
// Preparação e disparo de cobranças pertencem aos flows.
function abrirAtendimentos() {
  redirect('/app/gestao/keila')
}
export async function validarFilaKeila() { abrirAtendimentos() }
export async function prepararLotesKeila() { abrirAtendimentos() }
export async function prepararAcordosNegociacaoKeila() { abrirAtendimentos() }
export async function ativarKeilaAutonoma() { abrirAtendimentos() }

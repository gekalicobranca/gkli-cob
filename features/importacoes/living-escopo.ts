const livingId = 'cb988811-e0ea-45d6-990b-6476271eb109'
const segmentos = [
  { codigo: '1679', blocos: [] }, { codigo: '1680', blocos: ['A', 'B'] },
  { codigo: '1681', blocos: ['C'] }, { codigo: '1682', blocos: ['LJ'] }, { codigo: '1683', blocos: [] },
]
export function escopoLiving(buffer: Buffer, condominioId: string) {
  if (condominioId !== livingId) return null
  const marker = buffer.toString('latin1').match(/<!--GKLI_LIVING:([A-Za-z0-9+/=]+)-->/)?.[1]
  if (!marker) throw new Error('Living Wellness exige coleta completa dos cinco subcondomínios antes da importação.')
  const manifest = JSON.parse(Buffer.from(marker, 'base64').toString('utf8'))
  if (!Array.isArray(manifest) || manifest.length !== segmentos.length || new Set(manifest.map(s => s.codigo)).size !== segmentos.length || segmentos.some(s => !manifest.some(m => m.codigo === s.codigo && JSON.stringify(m.blocos) === JSON.stringify(s.blocos)))) throw new Error('Escopo Living Wellness inválido ou incompleto.')
  return { segmentosCaptacao: manifest, escopoBlocosMaestro: segmentos.flatMap(s => s.blocos) }
}

import { lerAnaliseOriginal } from '../condominios/relatorio-inadimplencia/leitura'
import { somarValores } from '../condominios/relatorio-inadimplencia/modelo'

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

export function lerAnaliseLiving(buffer: Buffer, arquivo: string) {
  escopoLiving(buffer, livingId)
  const partes = buffer.toString('latin1').split(/(?=<div><table\b)/i).filter(p => /^<div><table/i.test(p))
  const analises = partes.map(p => {
    const codigo = p.match(/Condom.nio:\s*(\d+)\s*-/i)?.[1]
    if (!segmentos.some(s => s.codigo === codigo)) throw new Error('Subcondomínio desconhecido na análise Living Wellness.')
    const a = lerAnaliseOriginal(Buffer.from(p, 'latin1'), arquivo)
    if (!a) return null
    // O leitor numera linhas a partir de zero em cada relatório.
    return { ...a, recibos: a.recibos.map(r => ({ ...r, id: `${codigo}:${r.id}` })),
      itens: a.itens.map(i => ({ ...i, reciboId: `${codigo}:${i.reciboId}` })) }
  }).filter(a => a !== null)
  if (!analises.length) return lerAnaliseOriginal(buffer, arquivo)
  if (new Set(analises.map(a => a.dataBase)).size !== 1) throw new Error('Datas divergentes nos subcondomínios Living Wellness.')
  const recibos = analises.flatMap(a => a.recibos)
  if (new Set(recibos.map(r => r.id)).size !== recibos.length) throw new Error('Recibos duplicados nos subcondomínios Living Wellness.')
  return { ...analises[0], condominioFonte: 'LIVING WELLNESS ACLIMACAO — CONSOLIDADO', recibos,
    itens: analises.flatMap(a => a.itens), totais: somarValores(recibos),
    observacoes: [...new Set(analises.flatMap(a => a.observacoes))] }
}

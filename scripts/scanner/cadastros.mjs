import { classificarContatos } from '../../lib/core/telefone.ts'

export function documentoValido(raw) {
 const numero=String(raw??'').replace(/\D/g,'')
 if(![11,14].includes(numero.length)||/^(\d)\1+$/.test(numero))return null
 const digito=(base,pesos)=>{const resto=base.split('').reduce((s,d,i)=>s+Number(d)*pesos[i],0)%11;return resto<2?'0':String(11-resto)}
 if(numero.length===11){
  const base=numero.slice(0,9),a=digito(base,[10,9,8,7,6,5,4,3,2]),b=digito(base+a,[11,10,9,8,7,6,5,4,3,2])
  return numero===base+a+b?numero:null
 }
 const base=numero.slice(0,12),a=digito(base,[5,4,3,2,9,8,7,6,5,4,3,2]),b=digito(base+a,[6,5,4,3,2,9,8,7,6,5,4,3,2])
 return numero===base+a+b?numero:null
}

export function contatoPrincipal(dados, unidade) {
 if(dados?.unidade!==unidade || !Array.isArray(dados.fichas))throw Error('Contato sem identificação de unidade válida.')
 const fichas=dados.fichas.filter(f=>f.Unidade===unidade)
 if(fichas.length!==1)throw Error('Ficha principal ambígua.')
 const ficha=fichas[0],nome=String(ficha.Nome??'').replace(/\s+/g,' ').trim()
 if(!nome)throw Error('Ficha principal sem responsável.')
 const telefones=Object.entries(ficha).filter(([k])=>/^(telefone|celular|fone)/i.test(k)).map(([,v])=>v)
 const contatos=classificarContatos(...telefones)
 const emails=String(ficha.Email??'').split(/[\s;,|]+/).filter(v=>/^[^@<>\s]+@[^@<>\s]+\.[^@<>\s]+$/.test(v)).map(v=>v.toLowerCase())
 return {nome,documento:documentoValido(ficha.CPF)||documentoValido(ficha.CNPJ),telefone:[contatos.celular,contatos.telefone_fixo].filter(Boolean).join(' | ')||null,celular:contatos.celular,telefone_fixo:contatos.telefone_fixo,telefone_outros:null,email:[...new Set(emails)].join(' | ')||null}
}

export async function enriquecerPendentes(db, limite=10) {
 const {data,error}=await db.from('scanner_evidencias').select('id,unidade_portal,dados').eq('tipo','contatos').eq('cadastro_status','pendente').order('coletado_em',{ascending:false}).order('id').limit(limite)
 if(error)throw Error('Não foi possível consultar os cadastros pendentes do scanner.')
 const resumo={analisados:0,atualizados:0,pendentes:0}
 for(const e of data){
  let contato
  try{contato=contatoPrincipal(e.dados,e.unidade_portal)}catch{
   const {error:me}=await db.from('scanner_evidencias').update({cadastro_status:e.dados?.status==='revisao_vinculo'?'revisao_vinculo':'revisao_formato'}).eq('id',e.id).eq('cadastro_status','pendente')
   if(me)throw Error('Não foi possível registrar o cadastro que exige revisão.')
   resumo.pendentes++;continue
  }
  const {data:aplicado,error:ae}=await db.rpc('scanner_aplicar_contato',{p_evidencia:e.id,p_contato:contato})
  if(ae){
   if(!['23505','23514','23503','P0001'].includes(ae.code))throw Error('Não foi possível aplicar contato do scanner; evidência preservada para retomada.')
   const {error:re}=await db.from('scanner_evidencias').update({cadastro_status:'revisao_aplicacao'}).eq('id',e.id).eq('cadastro_status','pendente')
   if(re)throw Error('Não foi possível registrar conflito de cadastro; retomada necessária.')
   console.error(JSON.stringify({cadastro_evidencia:e.id,codigo:ae.code,status:'revisao_aplicacao'}));resumo.pendentes++;continue
  }
  resumo.analisados++;if(aplicado?.resultado==='atualizado')resumo.atualizados++;else if(aplicado?.resultado?.startsWith('revisao'))resumo.pendentes++
 }
 return resumo
}

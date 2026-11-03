export const PIQUERI='29f34694-09fb-4cfa-8fb6-c613a30c4813'
export const excluirPiqueri=c=>c?.id===PIQUERI||/piqueri/i.test(c?.nome??'')
const mesValido=s=>/^\d{4}-(0[1-9]|1[0-2])$/.test(s)
function mes(s){const m=String(s??'').match(/^(\d{4})-(\d{2})/);if(m&&mesValido(m[0].slice(0,7)))return m[0].slice(0,7);const b=String(s??'').match(/^(?:\d{2}\/)?(\d{2})\/(\d{4})$/);return b&&mesValido(b[2]+'-'+b[1])?b[2]+'-'+b[1]:null}
const centavos=v=>v!=null&&v!==''&&Number.isFinite(Number(v))?Math.round(Number(v)*100):null
const paga=p=>['paga','pago','quitada','quitado'].includes(p.status)||Boolean(p.data_pagamento)
const cancelada=p=>['cancelada','cancelado'].includes(p.status)

// Somente trechos explicitamente identificados no app; não usa cronograma de parcelas.
export function periodoNegociado(acordo){
 const texto=[acordo.observacoes,acordo.observacao_operacional].filter(Boolean).join('\n').replaceAll('\\n','\n')
 const trechos=[...texto.matchAll(/(?:per[ií]odo(?:\s+negociado|\s+da\s+d[ií]vida|\s+de\s+d[eé]bito)?|compet[eê]ncias negociadas(?: exclusivamente)?)\s*:?\s*(\d[^\n.;|]*)/gi)].map(m=>m[1].trim())
 const conjuntos=[]
 for(const t of trechos){
  const tokens=[...t.matchAll(/(?:\d{2}\/)?(?:0[1-9]|1[0-2])\/\d{4}|\d{4}-(?:0[1-9]|1[0-2])/g)]
  if(!tokens.length)continue
  const meses=new Set();let invalido=false
  for(let i=0;i<tokens.length;i++){
   const atual=mes(tokens[i][0]);if(!atual)continue;meses.add(atual)
   const prox=tokens[i+1],entre=prox?t.slice(tokens[i].index+tokens[i][0].length,prox.index).trim():''
   if(prox&&/^(?:a|at[eé]|[-–])$/i.test(entre)){
    const final=mes(prox[0]);if(!final||final<atual){invalido=true;continue}
    let ano=Number(atual.slice(0,4)),m=Number(atual.slice(5));let n=0
    while(`${ano}-${String(m).padStart(2,'0')}`<=final&&n++<240){meses.add(`${ano}-${String(m).padStart(2,'0')}`);if(++m===13){m=1;ano++}}
    if(n>=240)invalido=true
   }
  }
  conjuntos.push(invalido?[]:[...meses].sort())
 }
 const distintos=[...new Set(conjuntos.map(xs=>xs.join(',')))]
 return {trechos,meses:distintos.length===1?conjuntos[0]:[],divergente:distintos.length>1}
}

export function revisarAcordo({acordo:a,condominio:c,unidade:u,parcelas=[],cotas=[],relacoes=[],fontes=[],baixas=[],evidencias=[],hoje}){
 if(excluirPiqueri(c)||a.condominio_id===PIQUERI||!['quebrado','rompido'].includes(a.status))return null
 const escopo=x=>x.condominio_id===a.condominio_id&&x.carteira_id===a.carteira_id&&x.unidade_id===a.unidade_id
 const periodo=periodoNegociado(a),disponiveis=cotas.filter(escopo).map(c=>({...c,recibo_registrado_app:String(c.observacoes??'').match(/\brecibo\s*[:#]?\s*(\d{5,15})\b/i)?.[1]??null})),ids=new Set([a.cobranca_id,...relacoes.filter(x=>x.acordo_id===a.id).map(x=>x.cobranca_id)].filter(Boolean))
 const vinculadas=disponiveis.filter(x=>ids.has(x.id)),ausentes=[...ids].filter(id=>!vinculadas.some(x=>x.id===id))
 const candidatas=disponiveis.filter(x=>!ids.has(x.id)&&periodo.meses.includes(mes(x.competencia)||mes(x.vencimento)))
 const categoria=ids.size?(ausentes.length?'vinculo_explicito_pendente_escopo':'com_vinculo_explicito'):!disponiveis.length?'sem_cotas_cadastradas':!periodo.meses.length?'sem_periodo_inequivoco':candidatas.length?'candidatas_por_periodo':'cotas_fora_do_periodo'
 const faltantes=['Situação atual da administradora com identificação exata do contrato/processo administrativo.','Cronograma completo e reemissões validados na administradora.','Recibos e datas efetivas de cada pagamento, distinguindo cotas e parcelas.','Composição documental dos abatimentos, encargos, descontos e honorários por cota.','Saldo residual por cota expressamente informado pela administradora.']
 if(!vinculadas.length)faltantes.push('Cotas de origem com vínculo documental explícito; candidatas por período não o substituem.')
 if(a.tipo==='judicial')faltantes.push('Revisão judicial humana obrigatória.')
 if(laudoHistoricoEstimado(a))faltantes.push('Datas/pagamentos históricos estimados no cadastro: exigir comprovação efetiva sem substituir o histórico.')
 if(!u||u.condominio_id!==a.condominio_id||u.carteira_id!==a.carteira_id)faltantes.push('Identidade/carteira atuais da unidade divergentes ou não localizadas.')
 if(ausentes.length)faltantes.push('Vínculos do app apontam cotas ausentes ou fora da mesma unidade, condomínio e carteira.')
 if(a.quantidade_parcelas!=null&&Number(a.quantidade_parcelas)!==parcelas.filter(p=>p.tipo_parcela!=='entrada'&&p.numero!==0).length)faltantes.push(`Grade do app possui ${parcelas.length} linhas; quantidade declarada ${a.quantidade_parcelas}. Conferir entrada, reemissões e parcelas ausentes sem reconstruir a sequência.`)
 const confirmados=baixas.filter(b=>b.acordo_id===a.id&&escopo(b)&&b.recibo&&b.data_pagamento&&b.evidencia_sha256&&Number(b.valor_pago_centavos)>0)
 const idsAdm=fontes.filter(f=>f.acordo_id===a.id&&escopo(f)).map(f=>({identificador:f.numero_acordo,tipo:'acordo_administradora',fonte:'acordos_fontes_lello',registrado_em:f.criado_em,confirmacao_atual:false}))
 const bbz=String(a.observacoes??'').match(/\[BBZ:(\d+):(\d+)\]/)
 if(bbz)idsAdm.push({identificador:bbz[2],codigo_condominio:bbz[1],tipo:'processo_administrativo',fonte:'observacoes_app',confirmacao_atual:false})
 for(const m of String(a.observacoes??'').matchAll(/processo\s+(?:administrativo|interno)\s+(\d{5,20})/gi))if(!idsAdm.some(x=>x.identificador===m[1]))idsAdm.push({identificador:m[1],tipo:'processo_administrativo',fonte:'observacoes_app',confirmacao_atual:false})
 for(const m of String(a.observacoes??'').matchAll(/\[(?:BBZ|Manager):\d+:(\d+)\]/gi))if(!idsAdm.some(x=>x.identificador===m[1]))idsAdm.push({identificador:m[1],tipo:'processo_administrativo',fonte:'observacoes_app',confirmacao_atual:false})
 for(const m of String(a.observacoes??'').matchAll(/processo da administradora\s*:\s*(\d{5,20})/gi))if(!idsAdm.some(x=>x.identificador===m[1]))idsAdm.push({identificador:m[1],tipo:'processo_administrativo',fonte:'observacoes_app',confirmacao_atual:false})
 const numero=String(a.numero_processo??'').trim(),cnj=/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(numero)?numero:null
 return {acordo_id:a.id,condominio_id:a.condominio_id,unidade_id:a.unidade_id,carteira_id:a.carteira_id,condominio:c?.nome??'Não localizado',administradora:c?.administradora??null,unidade:u?.identificacao??null,bloco:u?.bloco??null,tipo:a.tipo,situacao_app:a.status,situacao_administradora:null,identificadores_administrativos:idsAdm,cnj_formato:cnj,numero_processo_app:numero||null,total_contratado_centavos:centavos(a.valor_acordado),pagamentos_confirmados:confirmados,valor_pagamentos_confirmados_centavos:confirmados.length?confirmados.reduce((s,b)=>s+Number(b.valor_pago_centavos),0):null,parcelas_marcadas_pagas_app:parcelas.filter(paga),valor_nominal_parcelas_pagas_app_centavos:parcelas.filter(paga).reduce((s,p)=>s+(centavos(p.valor)??0),0),parcelas_vencidas:parcelas.filter(p=>!paga(p)&&!cancelada(p)&&p.vencimento<hoje),cronograma_app:parcelas,cotas_referenciadas_app:[...ids],cotas_abrangidas_app:vinculadas,cotas_vinculos_invalidos:ausentes,cotas_candidatas_sem_vinculo:candidatas,periodo_negociado_app:periodo,categoria_cotas:categoria,saldo_residual_confirmado_centavos:null,estado:'pendente_documentos',faltantes,providencia_proposta:'Obter o dossiê da administradora, conciliar cada pagamento e saldo por cota e submeter as conclusões à revisão humana; manter classificação e bloqueios até evidência suficiente.',fontes_historicas_app:[...String(a.observacoes??'').replaceAll('\\n','\n').matchAll(/Fonte:\s*([^\n|]+)/gi)].map(m=>m[1].slice(0,1000)),fontes:[{origem:'banco_atual',tabela:'acordos',id:a.id,atualizado_em:a.updated_at},...evidencias.map(e=>({origem:'scanner_evidencias',id:e.id,consultado_em:e.observado_em,sha256:e.sha256,fonte:e.dados?.fonte??null,diagnostico:e.dados?.diagnostico??null,alcance:'Referência parcial; não comprova dossiê completo ou saldo residual.'}))],alteracoes_realizadas:[],baixa_permitida:false,liberar_cotas:false}
}
function laudoHistoricoEstimado(a){return /estimad|reconstru[ií]d|presumid/i.test([a.observacoes,a.observacao_operacional].join(' '))}

export function resumirRevisao(casos){
 const r={total:casos.length,conciliados:0,pendentes_documentos:casos.length,dependentes_aprovacao_humana:0,com_vinculo:0,sem_vinculo:0,vinculos_escopo_conferido:0,vinculos_escopo_pendente:0,categorias_sem_vinculo:{},alteracoes:0}
 for(const c of casos){
  if(c.cotas_referenciadas_app.length){r.com_vinculo++;r[c.cotas_vinculos_invalidos.length?'vinculos_escopo_pendente':'vinculos_escopo_conferido']++}
  else{r.sem_vinculo++;r.categorias_sem_vinculo[c.categoria_cotas]=(r.categorias_sem_vinculo[c.categoria_cotas]??0)+1}
 }
 return r
}

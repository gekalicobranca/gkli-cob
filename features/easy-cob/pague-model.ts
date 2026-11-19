import type {ParcelaEasyPague} from './pague-server';
import {dataCivilValida} from '@/lib/core/data-civil';

export function estadoConsultaPague(parcela:ParcelaEasyPague){
  if(parcela.resultado?.estado==='confirmado'){
    const data=parcela.resultado.data_pagamento;
    return data&&dataCivilValida(data)?`Confirmação encontrada na consulta em ${data.split('-').reverse().join('/')}`:'Confirmação encontrada na consulta; confira a evidência no acordo';
  }
  if(parcela.estado==='fila')return 'Pedido aceito na fila; consulta ainda não concluída';
  if(parcela.estado==='consultando')return 'Consulta em andamento';
  if(parcela.estado==='falha')return 'Consulta indisponível; confira pelos canais da administradora';
  if(parcela.estado==='concluido')return 'Consulta concluída sem confirmação suficiente de pagamento';
  return parcela.configuracao_id?'Aguardando solicitação de consulta':'Consulta automática indisponível; confira com a administradora';
}

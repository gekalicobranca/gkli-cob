import {criarRascunhoWhatsApp} from './whatsapp-rascunho'
import {normalizarCelular} from '../../lib/core/telefone'

export type FalhaEmailKeila={id:string;destinatario:string;classificacao:'inexistente'|'temporaria'|'revisao';motivo:string;recebido_em:string;outlook_url:string}

/** Aviso de contato, sem saldo, proposta financeira ou promessa de reenvio. */
export function montarAvisoFalhaEmail(falha:FalhaEmailKeila,nome:string,telefone:string|null){
 if(falha.classificacao==='revisao')return {pendencia:'Revisar o diagnóstico de entrega antes de preparar o contato por WhatsApp.'}
 const celular=(telefone??'').replace(/\D/g,'')
 if(!/^55\d{2}9\d{8}$/.test(celular)||!normalizarCelular(celular))return {pendencia:'Conferir um celular com DDD no cadastro da unidade para contato por WhatsApp.'}
 const primeiroNome=nome.trim().split(/\s+/)[0]
 const saudacao=primeiroNome?`Olá, ${primeiroNome}!`:'Olá!'
 const falhaTexto=falha.classificacao==='inexistente'
  ?'o serviço de e-mail informou que esse endereço não foi encontrado.'
  :/4\.2\.2|5\.2\.2|quota|out of storage|mailbox full|caixa.*cheia/i.test(falha.motivo)
   ?'recebemos um aviso de que a caixa de entrada está sem espaço.'
   :'recebemos um aviso de falha temporária na entrega.'
 const texto=`${saudacao} Aqui é a Keila, da GEKALI.\n\nTentamos enviar uma mensagem para ${falha.destinatario}, mas ${falhaTexto}\n\nVocê pode confirmar seu e-mail de contato ou informar um endereço atualizado?\n\nObrigada!`
 return {rascunho:criarRascunhoWhatsApp(celular,texto)}
}

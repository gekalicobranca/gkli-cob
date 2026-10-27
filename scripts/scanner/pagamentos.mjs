import { interpretarLelloRecebimentos } from '../acordos-portais/lello-recebimentos-parser.mjs'
// Inconsistência financeira exige conferência; nunca é convertida em quitação.
export function interpretarDocumentoScanner(tabelas, escopo) {
 try{return {ok:true,resultado:interpretarLelloRecebimentos(tabelas,escopo)}}
 catch(error){return {ok:false,motivo:String(error.message)}}
}

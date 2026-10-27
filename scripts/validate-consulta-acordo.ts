import assert from 'node:assert/strict';
import { test } from 'node:test';
import { repasseConsulta, resumoRepassesConsulta } from '../features/acordos/consulta-financeira';

test('repasse informado prevalece e zero explícito é preservado',()=>{
  const acordo={despesa_cobranca_valor:100,valor_acordado:1000,despesa_cobranca_percentual:20};
  assert.equal(repasseConsulta(acordo,{valor:500,valor_repasse_informado:47.58}).valor,47.58);
  assert.equal(repasseConsulta(acordo,{valor:500,valor_repasse_informado:0}).valor,0);
  assert.equal(repasseConsulta(acordo,{valor:500}).valor,50);
});
test('repasse sem fonte permanece desconhecido e aparece nas pagas pendentes',()=>{
  assert.equal(repasseConsulta({}, {valor:200}).valor,null);
  const result=resumoRepassesConsulta({},[{id:'1',valor:200,status:'paga',valor_repasse_informado:null}]);
  assert.equal(result.semRepassePagas,1); assert.equal(result.semRepasse,1);
});
test('agrupamento não duplica parcelas e canceladas não aumentam repasse',()=>{
  const paga={id:'1',valor:100,status:'paga',valor_repasse_informado:12.34};
  const result=resumoRepassesConsulta({},[paga,paga,{id:'2',valor:100,status:'cancelada',valor_repasse_informado:50}]);
  assert.equal(result.total,12.34); assert.equal(result.pagos,12.34); assert.equal(result.parcelas,1);
});

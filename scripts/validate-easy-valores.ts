import assert from 'node:assert/strict';
import { test } from 'node:test';
import { valorCotaParaAcordo } from '../features/acordos/valor-cota';
import { calcularDespesasAcordo } from '../features/acordos/calculo-despesas';

test('cota inclui encargos discriminados quando o total ainda é o principal', () => {
  assert.equal(valorCotaParaAcordo({ valor_original: 1000, valor_atualizado: 1000, juros: 30, multa: 20 }), 1050);
  assert.equal(valorCotaParaAcordo({ valor_original: 1000, juros: 30, multa: 20, correcao: 5, desconto: 10 }), 1045);
});

test('total atualizado da administradora não recebe os encargos novamente', () => {
  assert.equal(valorCotaParaAcordo({ valor_original: 1000, valor_atualizado: 1050, juros: 30, multa: 20 }), 1050);
});

test('à vista sem juros Price; parcelamento com 1% e custo por boleto fora dos juros', () => {
  const itens = [{ id: 'cota', valor: 1050 }];
  const avista = calcularDespesasAcordo(itens, [], 10, 0, { quantidadeParcelas: 1, entrada: 0, jurosAdicional: false, custoEmissaoBoleto: 4.8 });
  assert.equal(avista.jurosAdicional, 0);
  assert.equal(avista.total, 1159.8);
  const semBoleto = calcularDespesasAcordo(itens, [], 10, 0, { quantidadeParcelas: 3, entrada: 0, jurosAdicional: true });
  const parcelado = calcularDespesasAcordo(itens, [], 10, 0, { quantidadeParcelas: 3, entrada: 0, jurosAdicional: true, custoEmissaoBoleto: 4.8 });
  assert.ok(parcelado.jurosAdicional > 0);
  assert.equal(parcelado.jurosAdicional, semBoleto.jurosAdicional);
  assert.equal(parcelado.custoBoletos, 14.4);
  assert.equal(Math.round(parcelado.parcelas.reduce((sum, p) => sum + p.valor, 0) * 100), Math.round(parcelado.total * 100));
});

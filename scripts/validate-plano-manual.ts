import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerPlanoManual, ratearTotalManual } from '../features/acordos/plano-manual';

const plano = [{ numero: 1, valor: '100,01', vencimento: '2027-01-17' }, { numero: 2, valor: '200,02', vencimento: '2027-03-29' }];
test('valores e vencimentos manuais preservados sem recalcular mensalidades', () => {
  assert.deepEqual(lerPlanoManual(JSON.stringify(plano), 2), { total: 300.03, parcelas: [
    { numero: 1, valor: 100.01, vencimento: '2027-01-17' }, { numero: 2, valor: 200.02, vencimento: '2027-03-29' },
  ] });
  assert.equal(lerPlanoManual(null, 2), null);
});
test('recusa datas, valores e quantidade adulterados no servidor', () => {
  for (const override of [{ valor: '-1' }, { valor: '0' }, { valor: '' }, { valor: '1,001' }, { vencimento: '2027-02-30' }, { numero: 2 }]) {
    assert.throws(() => lerPlanoManual(JSON.stringify([{ ...plano[0], ...override }, plano[1]]), 2));
  }
  assert.throws(() => lerPlanoManual(JSON.stringify(plano), 3));
  assert.throws(() => lerPlanoManual('{', 2));
});
test('rateio de aumentos e descontos fecha exatamente com o plano manual', () => {
  for (const total of [0.01, 100, 300.03, 10000.01]) {
    const rateio = ratearTotalManual(total, [100, 200, 50.21]);
    assert.equal(rateio.reduce((sum, valor) => sum + Math.round(valor * 100), 0), Math.round(total * 100));
    assert.ok(rateio.every(valor => valor >= 0));
  }
});

import {test} from 'node:test'
import assert from 'node:assert/strict'
import {acordoTemParcelaNoPeriodo} from '../features/acordos/filtro-vencimento'
test('vencimentos inclusivos independem da data de realização do acordo',()=>{
 assert.equal(acordoTemParcelaNoPeriodo([{vencimento:'2026-10-13'}],'2026-10-13','2026-11-12'),true)
 assert.equal(acordoTemParcelaNoPeriodo([{vencimento:'2026-11-12'}],'2026-10-13','2026-11-12'),true)
 assert.equal(acordoTemParcelaNoPeriodo([{vencimento:'2026-10-12'},{vencimento:'2026-11-13'}],'2026-10-13','2026-11-12'),false)
 assert.equal(acordoTemParcelaNoPeriodo([{vencimento:'2026-10-12'},{vencimento:'2026-10-20'},{vencimento:'2026-10-21'}],'2026-10-13','2026-11-12'),true)
})
test('datas parciais e acordo sem parcelas respeitam o filtro',()=>{
 assert.equal(acordoTemParcelaNoPeriodo([],'2026-10-13'),false)
 assert.equal(acordoTemParcelaNoPeriodo([{vencimento:null}],undefined,'2026-11-12'),false)
 assert.equal(acordoTemParcelaNoPeriodo([{vencimento:'2026-11-13'}],'2026-10-13'),true)
 assert.equal(acordoTemParcelaNoPeriodo([{vencimento:'2026-10-01'}],undefined,'2026-11-12'),true)
 assert.equal(acordoTemParcelaNoPeriodo(undefined),true)
})

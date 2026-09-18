import assert from 'node:assert/strict';
import {autoMatchCondominio} from '../features/conversao-relatorio/condominio-match';
const c=[{id:'r',nome:'CONDOMÍNIO SQUARE GARDEN CAMPO BELO - RESIDENCIAL',cnpj:'52151457000281'},{id:'s',nome:'CONDOMÍNIO SQUARE GARDEN CAMPO BELO STUDIOS',cnpj:'52151457000362'},{id:'g',nome:'CONDOMÍNIO SQUARE GUARULHOS',cnpj:'14234598000198'}];
assert.equal(autoMatchCondominio(c,'COND SQUARE GARDEN-RESIDENCIAL')?.id,'r');
assert.equal(autoMatchCondominio(c,'COND SQUARE GARDEN STUDIOS')?.id,'s');
assert.equal(autoMatchCondominio(c,'COND SQUARE GARDEN'),null);
assert.equal(autoMatchCondominio(c,'SQUARE GUARULHOS')?.id,'g');
console.log('4 matching regressions passed');

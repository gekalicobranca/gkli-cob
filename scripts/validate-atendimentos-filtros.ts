import assert from 'node:assert/strict'
import { filtrarAtendimentos, linkAtendimento } from '../features/keila/filtros-atendimentos'
import type { KeilaCaso } from '../features/keila/queries'

const caso: KeilaCaso = {
  id: 'caso-1', carteira_id: 'carteira', titulo: 'João · parcelamento', status: 'aberta', updated_at: '2026-10-13T10:00:00Z', condominio_id: 'safira',
  condominio: { nome: 'Condomínio Safira', operacao_virtual_habilitada: true, despesas_acordo_avista_percentual: null, despesas_acordo_parcelado_percentual: null, parcelas_acordo_sem_aprovacao_sindico: null },
  payload: { versao: 1, estado: 'em_analise', intencao: 'parcelamento', unidade_ids: ['unidade'], emails: [{ chave: 'email', nome: 'João', remetente: 'joao@example.com', recebido_em: '2026-10-13T10:00:00Z', assunto: 'Conferir pagamento', resumo: 'Pedido recebido' }], atividades: [], proxima_acao: 'Conferir saldo', modo: 'supervisionado', envio_permitido: false },
}
const unidades = [{ id: 'unidade', identificacao: '000113', bloco: '02' }]
const outro: KeilaCaso = { ...caso, id: 'caso-2', updated_at: '2026-10-12T10:00:00Z', condominio_id: 'outro', payload: { ...caso.payload, resposta_simulada: 'Rascunho' } }
const filtrar = (f: Parameters<typeof filtrarAtendimentos>[2]) => filtrarAtendimentos([caso, outro], unidades, f, '2026-10-13')
assert.equal(filtrar({ q: 'joao safira 113 pagamento' }).length, 2)
assert.deepEqual(filtrar({ condominio_id: 'safira', resposta: 'sem_resposta', intencao: 'parcelamento' }).map(c => c.id), ['caso-1'])
assert.deepEqual(filtrar({ resposta: 'rascunho' }).map(c => c.id), ['caso-2'])
assert.equal(filtrar({ prazo: 'acompanhar' }).length, 0)
const pendente: KeilaCaso = { ...caso, payload: { ...caso.payload, acompanhamento: { conversas: [], pendencias: [{ id: 'pendencia', tipo: 'debitos', aguardando: 'Administradora', criada_em: '2026-10-12', prazo: '2026-10-13', intervalo_dias: 1, proxima_acao: 'Conferir baixa', simulacoes: [] }] } } }
assert.equal(filtrarAtendimentos([pendente], unidades, { prazo: 'acompanhar' }, '2026-10-13').length, 1)
assert.equal(filtrarAtendimentos([pendente], unidades, { prazo: 'acompanhar' }, '2026-10-12').length, 0)
assert.equal(filtrarAtendimentos([{ ...pendente, payload: { ...pendente.payload, estado: 'atendimento_humano' } }], unidades, { prazo: 'acompanhar' }, '2026-10-13').length, 0)
assert.equal(filtrar({ estado: 'concluido' }).length, 0)
assert.equal(filtrar({ q: 'inexistente' }).length, 0)
assert.deepEqual(filtrar({ ordem: 'antigos' }).map(c => c.id), ['caso-2', 'caso-1'])
const url = new URL(linkAtendimento('/app/gestao/keila', { q: 'João & Maria', estado: 'em_analise', condominio_id: 'safira' }, 'caso-1'), 'http://localhost')
assert.equal(url.searchParams.get('q'), 'João & Maria')
assert.equal(url.searchParams.get('condominio_id'), 'safira')
assert.equal(url.searchParams.get('caso'), 'caso-1')
assert.equal(linkAtendimento('/app/gestao/keila', {}, 'caso-1'), '/app/gestao/keila?caso=caso-1')
console.log('Filtros combinados, busca sem acentos, unidades, ordenação e preservação de URL: OK')

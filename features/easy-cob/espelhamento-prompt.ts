export type CondominioEspelhamento = {
  id: string
  nome: string
  carteira: string | null
}

export type AdministradoraEspelhamento = {
  id: string
  nome: string
  condominios: CondominioEspelhamento[]
}

export function montarPromptEspelhamento(
  administradora: AdministradoraEspelhamento,
  condominios: CondominioEspelhamento[],
  periodo: string,
  aplicar: boolean,
) {
  const escopo = condominios.map(condominio => {
    const carteira = condominio.carteira ? ` | Carteira ${condominio.carteira}` : ''
    return `- ${condominio.nome}${carteira} | ID no GKLI Cob ${condominio.id}`
  }).join('\n')

  return `# Espelhamento da administradora no GKLI Cob

Administradora — ${administradora.nome}
Período — ${periodo.trim() || 'posição atual, com o histórico necessário à conciliação'}
Modo — ${aplicar ? 'conferir e aplicar no app somente os ajustes comprovados' : 'somente conferir e relatar as divergências, em leitura'}

Condomínios no escopo desta execução
${escopo}

## 1. Cadastro e fontes

- Consulte o Workbook de Acessos do GKLI Cob e confirme carteira, administradora, código no portal, setores, data de ativação, régua e exceções. Use o acesso de cada condomínio e preserve as credenciais. Alguns condomínios da Lello têm acessos próprios.
- Consulte as cotas em atraso, os acordos e sua composição por recibo, a grade de parcelas, o histórico de recebimentos e os repasses disponíveis. Na Lello, cruze o Histórico de Pagamentos da unidade, a ficha individual do recibo e a ficha do acordo. Em outras administradoras, use os relatórios equivalentes.
- Registre a data da consulta, os filtros e as fontes. Confira todas as páginas e os setores do escopo. Erro, sessão expirada ou relatório incompleto deixam a consulta pendente. Use o histórico para explicar recibos ausentes, pagamentos já lançados e acordos substituídos.

## 2. Cotas

- Cruze condomínio, setor ou bloco, unidade e recibo. Confirme competência, vencimento, principal e tipo da cobrança. Preserve zeros à esquerda e sufixos de torre. Cota ordinária e fundo de reserva podem ter o mesmo vencimento.
- No modo de aplicação, cadastre ou corrija cotas comprovadas, inclusive anteriores à ativação. Preserve a composição e use principal, multa, juros, correção e honorários documentados.
- Aceite diferenças de até R$ 1,00 quando a identidade estiver comprovada. Se a ficha ou o extrato confirmar outra data ou valor, use o dado da administradora e registre a evidência. Diferenças que impedem a identificação ou fontes conflitantes ficam pendentes.
- Se uma cota em aberto sumir do relatório, verifique o histórico. Para pagamento direto, use data e valor confirmados. Para baixa por acordo, vincule o recibo ao acordo e registre o recebimento na parcela, uma única vez. Documente recibos cancelados ou substituídos. Ausência isolada fica pendente.

## 3. Régua e bloqueios

- Cotas em aberto sem acordo ou bloqueio ficam Regulares antes da régua e em Cobrança ativa a partir do início da régua do condomínio. Revise os rótulos Novo, Pré e Suspensa e documente as exceções comprovadas.
- Com ação judicial confirmada na unidade, classifique as cotas vinculadas como Judicializado, bloqueie a cobrança automatizada e preserve a situação financeira. Documente a atuação de outro advogado mesmo sem número de processo. As marcações J e Jurídico da administradora indicam encaminhamento e, isoladamente, deixam a cota sujeita à régua normal.
- Nas cotas do período confirmado da garantidora, aplique o bloqueio e registre o motivo. Em sobreposição com ação judicial, mantenha Judicializado como status operacional e documente o bloqueio da garantidora.
- Antes de devolver à cobrança uma cota de acordo quebrado ou cancelado, confira se o mesmo recibo foi quitado ou vinculado a outro acordo.

## 4. Acordos, parcelas e repasses

- Use número da administradora e composição por recibo para localizar o acordo existente. Sem número externo, cruze unidade, recibos, valor e grade. Valor ou vencimento isolados deixam a correspondência em aberto. Preserve o histórico de substituições.
- Registre separadamente data do acordo, vencimento e pagamento da parcela, baixa do recibo de origem e quitação. Atualize os status comprovados, inclusive quitado, quebrado, cancelado ou substituído. Confirme homologação com evidência própria.
- Classifique a autoria para qualquer administradora. Use Carteira para acordos comprovadamente nossos, Externo para acordos da administradora ou de terceiros e A confirmar quando faltar evidência. Considere a data de ativação e contratos anteriores de cobrança. Preserve a autoria interna comprovada. Mantenha cotas e baixas vinculadas em todas as classificações. Somente Carteira entra nos controles da GEKALI.
- Use vencimento, status, data de pagamento e valor efetivamente pago de cada parcela. Distinga repasse informado de repasse creditado. Preserve o repasse interno documentado quando a administradora não apresentar informação adicional. Campos ausentes ficam em branco.
- Para duplicidades, confronte os lançamentos de origem com recibos e extrato. Confirmada a duplicidade, preserve o lançamento comprovado e cancele o duplicado com histórico. Confira que o pagamento e o repasse contam uma única vez.
- Quando o condomínio comprovar pagamento direto ainda em atraso no portal, preserve a evidência e documente a divergência. Indique o que foi confirmado pelo condomínio, o que a administradora processou e a data que ainda falta.

## 5. Aplicação e verificação

- Respeite o modo escolhido e limite a operação aos condomínios listados. Na aplicação, confira o estado atual, grave apenas ajustes comprovados e registre fonte, identificadores e antes e depois. Preserve documentos, histórico e vínculos válidos. Reexecutar com os mesmos dados deve produzir zero duplicidades.
- Se o ajuste atingir fechamento consolidado, registre o impacto para revisão. Mantenha o portal em consulta. Mensagens, montagem ou ativação de flows e alterações de régua, carteira ou credenciais ficam fora da rotina.
- Releia o app após aplicar. Compare quantidades e totais de cotas por status, acordos por situação e autoria, parcelas pagas, repasses e vínculos. Confira que nenhum recebimento aparece como pago pela cota e pela parcela.

## 6. Resultado

Informe condomínio, carteira, administradora, setores, régua, período e data da consulta. Mostre as quantidades e os valores conciliados, os ajustes e as pendências. Para cada pendência, indique unidade, recibo ou acordo, vencimento, valor, posição no app, posição no portal e a evidência que falta. Declare 100% espelhado apenas quando a consulta cobrir todo o escopo e nenhuma divergência relevante estiver aberta.`
}

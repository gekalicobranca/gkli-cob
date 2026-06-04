# Sprint 5.6 — Hardening do módulo de Acordos

Escopo aplicado nesta revisão:

- Lista principal de acordos reorganizada por condomínio e unidade, reduzindo repetição visual.
- Ficha do acordo com contexto operacional único no topo: condomínio, unidade, responsável, status e saúde.
- Origem do acordo simplificada para exibir apenas as cobranças agrupadas, evitando duplicidade de contexto.
- Fila do operador otimizada para evitar dupla consulta de parcelas.
- Mantido o padrão Lite: sem novas páginas, sem gráficos, sem KPIs redundantes.

Validações esperadas:

1. Abrir `/app/acordos` e conferir agrupamento por condomínio.
2. Abrir um acordo e conferir contexto operacional no topo.
3. Abrir `/app/acordos/fila` e validar parcelas de Hoje, Próximos 7 dias e Em atraso.
4. Confirmar que formalização, boletos e rompimento assistido continuam acessíveis na ficha do acordo.
5. Confirmar que cobranças de unidade judicializada continuam bloqueadas para novos acordos.

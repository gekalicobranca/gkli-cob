# Arquivos de relatório

Pasta local padrão: `outputs/relatorios-inadimplencia` (na raiz do projeto).
Pode ser alterada por `RELATORIOS_INADIMPLENCIA_DIR`.

Nome: `CNPJ_NOME_DATA.pdf`, com CNPJ somente em números, nome em maiúsculas
sem acentos e data de geração `AAAA-MM-DD` no fuso de São Paulo.
Se não houver CNPJ no cadastro, o nome começa com `SEM_CNPJ`.

Exportar os dados financeiros e jurídicos salvos em uma conversão:

```powershell
npx tsx scripts/relatorios-inadimplencia/exportar.ts <id-da-conversao>
```

Uma nova exportação no mesmo dia substitui a versão principal e preserva a
anterior em `historico/<instante>/`, com o mesmo nome padronizado.
O comando não realiza nova consulta jurídica nem nova importação financeira.
Os downloads pelo aplicativo utilizam o mesmo nome, mas são salvos na pasta
de downloads escolhida no navegador. A exportação local é que usa a pasta acima.

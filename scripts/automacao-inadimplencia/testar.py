from analisar import analisar,natureza,natureza_hubert
from datetime import date
from decimal import Decimal

assert natureza('CARTÃO DE ACESSO 9')=='Outros débitos'
assert natureza('CESSÃO DE ESPAÇO')=='Cessão de espaço'
assert natureza('LOCAÇÃO ÁREA COMUM')=='Locação de espaço'
assert natureza('CONDOMINIO AGO/26')=='Taxa condominial'
assert natureza_hubert('1002','COTA MARÇO/26 (DESP.')=='Taxa condominial'
assert natureza_hubert('1002','C. MAIO/25 (DESP.COMUNS)')=='Taxa condominial'
a=analisar('C:/Users/Gekali/Downloads/processados/CONDOMINIO_CO_NEXT_LIBERDADE_62905_2026-09-11.xls',date(2026,9,11))
assert a['totais']['total']==Decimal('85543.33')
assert a['contagem']['unidades']==55
assert a['idades']['mais_60_dias']['unidades']==21
assert a['idades']['mais_60_dias']['total']==Decimal('50292.40')
assert a['idades']['mais_5_anos']['total']==0
assert all(c['diferenca']==0 for c in a['conferencias'])
assert next(x for x in a['itens'] if x['linha']==516)['principal']==Decimal('-73.36')
assert a['naturezas']['Locação de espaço']['itens_sem_valor']==67
b=analisar('C:/Users/Gekali/Downloads/processados/CONDOMINIO_VILLA_LOBOS_OFFICE_PARK_2026-09-12.xls',date(2026,9,12))
assert b['totais']['total']==Decimal('1056950.17')
assert all(c['diferenca']==0 for c in b['conferencias'])
assert sum(x['total'] for x in b['itens'] if x['natureza']=='Cessão de espaço')==Decimal('284352.28')
print('Conferidos os dois formatos, classificações, desconto, valores ausentes e faixas de atraso.')

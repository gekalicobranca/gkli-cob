import { createHash } from 'node:crypto'

export function janelaNoturna(agora = new Date()) {
 const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(agora).map(p => [p.type, p.value]))
 const minutos = Number(parts.hour) * 60 + Number(parts.minute)
 return minutos >= 30 && minutos < 325
}
export function validarConfiguracao(config) {
 if (!/^\d{1,10}$/.test(config.codigo_portal) || !/^[A-Z][A-Z0-9_]{0,50}$/.test(config.perfil_acesso)) throw Error('Código ou perfil inválido.')
 const formato = !config.portal || config.portal==='lello' ? /^[a-z0-9][a-z0-9-]{0,11}$/i : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
 if (!Array.isArray(config.unidades) || !config.unidades.length || config.unidades.length > 1000 || config.unidades.some(u => !formato.test(u)) || new Set(config.unidades).size !== config.unidades.length) throw Error('Unidades do scanner inválidas ou duplicadas (até 1000).')
 if (!Number.isInteger(config.cursor) || config.cursor < 0 || config.cursor >= config.unidades.length) throw Error('Cursor inválido.')
 return config.unidades.slice(config.cursor, config.cursor + 20)
}
export function evidencia(unidade, tipo, dados) {
 return { unidade_portal: unidade, tipo, dados, sha256: createHash('sha256').update(JSON.stringify(dados)).digest('hex') }
}
export function validarLink(href, codigo, unidade, pathname) {
 const url = new URL(href)
 if (url.origin !== 'https://portal.lellocondominios.com.br' || url.pathname !== pathname || url.searchParams.get('codCondo') !== codigo || url.searchParams.get('codUnidade') !== unidade) throw Error('Link do portal fora do condomínio/unidade esperados.')
 return url.href
}

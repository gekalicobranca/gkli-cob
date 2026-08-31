import { mkdir, readFile, rename, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import process from "node:process"
import { processarRelatorioCaptado } from "../../features/captacao-automatizada/processar-relatorio"
import { captacaoGlobalAtiva } from "../../features/captacao-automatizada/controle-global"

const raiz = process.cwd()
async function carregarEnv() {
  for (const nome of [".env.local", ".env"]) try {
    for (const linha of (await readFile(path.join(raiz, nome), "utf8")).split(/\r?\n/)) {
      const texto = linha.trim(), pos = texto.indexOf("=")
      if (!texto || texto.startsWith("#") || pos < 1) continue
      const chave = texto.slice(0, pos).trim(), valor = texto.slice(pos + 1).trim().replace(/^(['"])(.*)\1$/, "$2")
      if (!process.env[chave]) process.env[chave] = valor
    }
    return
  } catch {}
}
let entrada = "", processados = "", falhas = ""

async function executarEtapaHttp(url: string, secret: string, body: Record<string, unknown>, etapa: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result?.ok === false) throw new Error(`${etapa}: ${result?.error || `HTTP ${response.status}`}`)
  return result
}

async function concluirPipeline(resumo: Awaited<ReturnType<typeof processarRelatorioCaptado>>) {
  const automatico = String(process.env.CAPTACAO_AUTOMATIZADA_CONFIRMAR || "false").toLowerCase() === "true"
  if (!automatico) return false
  const baseUrl = String(process.env.CAPTACAO_MAESTRO_URL || process.env.CAPTACAO_ORQUESTRADOR_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")
  const secret = process.env.CRON_SECRET || process.env.REGUA_CRON_SECRET || ""
  if (!baseUrl) throw new Error("CAPTACAO_MAESTRO_URL não configurada para concluir a importação automática.")
  if (!secret) throw new Error("REGUA_CRON_SECRET não configurado para autenticar o Maestro.")

  await executarEtapaHttp(`${baseUrl}/api/conversao-relatorio/confirmar`, secret, {
    conversaoId: resumo.conversaoId,
    condominioId: resumo.condominioId,
    carteiraId: resumo.carteiraId,
  }, "Importação automática")
  await executarEtapaHttp(`${baseUrl}/api/regua/processar`, secret, {
    condominioId: resumo.condominioId,
    carteiraId: resumo.carteiraId,
  }, "Entrada na régua")
  return true
}

async function destinoUnico(pasta: string, nome: string) {
  const parsed = path.parse(nome)
  let destino = path.join(pasta, nome), contador = 1
  while (await stat(destino).then(() => true).catch(() => false)) destino = path.join(pasta, `${parsed.name}_${contador++}${parsed.ext}`)
  return destino
}

async function arquivosElegiveis() {
  const { readdir } = await import("node:fs/promises")
  return (await readdir(entrada, { withFileTypes: true }))
    .filter((item) => item.isFile() && /^[A-Z0-9_]+_\d{4}-\d{2}-\d{2}\.xlsx?$/i.test(item.name))
    .map((item) => item.name).sort()
}

async function main() {
  await carregarEnv()
  entrada = path.resolve(process.env.CAPTACAO_AUTOMATIZADA_PASTA || process.env.AGENTE_DOWNLOAD_DIR || path.join(os.homedir(), "Downloads"))
  processados = path.join(entrada, "processados"); falhas = path.join(entrada, "falhas")
  const intervalo = Math.max(3000, Number(process.env.CAPTACAO_AUTOMATIZADA_INTERVALO_MS || 10000))
  await mkdir(processados, { recursive: true }); await mkdir(falhas, { recursive: true })
  console.log(`Captação automatizada ativa em ${entrada}`)
  for (;;) {
    const ligada = await captacaoGlobalAtiva()
    for (const nome of ligada ? await arquivosElegiveis() : []) {
      const origem = path.join(entrada, nome)
      try {
        const antes = await stat(origem); await new Promise((r) => setTimeout(r, 1500)); const depois = await stat(origem)
        if (antes.size !== depois.size || antes.mtimeMs !== depois.mtimeMs) continue
        const resumo = await processarRelatorioCaptado(origem)
        const automatico = await concluirPipeline(resumo)
        await rename(origem, await destinoUnico(processados, nome))
        console.log(automatico
          ? `${nome}: pipeline concluído (${resumo.cobrancas} cobranças); régua acionada.`
          : `${nome}: convertido (${resumo.cobrancas} cobranças); aguardando validação do operador.`)
      } catch (error) {
        console.error(`${nome}: ${error instanceof Error ? error.message : error}`)
        if (await stat(origem).then(() => true).catch(() => false)) await rename(origem, await destinoUnico(falhas, nome))
      }
    }
    if (String(process.env.CAPTACAO_RUN_ONCE || "false").toLowerCase() === "true") break
    await new Promise((r) => setTimeout(r, intervalo))
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })

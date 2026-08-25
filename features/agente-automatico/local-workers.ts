import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import process from 'node:process'
import { AGENTE_WORKERS, type AgenteWorkerConfig } from './workers'

const execFileAsync = promisify(execFile)

export type LocalWorkerProcessStatus = {
  scriptKey: string
  disponivel: boolean
  pids: number[]
}

export function localWorkerControlAvailable() {
  return process.platform === 'win32' && !process.env.VERCEL
}

function psQuote(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function buildWorkerMatchCondition(worker: AgenteWorkerConfig) {
  const npmScript = worker.npmScript.replaceAll('"', '')
  const workerFile = worker.workerFile.replaceAll('"', '')
  return [
    `($_.CommandLine -match 'run-worker\\.ps1' -and $_.CommandLine -like "*${npmScript}*")`,
    `($_.CommandLine -match 'npm(\\.cmd|-cli\\.js)' -and $_.CommandLine -like "*${npmScript}*")`,
    `($_.CommandLine -like "*scripts/agente-automatico/${workerFile}*" -or $_.CommandLine -like "*scripts\\agente-automatico\\${workerFile}*")`,
  ].join(' -or ')
}

async function runPowerShell(script: string) {
  return execFileAsync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ], {
    cwd: process.cwd(),
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  })
}

export async function listLocalWorkerProcessStatuses(): Promise<LocalWorkerProcessStatus[]> {
  if (!localWorkerControlAvailable()) {
    return AGENTE_WORKERS.map((worker) => ({
      scriptKey: worker.scriptKey,
      disponivel: false,
      pids: [],
    }))
  }

  const workerDefinitions = AGENTE_WORKERS.map((worker) => ({
    scriptKey: worker.scriptKey,
    npmScript: worker.npmScript,
    workerFile: worker.workerFile,
  }))

  const script = `
$workers = '${JSON.stringify(workerDefinitions).replaceAll("'", "''")}' | ConvertFrom-Json
$processes = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -notmatch 'Get-CimInstance' }
$result = foreach ($worker in $workers) {
  $matches = $processes | Where-Object {
    ($_.CommandLine -match 'run-worker\\.ps1' -and $_.CommandLine -like "*$($worker.npmScript)*") -or
    ($_.CommandLine -match 'npm(\\.cmd|-cli\\.js)' -and $_.CommandLine -like "*$($worker.npmScript)*") -or
    ($_.CommandLine -like "*scripts/agente-automatico/$($worker.workerFile)*") -or
    ($_.CommandLine -like "*scripts\\agente-automatico\\$($worker.workerFile)*")
  }
  [PSCustomObject]@{
    scriptKey = $worker.scriptKey
    pids = @($matches | ForEach-Object { $_.ProcessId })
  }
}
$result | ConvertTo-Json -Depth 4
`

  const { stdout } = await runPowerShell(script)
  const parsed = JSON.parse(stdout || '[]')
  const rows = Array.isArray(parsed) ? parsed : [parsed]

  return AGENTE_WORKERS.map((worker) => {
    const row = rows.find((item: { scriptKey?: string }) => item.scriptKey === worker.scriptKey)
    const pids = Array.isArray(row?.pids)
      ? row.pids.map((pid: unknown) => Number(pid)).filter(Boolean)
      : row?.pids ? [Number(row.pids)].filter(Boolean) : []

    return {
      scriptKey: worker.scriptKey,
      disponivel: true,
      pids,
    }
  })
}

export async function startLocalWorker(worker: AgenteWorkerConfig) {
  if (!localWorkerControlAvailable()) {
    throw new Error('Controle de processo disponível apenas no app rodando localmente no Windows.')
  }

  const runnerPath = path.join(process.cwd(), 'scripts', 'agente-automatico', 'run-worker.ps1')
  const projectDir = process.cwd()
  const script = `
$runnerPath = ${psQuote(runnerPath)}
$projectDir = ${psQuote(projectDir)}
$npmScript = ${psQuote(worker.npmScript)}
$logName = ${psQuote(worker.logName)}
$alreadyRunning = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and (
    ($_.CommandLine -match 'run-worker\\.ps1' -and $_.CommandLine -like "*$npmScript*") -or
    ($_.CommandLine -match 'npm(\\.cmd|-cli\\.js)' -and $_.CommandLine -like "*$npmScript*")
  )
}
if (-not $alreadyRunning) {
  $arguments = @('-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', $runnerPath, '-NpmScript', $npmScript, '-LogName', $logName)
  Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WorkingDirectory $projectDir -WindowStyle Hidden
}
`
  await runPowerShell(script)
}

export async function stopLocalWorker(worker: AgenteWorkerConfig) {
  if (!localWorkerControlAvailable()) {
    throw new Error('Controle de processo disponível apenas no app rodando localmente no Windows.')
  }

  const condition = buildWorkerMatchCondition(worker)
  const script = `
$targets = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and $_.CommandLine -notmatch 'Get-CimInstance' -and (${condition})
}
foreach ($process in $targets) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}
`
  await runPowerShell(script)
}

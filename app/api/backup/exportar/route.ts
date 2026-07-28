import { NextResponse } from 'next/server'
import { strToU8, Zip, ZipDeflate } from 'fflate'
import { requireAuthenticatedApiUser } from '@/app/api/_lib/auth'
import { backupSchemaFiles } from '@/lib/backup/schema-files.generated'
import { createAdminClient } from '@/utils/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type BackupTable = { table_name: string; column_names: string[] }
const PAGE_SIZE = 1000

function csvCell(value: unknown) {
  if (value === null || value === undefined) return '\\N'
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function csvLine(values: unknown[]) {
  return `${values.map(csvCell).join(',')}\r\n`
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export async function GET() {
  const { user, response } = await requireAuthenticatedApiUser()
  if (response || !user) return response

  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    return NextResponse.json(
      { ok: false, error: `Não foi possível validar o perfil: ${profileError.message}` },
      { status: 500 },
    )
  }
  if (profile?.role !== 'admin') {
    return NextResponse.json(
      { ok: false, error: 'Somente administradores podem exportar o backup.' },
      { status: 403 },
    )
  }

  const { data, error } = await admin.rpc('listar_tabelas_backup')
  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Aplique as migrações do Supabase antes de usar a exportação.',
        detail: error.message,
      },
      { status: 503 },
    )
  }

  const tables = (data ?? []) as BackupTable[]
  const { data: currentSchema, error: schemaError } = await admin.rpc(
    'exportar_esquema_backup',
  )
  if (schemaError || typeof currentSchema !== 'string') {
    return NextResponse.json(
      {
        ok: false,
        error: 'Não foi possível gerar o esquema atual do banco.',
        detail: schemaError?.message,
      },
      { status: 503 },
    )
  }
  const createdAt = new Date().toISOString()
  const stamp = createdAt.replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z')
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const manifest: {
        formatVersion: number
        createdAt: string
        createdBy: string
        tables: Array<{ name: string; rows: number; status: 'ok' | 'error'; error?: string }>
      } = { formatVersion: 1, createdAt, createdBy: user.id, tables: [] }

      const zip = new Zip((zipError, chunk, final) => {
        if (zipError) return controller.error(zipError)
        controller.enqueue(chunk)
        if (final) controller.close()
      })

      try {
        const currentSchemaEntry = new ZipDeflate('schema/schema-current.sql', { level: 6 })
        zip.add(currentSchemaEntry)
        currentSchemaEntry.push(strToU8(currentSchema), true)

        for (const file of backupSchemaFiles) {
          const entry = new ZipDeflate(file.name, { level: 6 })
          zip.add(entry)
          entry.push(strToU8(file.content), true)
        }

        for (const table of tables) {
          const entry = new ZipDeflate(`dados/${safeFileName(table.table_name)}.csv`, {
            level: 6,
          })
          zip.add(entry)
          entry.push(encoder.encode(csvLine(table.column_names)), false)

          let offset = 0
          let rows = 0
          let tableError: string | undefined
          while (true) {
            const result = await admin
              .from(table.table_name)
              .select('*')
              .range(offset, offset + PAGE_SIZE - 1)
            if (result.error) {
              tableError = result.error.message
              break
            }

            const page = (result.data ?? []) as Array<Record<string, unknown>>
            if (page.length === 0) break
            const csv = page
              .map((row) => csvLine(table.column_names.map((column) => row[column])))
              .join('')
            entry.push(encoder.encode(csv), false)
            rows += page.length
            offset += page.length
            if (page.length < PAGE_SIZE) break
          }
          entry.push(new Uint8Array(), true)
          manifest.tables.push({
            name: table.table_name,
            rows,
            status: tableError ? 'error' : 'ok',
            ...(tableError ? { error: tableError } : {}),
          })
        }

        const readme = new ZipDeflate('LEIA-ME.txt', { level: 6 })
        zip.add(readme)
        readme.push(
          strToU8(
            [
              'BACKUP MANUAL DE SEGURANÇA — GKLI COBRANÇA',
              '',
              `Gerado em: ${createdAt}`,
              'CSVs: UTF-8, separados por vírgula, com cabeçalho.',
              'Nulos usam \\N. Objetos e arrays usam JSON.',
              '',
              'Reconstrução:',
              '1. Crie um novo projeto Supabase/Postgres.',
              '2. Aplique em ordem os arquivos de schema/migrations.',
              '3. Importe os CSVs respeitando as chaves estrangeiras.',
              '4. Reconfigure Auth, SMTP, secrets, webhooks e a hospedagem.',
              '5. Verifique manifest.json; status error indica pacote incompleto.',
              '',
              'Este pacote contém dados pessoais e financeiros. Armazene-o criptografado.',
            ].join('\n'),
          ),
          true,
        )

        const manifestEntry = new ZipDeflate('manifest.json', { level: 6 })
        zip.add(manifestEntry)
        manifestEntry.push(strToU8(JSON.stringify(manifest, null, 2)), true)
        zip.end()
      } catch (streamError) {
        controller.error(streamError)
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="gkli-backup-seguranca-${stamp}.zip"`,
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

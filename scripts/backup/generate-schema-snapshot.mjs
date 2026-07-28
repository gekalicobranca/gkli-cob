import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const root = process.cwd()
const migrationsDir = join(root, 'supabase', 'migrations')
const outputFile = join(root, 'lib', 'backup', 'schema-files.generated.ts')
const names = (await readdir(migrationsDir))
  .filter((name) => name.endsWith('.sql'))
  .sort((a, b) => a.localeCompare(b))

const files = await Promise.all(
  names.map(async (name) => ({
    name: `schema/migrations/${name}`,
    content: await readFile(join(migrationsDir, name), 'utf8'),
  })),
)
files.unshift({
  name: 'schema/config.toml',
  content: await readFile(join(root, 'supabase', 'config.toml'), 'utf8'),
})

const source = `// Gerado automaticamente. Não editar manualmente.
export const backupSchemaFiles: ReadonlyArray<{ name: string; content: string }> = ${JSON.stringify(files, null, 2)}
`
await mkdir(dirname(outputFile), { recursive: true })
await writeFile(outputFile, source, 'utf8')
console.log(`Snapshot de esquema atualizado: ${files.length} arquivos.`)

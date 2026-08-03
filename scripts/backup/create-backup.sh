#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

required=(
  SUPABASE_DB_URL
  SUPABASE_STORAGE_ENDPOINT
  SUPABASE_STORAGE_REGION
  SUPABASE_STORAGE_ACCESS_KEY_ID
  SUPABASE_STORAGE_SECRET_ACCESS_KEY
  BACKUP_ENCRYPTION_PASSPHRASE
  BACKUP_RCLONE_CONFIG_BASE64
  BACKUP_RCLONE_REMOTE
)

for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Variável obrigatória ausente: ${name}" >&2
    exit 2
  fi
done

command -v aws >/dev/null || { echo "aws CLI não encontrado" >&2; exit 2; }
command -v rclone >/dev/null || { echo "rclone não encontrado" >&2; exit 2; }
command -v openssl >/dev/null || { echo "OpenSSL não encontrado" >&2; exit 2; }
command -v git >/dev/null || { echo "Git não encontrado" >&2; exit 2; }

timestamp="$(date -u +'%Y-%m-%dT%H-%M-%SZ')"
project_ref="${SUPABASE_PROJECT_REF:-unknown-project}"
remote="${BACKUP_RCLONE_REMOTE%:}"
drive_path="${BACKUP_RCLONE_PATH:-gkli-cob/production}"
drive_path="${drive_path#/}"
drive_path="${drive_path%/}"
work_root="$(mktemp -d)"
backup_dir="${work_root}/${project_ref}_${timestamp}"
archive="${work_root}/${project_ref}_${timestamp}.tar.gz"
encrypted="${archive}.backup.enc"
checksum="${encrypted}.sha256"
rclone_config="${work_root}/rclone.conf"
upload_dir="${work_root}/upload"

cleanup() {
  rm -rf -- "${work_root}"
}
trap cleanup EXIT

mkdir -p "${backup_dir}/database" "${backup_dir}/storage" "${backup_dir}/app"
printf '%s' "${BACKUP_RCLONE_CONFIG_BASE64}" | base64 --decode > "${rclone_config}"
chmod 600 "${rclone_config}"

echo "Gerando cópia lógica do banco..."
npx --no-install supabase db dump --db-url "${SUPABASE_DB_URL}" \
  -f "${backup_dir}/database/roles.sql" --role-only
npx --no-install supabase db dump --db-url "${SUPABASE_DB_URL}" \
  -f "${backup_dir}/database/schema.sql"
npx --no-install supabase db dump --db-url "${SUPABASE_DB_URL}" \
  -f "${backup_dir}/database/data.sql" --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes"

echo "Preservando uma cópia reconstruível do app..."
git bundle create "${backup_dir}/app/repository.bundle" --all
cp package.json package-lock.json "${backup_dir}/app/"
cp -R supabase "${backup_dir}/app/supabase"

echo "Copiando objetos do Supabase Storage..."
export AWS_ACCESS_KEY_ID="${SUPABASE_STORAGE_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${SUPABASE_STORAGE_SECRET_ACCESS_KEY}"
mapfile -t buckets < <(
  aws s3api list-buckets \
    --endpoint-url "${SUPABASE_STORAGE_ENDPOINT}" \
    --region "${SUPABASE_STORAGE_REGION}" \
    --query 'Buckets[].Name' --output text | tr '\t' '\n' | sed '/^$/d'
)
for bucket in "${buckets[@]}"; do
  mkdir -p "${backup_dir}/storage/${bucket}"
  aws s3 sync "s3://${bucket}" "${backup_dir}/storage/${bucket}" \
    --endpoint-url "${SUPABASE_STORAGE_ENDPOINT}" \
    --region "${SUPABASE_STORAGE_REGION}" --only-show-errors
done
printf '%s\n' "${buckets[@]}" > "${backup_dir}/storage/buckets.txt"

db_bytes="$(du -sb "${backup_dir}/database" | cut -f1)"
storage_bytes="$(du -sb "${backup_dir}/storage" | cut -f1)"
commit_sha="$(git rev-parse HEAD)"
cat > "${backup_dir}/manifest.json" <<EOF
{
  "format_version": 1,
  "created_at_utc": "${timestamp}",
  "project_ref": "${project_ref}",
  "git_commit": "${commit_sha}",
  "database_bytes": ${db_bytes},
  "storage_bytes": ${storage_bytes},
  "storage_included": true
}
EOF

(cd "${backup_dir}" && find . -type f ! -name FILES.sha256 -print0 |
  sort -z | xargs -0 sha256sum > FILES.sha256)
tar -C "${work_root}" -czf "${archive}" "$(basename "${backup_dir}")"
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 \
  -in "${archive}" -out "${encrypted}" \
  -pass env:BACKUP_ENCRYPTION_PASSPHRASE
(cd "${work_root}" && sha256sum "$(basename "${encrypted}")" > "$(basename "${checksum}")")

echo "Enviando backup criptografado ao Google Drive..."
mkdir -p "${upload_dir}"
cp "${encrypted}" "${checksum}" "${upload_dir}/"
destination="${remote}:${drive_path}/${timestamp}"
rclone copy "${upload_dir}" "${destination}" \
  --config "${rclone_config}" --checksum --transfers 2 --checkers 4
rclone check "${upload_dir}" "${destination}" \
  --config "${rclone_config}" --checksum --one-way

echo "Backup concluído: ${destination}/$(basename "${encrypted}")"

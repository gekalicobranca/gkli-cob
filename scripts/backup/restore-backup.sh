#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ $# -lt 2 ]]; then
  echo "Uso: $0 <arquivo.backup.enc> <nova-url-postgres>" >&2
  exit 2
fi

encrypted="$(realpath "$1")"
target_db_url="$2"
checksum="${encrypted}.sha256"
restore_parent="${RESTORE_WORK_DIR:-$(pwd)/restore-work}"

[[ -f "${encrypted}" ]] || { echo "Backup não encontrado: ${encrypted}" >&2; exit 2; }
[[ -f "${checksum}" ]] || { echo "Checksum não encontrado: ${checksum}" >&2; exit 2; }
[[ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]] || {
  echo "Variável obrigatória ausente: BACKUP_ENCRYPTION_PASSPHRASE" >&2
  exit 2
}
command -v psql >/dev/null || { echo "psql não encontrado" >&2; exit 2; }

mkdir -p "${restore_parent}"
restore_root="$(mktemp -d "${restore_parent%/}/restore-XXXXXXXX")"
cd "$(dirname "${encrypted}")"
sha256sum --check "$(basename "${checksum}")"

archive="${restore_root}/backup.tar.gz"
rm -f -- "${archive}"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
  -in "${encrypted}" -out "${archive}" \
  -pass env:BACKUP_ENCRYPTION_PASSPHRASE
tar -C "${restore_root}" -xzf "${archive}"

backup_dir="$(find "${restore_root}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
[[ -n "${backup_dir}" ]] || { echo "Conteúdo do backup inválido" >&2; exit 3; }
(cd "${backup_dir}" && sha256sum --check FILES.sha256)

echo "Restaurando banco no projeto de destino..."
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file "${backup_dir}/database/roles.sql" \
  --file "${backup_dir}/database/schema.sql" \
  --file "${backup_dir}/database/data.sql" \
  --dbname "${target_db_url}"

if [[ -s "${backup_dir}/storage/buckets.txt" ]]; then
  storage_required=(
    TARGET_STORAGE_ENDPOINT
    TARGET_STORAGE_REGION
    TARGET_STORAGE_ACCESS_KEY_ID
    TARGET_STORAGE_SECRET_ACCESS_KEY
  )
  for name in "${storage_required[@]}"; do
    if [[ -z "${!name:-}" ]]; then
      echo "Banco restaurado. Storage pendente; falta ${name}." >&2
      exit 4
    fi
  done
  export AWS_ACCESS_KEY_ID="${TARGET_STORAGE_ACCESS_KEY_ID}"
  export AWS_SECRET_ACCESS_KEY="${TARGET_STORAGE_SECRET_ACCESS_KEY}"
  while IFS= read -r bucket; do
    [[ -n "${bucket}" ]] || continue
    aws s3api head-bucket --bucket "${bucket}" \
      --endpoint-url "${TARGET_STORAGE_ENDPOINT}" \
      --region "${TARGET_STORAGE_REGION}" 2>/dev/null ||
      aws s3api create-bucket --bucket "${bucket}" \
        --endpoint-url "${TARGET_STORAGE_ENDPOINT}" \
        --region "${TARGET_STORAGE_REGION}"
    aws s3 sync "${backup_dir}/storage/${bucket}" "s3://${bucket}" \
      --endpoint-url "${TARGET_STORAGE_ENDPOINT}" \
      --region "${TARGET_STORAGE_REGION}" --only-show-errors
  done < "${backup_dir}/storage/buckets.txt"
fi

echo "Restauração concluída. App recuperável em: ${backup_dir}/app/repository.bundle"

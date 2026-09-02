#!/usr/bin/env bash
#
# backup-db.sh — dump ฐาน PostgreSQL ของ production เก็บไว้บน VPS
#
# รันมือ:  bash ops/backup-db.sh
# รันจาก cron ทุกวัน 03:17:  ops/install-cron.sh ติดตั้งให้แล้ว
#
# ขั้นตอน: pg_dump -Fc → ตรวจไฟล์ด้วย pg_restore --list → ย้ายออกมาเก็บ →
#          ลบของเก่าเกิน RETENTION_DAYS → (ถ้าตั้ง BACKUP_REMOTE) ส่งสำเนาขึ้น rclone
# ล้มขั้นไหนก็ส่งอีเมลเตือนแล้ว exit ไม่ใช่ 0 เพื่อให้ cron จับได้
#
# ⚠️ ใช้ -Fc (custom format) ไม่ใช่ -Fp (plain SQL) เพราะ:
#    - บีบอัดในตัว ไฟล์เล็กกว่าหลายเท่า
#    - pg_restore เลือกกู้เฉพาะบางตารางได้
#    - ตรวจความสมบูรณ์ของไฟล์ได้ด้วย pg_restore --list โดยไม่ต้องกู้จริง

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ops/lib-common.sh
. "${SCRIPT_DIR}/lib-common.sh"

RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date '+%Y%m%d-%H%M%S')"
BASENAME="posmobileorderdb-${STAMP}.dump"
TARGET="${BACKUP_DIR}/${BASENAME}"
# ไฟล์ชั่วคราวในคอนเทนเนอร์ — ต้อง dump ที่นั่นเพราะ pg_dump/pg_restore
# มีอยู่ในคอนเทนเนอร์ ไม่ได้ติดตั้งบน host
IN_CONTAINER="/tmp/${BASENAME}"

cleanup() {
  docker exec "$DB_CONTAINER" rm -f "$IN_CONTAINER" > /dev/null 2>&1 || true
}
trap cleanup EXIT

on_error() {
  local msg="$1"
  notify "[MJD] backup ฐานข้อมูลล้มเหลว" \
    "เครื่อง: $(hostname)
เวลา: $(date '+%Y-%m-%d %H:%M:%S')
ขั้นที่ล้ม: ${msg}

ตรวจด้วย: bash ops/backup-db.sh แล้วดูข้อความที่พิมพ์ออกมา"
  fail "$msg"
}

require_docker
require_db_running
mkdir -p "$BACKUP_DIR"

USER_NAME="$(pg_user)"
DB_NAME="$(pg_db)"

step "1/5 dump ฐาน ${DB_NAME} (รูปแบบ custom -Fc)"
docker exec "$DB_CONTAINER" pg_dump -U "$USER_NAME" -d "$DB_NAME" -Fc -f "$IN_CONTAINER" \
  || on_error "pg_dump ล้มเหลว"
ok "dump เสร็จ"

step "2/5 ตรวจความสมบูรณ์ของไฟล์ (pg_restore --list)"
# ถ้า dump ขาดกลางคัน คำสั่งนี้จะล้ม — จับได้ตั้งแต่ตอนสำรอง ไม่ใช่ตอนจะกู้
OBJECTS=$(docker exec "$DB_CONTAINER" pg_restore --list "$IN_CONTAINER" 2>/dev/null | grep -c ';' || true)
[ "${OBJECTS:-0}" -gt 0 ] || on_error "pg_restore --list อ่านไฟล์ไม่ได้ — ไฟล์ dump เสีย"
ok "ไฟล์อ่านได้ พบ ${OBJECTS} object"

step "3/5 ย้ายไฟล์ออกมาเก็บที่ ${BACKUP_DIR}"
docker cp "${DB_CONTAINER}:${IN_CONTAINER}" "$TARGET" || on_error "docker cp ล้มเหลว"
SIZE=$(stat -c '%s' "$TARGET" 2>/dev/null || echo 0)
[ "$SIZE" -gt 1024 ] || on_error "ไฟล์ที่ได้เล็กผิดปกติ (${SIZE} bytes)"
chmod 600 "$TARGET"
ok "เก็บแล้ว: ${BASENAME} ($(numfmt --to=iec "$SIZE" 2>/dev/null || echo "${SIZE}B"))"

step "4/5 ลบ backup ที่เก่ากว่า ${RETENTION_DAYS} วัน"
DELETED=$(find "$BACKUP_DIR" -maxdepth 1 -name 'posmobileorderdb-*.dump' -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)
ok "ลบไป ${DELETED} ไฟล์ · เหลืออยู่ $(find "$BACKUP_DIR" -maxdepth 1 -name 'posmobileorderdb-*.dump' | wc -l) ไฟล์"

step "5/5 สำเนาขึ้นปลายทางนอกเครื่อง (ถ้าตั้งค่าไว้)"
REMOTE="$(env_get BACKUP_REMOTE)"
if [ -z "$REMOTE" ]; then
  # ไม่ใช่ข้อผิดพลาด — สำเนาที่สองหลักของโปรเจกต์นี้คือ ops/pull-backup.ps1
  # ที่ดึงลงเครื่อง Windows ทาง scp ส่วน rclone เป็นทางเลือกเสริม
  ok "ไม่ได้ตั้ง BACKUP_REMOTE — ข้าม (สำเนาที่สองใช้ ops/pull-backup.ps1 แทน)"
elif ! command -v rclone > /dev/null; then
  warn "ตั้ง BACKUP_REMOTE ไว้แต่ไม่มี rclone ในเครื่อง — ข้าม"
else
  rclone copy "$TARGET" "$REMOTE" && ok "ส่งขึ้น ${REMOTE} แล้ว" || warn "rclone ล้มเหลว (ไฟล์บนเครื่องยังอยู่ครบ)"
fi

log "เสร็จสมบูรณ์ — ${TARGET}"

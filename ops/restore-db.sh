#!/usr/bin/env bash
#
# restore-db.sh — กู้ฐานข้อมูลจากไฟล์ backup
#
#   bash ops/restore-db.sh --drill              # ซ้อมกู้ (ไม่แตะฐานจริง) ← ใช้บ่อยสุด
#   bash ops/restore-db.sh --drill <ไฟล์.dump>  # ซ้อมกู้จากไฟล์ที่ระบุ
#   bash ops/restore-db.sh --force <ไฟล์.dump>  # กู้ทับฐานจริง ⚠️ ข้อมูลปัจจุบันหายหมด
#
# โหมด --drill คือหัวใจ: สร้างฐานชั่วคราวชื่อ <db>_drill_<timestamp> กู้ลงไปที่นั่น
# นับตารางกับจำนวนแถวเทียบกับฐานจริง แล้วลบฐานชั่วคราวทิ้ง
# **ไม่มีคำสั่งใดแตะฐาน production เลย** — ซ้อมตอนไหนก็ได้แม้ร้านกำลังขายอยู่
#
# ⚠️ backup ที่ไม่เคยซ้อมกู้ = ไม่รู้ว่ากู้ได้จริงไหม ให้รัน --drill อย่างน้อยเดือนละครั้ง

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ops/lib-common.sh
. "${SCRIPT_DIR}/lib-common.sh"

MODE=""
DUMP_FILE=""
for arg in "$@"; do
  case "$arg" in
    --drill) MODE="drill" ;;
    --force) MODE="force" ;;
    -*) fail "ไม่รู้จักตัวเลือก ${arg}" ;;
    *) DUMP_FILE="$arg" ;;
  esac
done

[ -n "$MODE" ] || fail "ต้องระบุ --drill (ซ้อม) หรือ --force (กู้จริง)
  ซ้อมกู้ล่าสุด: bash ops/restore-db.sh --drill"

require_docker
require_db_running

USER_NAME="$(pg_user)"
DB_NAME="$(pg_db)"

# ── หาไฟล์ backup ───────────────────────────────────────────────────────────
if [ -z "$DUMP_FILE" ]; then
  DUMP_FILE=$(find "$BACKUP_DIR" -maxdepth 1 -name 'posmobileorderdb-*.dump' -printf '%T@ %p\n' 2>/dev/null \
              | sort -rn | head -1 | cut -d' ' -f2-)
  [ -n "$DUMP_FILE" ] || fail "ไม่พบไฟล์ backup ใน ${BACKUP_DIR} — รัน ops/backup-db.sh ก่อน"
  log "ใช้ไฟล์ล่าสุดโดยอัตโนมัติ: $(basename "$DUMP_FILE")"
fi
[ -f "$DUMP_FILE" ] || fail "ไม่พบไฟล์ ${DUMP_FILE}"

IN_CONTAINER="/tmp/restore-$(basename "$DUMP_FILE")"
docker cp "$DUMP_FILE" "${DB_CONTAINER}:${IN_CONTAINER}" > /dev/null

psql_q() { docker exec "$DB_CONTAINER" psql -U "$USER_NAME" -d "$1" -tAc "$2" 2>/dev/null; }

# ── นับของในฐานจริงไว้เทียบ ─────────────────────────────────────────────────
REAL_TABLES=$(psql_q "$DB_NAME" "select count(*) from pg_tables where schemaname='public'" || echo 0)

if [ "$MODE" = "drill" ]; then
  DRILL_DB="${DB_NAME}_drill_$(date '+%H%M%S')"

  cleanup_drill() {
    docker exec "$DB_CONTAINER" psql -U "$USER_NAME" -d postgres \
      -c "DROP DATABASE IF EXISTS \"${DRILL_DB}\"" > /dev/null 2>&1 || true
    docker exec "$DB_CONTAINER" rm -f "$IN_CONTAINER" > /dev/null 2>&1 || true
  }
  trap cleanup_drill EXIT

  step "1/4 สร้างฐานซ้อม ${DRILL_DB} (ฐานจริง ${DB_NAME} ไม่ถูกแตะ)"
  docker exec "$DB_CONTAINER" psql -U "$USER_NAME" -d postgres \
    -c "CREATE DATABASE \"${DRILL_DB}\"" > /dev/null || fail "สร้างฐานซ้อมไม่ได้"
  ok "สร้างแล้ว"

  step "2/4 กู้ข้อมูลลงฐานซ้อม"
  # ไม่ใช้ --exit-on-error เพราะ dump มี GRANT/OWNER ที่อาจไม่ตรงกับฐานเปล่า
  # ความถูกต้องวัดจากจำนวนตาราง/แถวในขั้นถัดไปแทน
  docker exec "$DB_CONTAINER" pg_restore -U "$USER_NAME" -d "$DRILL_DB" --no-owner --no-privileges \
    "$IN_CONTAINER" > /tmp/drill.log 2>&1 || warn "pg_restore มีข้อความเตือน (ดูรายละเอียดด้านล่างถ้าจำนวนตารางไม่ตรง)"
  ok "กู้เสร็จ"

  step "3/4 เทียบจำนวนตารางกับฐานจริง"
  DRILL_TABLES=$(psql_q "$DRILL_DB" "select count(*) from pg_tables where schemaname='public'" || echo 0)
  log "    ฐานจริง ${REAL_TABLES} ตาราง · ฐานซ้อม ${DRILL_TABLES} ตาราง"
  [ "$DRILL_TABLES" = "$REAL_TABLES" ] || fail "จำนวนตารางไม่ตรง — backup นี้กู้ได้ไม่ครบ"
  ok "ครบทุกตาราง"

  step "4/4 เทียบจำนวนแถวรายตาราง"
  MISMATCH=0
  for t in $(psql_q "$DB_NAME" "select tablename from pg_tables where schemaname='public' order by 1"); do
    A=$(psql_q "$DB_NAME"  "select count(*) from \"$t\"" || echo "?")
    B=$(psql_q "$DRILL_DB" "select count(*) from \"$t\"" || echo "?")
    if [ "$A" = "$B" ]; then
      log "    ✓ ${t}: ${A} แถว"
    else
      log "    ✗ ${t}: ฐานจริง ${A} · ฐานซ้อม ${B}"
      MISMATCH=$((MISMATCH + 1))
    fi
  done
  [ "$MISMATCH" -eq 0 ] || fail "มี ${MISMATCH} ตารางที่จำนวนแถวไม่ตรง"

  log ""
  log "═══════════════════════════════════════════════════════════"
  log " ✅ ซ้อมกู้คืนผ่าน — ${REAL_TABLES} ตาราง ครบทุกแถว"
  log " ไฟล์: $(basename "$DUMP_FILE")"
  log " ฐานจริง ${DB_NAME} ไม่ถูกแตะเลยตลอดการซ้อม"
  log "═══════════════════════════════════════════════════════════"
  exit 0
fi

# ── โหมดกู้จริง ─────────────────────────────────────────────────────────────
log ""
warn "⚠️  โหมด --force จะ DROP ฐาน ${DB_NAME} แล้วสร้างใหม่จาก backup"
warn "⚠️  ข้อมูลปัจจุบันทั้งหมดหายถาวร"
log ""
read -r -p "พิมพ์ชื่อฐาน '${DB_NAME}' เพื่อยืนยัน: " CONFIRM
[ "$CONFIRM" = "$DB_NAME" ] || fail "ยกเลิก (ที่พิมพ์มาไม่ตรง)"

step "1/4 สำรองฐานปัจจุบันไว้ก่อนทับ (กันพลาด)"
SAFETY="${BACKUP_DIR}/pre-restore-$(date '+%Y%m%d-%H%M%S').dump"
docker exec "$DB_CONTAINER" pg_dump -U "$USER_NAME" -d "$DB_NAME" -Fc -f /tmp/safety.dump \
  && docker cp "${DB_CONTAINER}:/tmp/safety.dump" "$SAFETY" \
  && ok "สำรองไว้ที่ ${SAFETY}" || fail "สำรองก่อนทับไม่สำเร็จ — หยุดไว้ก่อน ไม่กู้ทับ"

step "2/4 หยุดแอปกันไม่ให้เขียนระหว่างกู้"
docker stop "$APP_CONTAINER" > /dev/null 2>&1 && ok "หยุด ${APP_CONTAINER} แล้ว" || warn "หยุดแอปไม่ได้ (อาจไม่ได้รันอยู่)"

step "3/4 สร้างฐานใหม่แล้วกู้"
docker exec "$DB_CONTAINER" psql -U "$USER_NAME" -d postgres -c "DROP DATABASE IF EXISTS \"${DB_NAME}\"" > /dev/null
docker exec "$DB_CONTAINER" psql -U "$USER_NAME" -d postgres -c "CREATE DATABASE \"${DB_NAME}\"" > /dev/null
docker exec "$DB_CONTAINER" pg_restore -U "$USER_NAME" -d "$DB_NAME" --no-owner --no-privileges "$IN_CONTAINER" \
  || warn "pg_restore มีข้อความเตือน"
NEW_TABLES=$(psql_q "$DB_NAME" "select count(*) from pg_tables where schemaname='public'" || echo 0)
ok "กู้แล้ว ${NEW_TABLES} ตาราง"

step "4/4 เปิดแอปกลับ"
docker start "$APP_CONTAINER" > /dev/null 2>&1 && ok "เปิด ${APP_CONTAINER} แล้ว" || warn "เปิดแอปไม่ได้"
docker exec "$DB_CONTAINER" rm -f "$IN_CONTAINER" > /dev/null 2>&1 || true

log "เสร็จ — ถ้าผลไม่เป็นอย่างที่คิด ย้อนกลับได้จาก ${SAFETY}"

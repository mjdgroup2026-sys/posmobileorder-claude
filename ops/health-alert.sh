#!/usr/bin/env bash
#
# health-alert.sh — เฝ้า /api/health แล้วเตือนทางอีเมลเมื่อ "สถานะเปลี่ยน"
#
# รันจาก cron ทุก 5 นาที (ops/install-cron.sh ติดตั้งให้แล้ว)
#
# กติกาสำคัญ 2 ข้อ ที่ทำให้ไม่สแปม:
#   1. เตือนเฉพาะตอน "เปลี่ยนสถานะ" (ปกติ→ล่ม, ล่ม→ปกติ) ไม่ใช่ทุกครั้งที่ล่ม
#   2. ต้องล้มติดกัน 2 ครั้ง (= 10 นาที) ถึงประกาศว่าล่ม — กันเตือนหลอกตอน deploy
#      ที่คอนเทนเนอร์ถูกสร้างใหม่แล้วเว็บดาวน์ราว 1 นาที
#
# สถานะเก็บใน STATE_FILE เป็น 2 บรรทัด: สถานะปัจจุบัน กับจำนวนครั้งที่ล้มติดกัน

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ops/lib-common.sh
. "${SCRIPT_DIR}/lib-common.sh"

STATE_FILE="${STATE_FILE:-/home/deploy/.health-state}"
FAIL_THRESHOLD="${FAIL_THRESHOLD:-2}"

prev_state="ok"
fails=0
if [ -f "$STATE_FILE" ]; then
  prev_state=$(sed -n '1p' "$STATE_FILE" 2>/dev/null || echo ok)
  fails=$(sed -n '2p' "$STATE_FILE" 2>/dev/null || echo 0)
fi
[ -n "$prev_state" ] || prev_state="ok"
case "$fails" in ''|*[!0-9]*) fails=0 ;; esac

BODY_FILE="/tmp/health-body-$$.txt"
trap 'rm -f "$BODY_FILE"' EXIT

# ⚠️ ต้องล้างไฟล์ก่อนยิงเสมอ — ถ้าต่อไม่ติด curl จะไม่เขียนอะไรลงไฟล์เลย
# แล้วเรารายงาน "ตอบกลับ" ของรอบก่อนหน้าที่ยังค้างอยู่ (เจอตอนเทสจริง:
# ระบบล่มแต่อีเมลแนบ body ที่เขียนว่า status ok)
: > "$BODY_FILE"

# ⚠️ ห้ามใช้ `|| echo 000` ต่อท้าย — ตอนต่อไม่ติด curl พิมพ์ "000" ออกมาอยู่แล้ว
# แล้ว echo ต่อท้ายอีกจะได้ "000000" (เจอตอนเทสจริง)
CODE=$(curl -s -o "$BODY_FILE" -w '%{http_code}' --max-time 15 "$HEALTH_URL" 2>/dev/null) || true
[ -n "$CODE" ] || CODE="000"
BODY=$(head -c 300 "$BODY_FILE" 2>/dev/null || echo "")
[ -n "$BODY" ] || BODY="(ไม่มีข้อมูลตอบกลับ — ต่อไม่ติด)"

write_state() { printf '%s\n%s\n' "$1" "$2" > "$STATE_FILE"; }

if [ "$CODE" = "200" ]; then
  if [ "$prev_state" = "down" ]; then
    log "สถานะเปลี่ยน: ล่ม → ปกติ"
    notify "[MJD] ระบบกลับมาปกติแล้ว" \
      "URL: ${HEALTH_URL}
เวลา: $(date '+%Y-%m-%d %H:%M:%S')
HTTP: ${CODE}
ตอบกลับ: ${BODY}"
  else
    log "ปกติ (HTTP ${CODE})"
  fi
  write_state "ok" 0
  exit 0
fi

fails=$((fails + 1))
log "ตรวจไม่ผ่าน (HTTP ${CODE}) ล้มติดกัน ${fails}/${FAIL_THRESHOLD} ครั้ง"

if [ "$fails" -ge "$FAIL_THRESHOLD" ] && [ "$prev_state" != "down" ]; then
  log "สถานะเปลี่ยน: ปกติ → ล่ม"
  CONTAINERS=$(docker ps --format '{{.Names}}={{.Status}}' 2>/dev/null | tr '\n' ' ' || echo "อ่านไม่ได้")
  notify "[MJD] 🔴 ระบบล่ม — ${HEALTH_URL}" \
    "URL: ${HEALTH_URL}
เวลา: $(date '+%Y-%m-%d %H:%M:%S')
HTTP: ${CODE} (ล้มติดกัน ${fails} ครั้ง)
ตอบกลับ: ${BODY}

คอนเทนเนอร์ตอนนี้: ${CONTAINERS}

ตรวจต่อ:
  ssh posmobileorder
  cd ${STACK_DIR} && docker compose -f docker-compose.prod.yml ps
  docker logs --tail 50 $(active_app_container)"
  write_state "down" "$fails"
  exit 1
fi

write_state "$prev_state" "$fails"
exit 1

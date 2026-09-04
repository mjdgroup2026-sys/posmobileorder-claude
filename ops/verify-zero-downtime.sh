#!/usr/bin/env bash
#
# verify-zero-downtime.sh — พิสูจน์ว่าการสลับสีไม่ทำให้คำขอใดล้มเลย
#
#   bash ops/verify-zero-downtime.sh
#
# เกณฑ์ผ่านตามสเปก Phase 5: **ยิง /api/health ทุก 0.2 วินาทีตลอดช่วงสลับสี ต้องล้ม 0 ครั้ง**
#
# วิธีทำงาน: สตาร์ตตัวยิงไว้เบื้องหลัง → รัน ops/switch-deploy.sh → หยุดตัวยิง → นับผล
# ทุกคำขอที่ได้ status ไม่ใช่ 200 (รวม 502/504/000 ที่ต่อไม่ติด) นับเป็น "ล้ม"
#
# ⚠️ ต้องรันบน server (ยิงผ่านโดเมนจริงเพื่อวัดสิ่งที่ผู้ใช้เจอ ไม่ใช่ผ่าน loopback)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ops/lib-common.sh
. "${SCRIPT_DIR}/lib-common.sh"

readonly PROBE_LOG="/tmp/zero-downtime-probe.log"
readonly INTERVAL="${PROBE_INTERVAL:-0.2}"

command -v curl > /dev/null || fail "ไม่มีคำสั่ง curl"

log "═══════════════════════════════════════════════════════════"
log " ทดสอบ zero-downtime — ยิง ${HEALTH_URL} ทุก ${INTERVAL} วินาที"
log "═══════════════════════════════════════════════════════════"

: > "$PROBE_LOG"

# ── ตัวยิงเบื้องหลัง ────────────────────────────────────────────────────────
# --max-time 5 กันคำขอค้างข้ามช่วงสลับจนวัดไม่เจอปัญหา
probe() {
  while :; do
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" 2>/dev/null) || true
    [ -n "$code" ] || code="000"
    echo "$code" >> "$PROBE_LOG"
    sleep "$INTERVAL"
  done
}

probe &
PROBE_PID=$!
# หยุดตัวยิงเสมอแม้สคริปต์ถูก Ctrl-C กลางคัน ไม่งั้นมันค้างยิงต่อไปเรื่อย ๆ
trap 'kill "$PROBE_PID" 2>/dev/null || true' EXIT INT TERM

step "อุ่นเครื่อง 3 วินาทีก่อนเริ่มสลับ"
sleep 3
BEFORE=$(wc -l < "$PROBE_LOG")
ok "ยิงไปแล้ว ${BEFORE} ครั้งก่อนเริ่ม"

step "เริ่มสลับสี"
SWITCH_RC=0
bash "${SCRIPT_DIR}/switch-deploy.sh" || SWITCH_RC=$?

step "ยิงต่ออีก 3 วินาทีหลังสลับเสร็จ"
sleep 3

kill "$PROBE_PID" 2>/dev/null || true
wait "$PROBE_PID" 2>/dev/null || true

TOTAL=$(wc -l < "$PROBE_LOG")
FAILED=$(grep -vc '^200$' "$PROBE_LOG" || true)
[ -n "$FAILED" ] || FAILED=0

log ""
log "── ผลการทดสอบ ──────────────────────────────────────────────"
log "  คำขอทั้งหมด : ${TOTAL}"
log "  ล้ม         : ${FAILED}"
if [ "$FAILED" != "0" ]; then
  log "  status ที่ไม่ใช่ 200:"
  grep -v '^200$' "$PROBE_LOG" | sort | uniq -c | while read -r n c; do log "    ${c} × ${n}"; done
fi
log "  log ดิบ     : ${PROBE_LOG}"
log "───────────────────────────────────────────────────────────"

[ "$SWITCH_RC" = "0" ] || fail "switch-deploy.sh ล้ม (exit ${SWITCH_RC}) — ดูข้อความด้านบน"
[ "$FAILED" = "0" ] || fail "มีคำขอล้ม ${FAILED} ครั้ง — ยังไม่ผ่านเกณฑ์ zero-downtime"

log ""
log "✅ ผ่านเกณฑ์ — สลับสีโดยไม่มีคำขอใดล้มเลย (${TOTAL} คำขอ)"

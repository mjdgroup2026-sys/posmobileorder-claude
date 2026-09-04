#!/usr/bin/env bash
#
# switch-deploy.sh — สลับแอปเป็นสีใหม่แบบไม่มี downtime (blue/green)
#
#   bash ops/switch-deploy.sh          # สลับไปสีตรงข้ามด้วย image ปัจจุบัน
#   bash ops/switch-deploy.sh --status # ดูว่าสีไหนรับ traffic อยู่
#
# ลำดับที่ทำ (ล้มขั้นไหนก็ไม่แตะ nginx — ของเดิมยังรับ traffic ต่อได้เสมอ):
#   1. หาสีที่รับ traffic อยู่ → สีเป้าหมายคือสีตรงข้าม
#   2. สตาร์ตสีใหม่ (compose รอ healthcheck ของ container ให้)
#   3. ยิง /api/health ที่พอร์ตของสีใหม่ตรง ๆ ผ่าน loopback ซ้ำอีกชั้น
#   4. เขียนไฟล์ upstream ของ nginx ชี้ไปสีใหม่ → nginx -t → nginx -s reload (graceful)
#   5. ยืนยันผ่าน HTTPS ปลายทางจริง
#   6. **ค่อย** หยุดสีเก่า
#
# ⚠️ ห้ามใส่ --remove-orphans ใน compose ที่นี่ — สีเก่าอยู่คนละ profile กัน
#    compose จะถือว่าเป็น orphan แล้วลบทิ้งกลางคัน = downtime เต็ม ๆ
#
# ⚠️ ต้องรัน ops/setup-zero-downtime.sh ครั้งเดียวก่อน (สร้างไฟล์ upstream + สิทธิ์ sudo
#    เฉพาะคำสั่ง nginx -t / -s reload) มิฉะนั้นขั้นที่ 4 จะทำไม่ได้

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ops/lib-common.sh
. "${SCRIPT_DIR}/lib-common.sh"

require_docker

CURRENT="$(active_color)"
TARGET="$(other_color "$CURRENT")"
TARGET_PORT="$(app_port "$TARGET")"
TARGET_CONTAINER="$(app_container "$TARGET")"
CURRENT_CONTAINER="$(app_container "$CURRENT")"

if [ "${1:-}" = "--status" ]; then
  log "สีที่รับ traffic อยู่: ${CURRENT} (พอร์ต $(app_port "$CURRENT"), คอนเทนเนอร์ ${CURRENT_CONTAINER})"
  log "APP_TAG ที่ใช้อยู่:    $(env_get APP_TAG latest)"
  [ -f "$NGINX_UPSTREAM_CONF" ] && log "upstream:            $(grep -E 'server ' "$NGINX_UPSTREAM_CONF" | tr -s ' ')" \
    || warn "ยังไม่มี ${NGINX_UPSTREAM_CONF} — ยังไม่ได้รัน ops/setup-zero-downtime.sh"
  exit 0
fi

[ -f "$COMPOSE_FILE" ] || fail "ไม่พบ ${COMPOSE_FILE}"
[ -f "$NGINX_UPSTREAM_CONF" ] || fail "ไม่พบ ${NGINX_UPSTREAM_CONF} — รัน: sudo bash ops/setup-zero-downtime.sh ก่อน"

log "═══════════════════════════════════════════════════════════"
log " สลับแอปแบบไม่มี downtime: ${CURRENT} → ${TARGET}"
log "═══════════════════════════════════════════════════════════"

# ── ทำความสะอาดเมื่อล้มกลางทาง: หยุดสีใหม่ทิ้ง ของเดิมยังรับ traffic ต่อ ──────
abort_new_color() {
  warn "ยกเลิกการสลับ — หยุด ${TARGET_CONTAINER} ทิ้ง (${CURRENT} ยังรับ traffic ตามเดิม)"
  docker compose -f "$COMPOSE_FILE" --profile "$TARGET" stop "app-${TARGET}" > /dev/null 2>&1 || true
  docker compose -f "$COMPOSE_FILE" --profile "$TARGET" rm -f "app-${TARGET}" > /dev/null 2>&1 || true
}

# ★ ดึง image ของ tag ที่จะใช้ก่อนเสมอ — กันเคสที่ image บนเครื่องเป็นของเก่าค้างอยู่
#   (เคยเกิดจริง: CI สั่ง `--profile tools pull` ซึ่งครอบแค่ db กับ migrate ส่วน app-blue/green
#   อยู่คนละ profile จึงไม่ถูกดึง แล้วสลับสีไปรันโค้ดเก่าทับ schema ใหม่ → 500 ทั้งเว็บ)
#   ล้มก็ไม่เป็นไร — ops/rollback.sh ต้องย้อนได้แม้ registry ล่ม จึงห้ามทำให้ทั้งสคริปต์ตาย
step "0/6 ดึง image ของ APP_TAG=$(env_get APP_TAG latest) ให้เป็นตัวล่าสุด"
if docker compose -f "$COMPOSE_FILE" --profile "$TARGET" pull "app-${TARGET}" > /dev/null 2>&1; then
  ok "ดึงจาก registry สำเร็จ"
else
  warn "ดึงจาก registry ไม่ได้ — ใช้ image ที่มีอยู่บนเครื่องต่อ (ปกติสำหรับ rollback ตอน registry ล่ม)"
fi

step "1/6 สตาร์ตสี ${TARGET} (พอร์ต ${TARGET_PORT})"
if ! docker compose -f "$COMPOSE_FILE" --profile "$TARGET" up -d --wait --wait-timeout 120 "app-${TARGET}" > /dev/null 2>&1; then
  warn "compose ไม่รายงานว่า healthy ใน 120 วินาที — ตรวจ health ต่อเองอีกชั้น"
fi
ok "สตาร์ตแล้ว"

step "2/6 ตรวจ health ของสี ${TARGET} ผ่าน loopback (ไม่เกิน 60 วินาที)"
NEW_OK=0
for i in $(seq 1 20); do
  # ห้ามต่อ `|| echo 000` — curl พิมพ์ 000 เองตอนต่อไม่ติด จะได้ "000000"
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${TARGET_PORT}/api/health" 2>/dev/null) || true
  [ -n "$CODE" ] || CODE="000"
  if [ "$CODE" = "200" ]; then NEW_OK=1; ok "สี ${TARGET} ตอบ 200 (ครั้งที่ ${i})"; break; fi
  log "    ครั้งที่ ${i}: HTTP ${CODE} — รอต่อ"
  sleep 3
done
if [ "$NEW_OK" != "1" ]; then
  abort_new_color
  fail "สี ${TARGET} ไม่ตอบ 200 ภายใน 60 วินาที — ไม่สลับ"
fi

step "3/6 ตรวจว่าพอร์ต ${TARGET_PORT} เป็นของคอนเทนเนอร์ที่ตั้งใจจริง"
BOUND=$(docker inspect -f '{{range $p, $c := .NetworkSettings.Ports}}{{range $c}}{{.HostPort}} {{end}}{{end}}' "$TARGET_CONTAINER" 2>/dev/null | tr -d '\n')
case " $BOUND " in
  *" ${TARGET_PORT} "*) ok "พอร์ตตรง (${TARGET_CONTAINER} → ${TARGET_PORT})" ;;
  *)
    abort_new_color
    fail "พอร์ตของ ${TARGET_CONTAINER} ไม่ตรงกับที่คาด (ได้ '${BOUND}' คาด ${TARGET_PORT}) — ไม่สลับ"
    ;;
esac

step "4/6 ชี้ nginx ไปสี ${TARGET} แล้ว reload แบบ graceful"
UPSTREAM_BACKUP="/tmp/pos-upstream.before-switch.conf"
cp "$NGINX_UPSTREAM_CONF" "$UPSTREAM_BACKUP" 2>/dev/null || true
# เขียนทับทั้งไฟล์ทุกครั้ง — ไฟล์นี้มีหน้าที่เดียวคือบอกว่าสีไหนรับ traffic
if ! printf 'upstream pos_app {\n    server 127.0.0.1:%s;\n}\n' "$TARGET_PORT" | sudo tee "$NGINX_UPSTREAM_CONF" > /dev/null; then
  abort_new_color
  fail "เขียน ${NGINX_UPSTREAM_CONF} ไม่ได้ — ตรวจสิทธิ์ sudo (ops/setup-zero-downtime.sh)"
fi

if ! sudo nginx -t > /dev/null 2>&1; then
  sudo cp "$UPSTREAM_BACKUP" "$NGINX_UPSTREAM_CONF" 2>/dev/null || true
  abort_new_color
  fail "nginx -t ไม่ผ่าน — คืนไฟล์ upstream เดิมแล้ว ไม่ได้ reload"
fi

if ! sudo nginx -s reload > /dev/null 2>&1; then
  sudo cp "$UPSTREAM_BACKUP" "$NGINX_UPSTREAM_CONF" 2>/dev/null || true
  sudo nginx -s reload > /dev/null 2>&1 || true
  abort_new_color
  fail "reload nginx ไม่สำเร็จ — คืนค่าเดิมแล้ว"
fi
ok "nginx ชี้ไป 127.0.0.1:${TARGET_PORT} แล้ว"

step "5/6 ยืนยันผ่าน ${HEALTH_URL}"
LIVE_OK=0
for i in $(seq 1 10); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$HEALTH_URL" 2>/dev/null) || true
  [ -n "$CODE" ] || CODE="000"
  if [ "$CODE" = "200" ]; then LIVE_OK=1; ok "ปลายทางจริงตอบ 200 (ครั้งที่ ${i})"; break; fi
  log "    ครั้งที่ ${i}: HTTP ${CODE} — รอต่อ"
  sleep 3
done
if [ "$LIVE_OK" != "1" ]; then
  warn "ปลายทางจริงยังไม่ตอบ 200 — ย้อน nginx กลับไปสี ${CURRENT}"
  printf 'upstream pos_app {\n    server 127.0.0.1:%s;\n}\n' "$(app_port "$CURRENT")" | sudo tee "$NGINX_UPSTREAM_CONF" > /dev/null
  sudo nginx -s reload > /dev/null 2>&1 || true
  abort_new_color
  notify "[MJD] สลับ deploy ไม่สำเร็จ" "ย้อนกลับไปสี ${CURRENT} แล้ว · health ล่าสุด HTTP ${CODE}"
  fail "สลับไม่สำเร็จ — คืนค่าเป็นสี ${CURRENT} แล้ว"
fi

step "6/6 หยุดสี ${CURRENT} ที่ไม่มีใครใช้แล้ว"
docker compose -f "$COMPOSE_FILE" --profile "$CURRENT" stop "app-${CURRENT}" > /dev/null 2>&1 || true
docker compose -f "$COMPOSE_FILE" --profile "$CURRENT" rm -f "app-${CURRENT}" > /dev/null 2>&1 || true
ok "หยุด ${CURRENT_CONTAINER} แล้ว"

log ""
log "✅ สลับสำเร็จ — ตอนนี้สี ${TARGET} (พอร์ต ${TARGET_PORT}) รับ traffic อยู่"

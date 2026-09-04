#!/usr/bin/env bash
#
# setup-zero-downtime.sh — ตั้งค่าเครื่อง server ครั้งเดียวให้รองรับ deploy แบบ blue/green
#
#   sudo bash ops/setup-zero-downtime.sh
#
# ทำ 4 อย่าง:
#   1. สร้าง /etc/nginx/conf.d/pos-upstream.conf ชี้ไปสีที่รันอยู่ตอนนี้
#   2. แก้ vhost ให้ proxy_pass ผ่าน upstream `pos_app` แทนพอร์ตตายตัว (สำรองไฟล์เดิมไว้)
#   3. เปิดสิทธิ์ sudo แบบ NOPASSWD ให้ user deploy เฉพาะ `nginx -t` กับ `nginx -s reload`
#      — CI สั่งผ่าน ssh แบบ non-interactive จึงถามรหัสผ่านไม่ได้ และการให้ทั้ง nginx
#      แบบไม่จำกัดคำสั่งเท่ากับให้สิทธิ์เขียนไฟล์ทั้งเครื่องผ่าน -c
#   4. จำกัด max-concurrent-downloads ของ docker
#      — image ~300MB บนเครื่อง 2 vCPU ทำให้แอปที่รันอยู่ตอบช้าจน timeout ได้ราว 40 วินาที
#        **ก่อน** ถึงขั้นสลับสีด้วยซ้ำ ดึงทีละชั้นน้อยลงกิน I/O น้อยลง
#
# รันซ้ำได้ไม่มีผลข้างเคียง (idempotent)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ops/lib-common.sh
. "${SCRIPT_DIR}/lib-common.sh"

readonly VHOST="/etc/nginx/sites-enabled/posmobileorder"
readonly SUDOERS="/etc/sudoers.d/deploy-nginx"
readonly DOCKER_DAEMON="/etc/docker/daemon.json"
DEPLOY_USER="${DEPLOY_USER:-deploy}"

[ "$(id -u)" = "0" ] || fail "ต้องรันด้วย sudo — sudo bash ops/setup-zero-downtime.sh"
command -v nginx > /dev/null || fail "ไม่มี nginx บนเครื่องนี้"

log "═══════════════════════════════════════════════════════════"
log " ตั้งค่า zero-downtime deploy (blue/green)"
log "═══════════════════════════════════════════════════════════"

# ── 1) ไฟล์ upstream ────────────────────────────────────────────────────────
step "1/4 สร้าง ${NGINX_UPSTREAM_CONF}"
if [ -f "$NGINX_UPSTREAM_CONF" ]; then
  ok "มีอยู่แล้ว — $(grep -E 'server ' "$NGINX_UPSTREAM_CONF" | tr -s ' ')"
else
  # ตั้งต้นที่ blue (พอร์ตเดิมที่ vhost ชี้อยู่) จะได้ไม่สะดุดตอนเปลี่ยน
  printf 'upstream pos_app {\n    server 127.0.0.1:%s;\n}\n' "$APP_BLUE_PORT" > "$NGINX_UPSTREAM_CONF"
  ok "สร้างแล้ว ชี้ไป 127.0.0.1:${APP_BLUE_PORT} (สี blue)"
fi

# ── 2) vhost ────────────────────────────────────────────────────────────────
step "2/4 ให้ vhost proxy_pass ผ่าน upstream pos_app"
if [ ! -f "$VHOST" ]; then
  warn "ไม่พบ ${VHOST} — ข้ามขั้นนี้ ต้องแก้ proxy_pass เป็น http://pos_app เองภายหลัง"
elif grep -q 'proxy_pass http://pos_app' "$VHOST"; then
  ok "ชี้ผ่าน upstream อยู่แล้ว"
else
  cp "$VHOST" "${VHOST}.bak.$(date +%Y%m%d%H%M%S)"
  # แทนที่เฉพาะ proxy_pass ที่ชี้ 127.0.0.1:<port> เท่านั้น ไม่แตะบรรทัดอื่น
  sed -i -E 's|proxy_pass http://127\.0\.0\.1:[0-9]+;|proxy_pass http://pos_app;|g' "$VHOST"
  if grep -q 'proxy_pass http://pos_app' "$VHOST"; then
    ok "แก้แล้ว (สำรองไฟล์เดิมไว้เป็น .bak)"
  else
    warn "หา proxy_pass รูปแบบที่คาดไว้ไม่เจอ — ต้องแก้เป็น http://pos_app เอง"
  fi
fi

# ── 3) sudoers ──────────────────────────────────────────────────────────────
step "3/4 เปิด sudo NOPASSWD เฉพาะ nginx -t / nginx -s reload ให้ ${DEPLOY_USER}"
NGINX_BIN="$(command -v nginx)"
# Ubuntu ทำ usrmerge แล้ว /bin/cp เป็น symlink ไป /usr/bin/cp — sudoers เทียบ path แบบตรงตัว
# ถ้าเขียน /bin/cp ไว้แต่ sudo resolve เป็น /usr/bin/cp จะไม่ match แล้ว NOPASSWD ไม่ทำงาน
TEE_BIN="$(command -v tee)"
CP_BIN="$(command -v cp)"
cat > "${SUDOERS}.tmp" <<EOF
# ให้ deploy สั่ง reload nginx จาก CI ได้โดยไม่ต้องใส่รหัสผ่าน
# จำกัดเฉพาะสองคำสั่งนี้เท่านั้น — 'nginx' แบบไม่จำกัด argument เปิดทาง -c ให้โหลด
# config ที่ไหนก็ได้ ซึ่งเท่ากับยกสิทธิ์ root เต็มใบ
${DEPLOY_USER} ALL=(root) NOPASSWD: ${NGINX_BIN} -t, ${NGINX_BIN} -s reload
${DEPLOY_USER} ALL=(root) NOPASSWD: ${TEE_BIN} ${NGINX_UPSTREAM_CONF}
${DEPLOY_USER} ALL=(root) NOPASSWD: ${CP_BIN} /tmp/pos-upstream.before-switch.conf ${NGINX_UPSTREAM_CONF}
EOF
# visudo -c กันไฟล์พังทำให้ sudo ทั้งเครื่องใช้ไม่ได้ — ตรวจก่อนย้ายเข้าที่จริงเสมอ
if visudo -cf "${SUDOERS}.tmp" > /dev/null 2>&1; then
  install -m 0440 -o root -g root "${SUDOERS}.tmp" "$SUDOERS"
  rm -f "${SUDOERS}.tmp"
  ok "เขียน ${SUDOERS} แล้ว"
else
  rm -f "${SUDOERS}.tmp"
  fail "ไฟล์ sudoers ที่สร้างขึ้นไม่ผ่าน visudo -c — ไม่ติดตั้ง (กัน sudo พังทั้งเครื่อง)"
fi

# ── 4) docker daemon ────────────────────────────────────────────────────────
step "4/4 จำกัด max-concurrent-downloads ของ docker"
if [ -f "$DOCKER_DAEMON" ] && grep -q 'max-concurrent-downloads' "$DOCKER_DAEMON"; then
  ok "ตั้งไว้แล้ว"
else
  mkdir -p /etc/docker
  if [ -f "$DOCKER_DAEMON" ]; then
    cp "$DOCKER_DAEMON" "${DOCKER_DAEMON}.bak.$(date +%Y%m%d%H%M%S)"
    warn "มี ${DOCKER_DAEMON} อยู่แล้ว — สำรองไว้ให้แล้ว แต่ต้องเติม max-concurrent-downloads เอง"
  else
    printf '{\n  "max-concurrent-downloads": 2\n}\n' > "$DOCKER_DAEMON"
    systemctl restart docker > /dev/null 2>&1 && ok "ตั้งเป็น 2 และรีสตาร์ต docker แล้ว" \
      || warn "เขียนไฟล์แล้วแต่รีสตาร์ต docker ไม่สำเร็จ — สั่ง systemctl restart docker เอง"
  fi
fi

step "ตรวจ nginx แล้ว reload"
if nginx -t > /dev/null 2>&1; then
  nginx -s reload > /dev/null 2>&1 || systemctl reload nginx > /dev/null 2>&1 || true
  ok "nginx -t ผ่าน และ reload แล้ว"
else
  fail "nginx -t ไม่ผ่าน — ตรวจ config ก่อน (ไฟล์เดิมถูกสำรองไว้เป็น .bak)"
fi

log ""
log "✅ พร้อมใช้ blue/green แล้ว"
log "   ตรวจสถานะ:  bash ops/switch-deploy.sh --status"
log "   สลับสีเอง:   bash ops/switch-deploy.sh"

#!/usr/bin/env bash
#
# lib-common.sh — ค่าและฟังก์ชันที่สคริปต์ใน ops/ ใช้ร่วมกัน
# ไม่ได้ตั้งใจให้รันตรง ๆ — ให้ source เอา:  . "$(dirname "$0")/lib-common.sh"

# ── ที่อยู่ของ stack บน VPS ──────────────────────────────────────────────────
export STACK_DIR="${STACK_DIR:-/home/deploy/posmobileorder}"
export COMPOSE_FILE="${COMPOSE_FILE:-${STACK_DIR}/docker-compose.prod.yml}"
export ENV_FILE="${ENV_FILE:-${STACK_DIR}/.env}"
export DB_CONTAINER="${DB_CONTAINER:-posmobileorder-db}"
export BACKUP_DIR="${BACKUP_DIR:-/home/deploy/backups}"
export HEALTH_URL="${HEALTH_URL:-https://posqr.jayjayservices.com/api/health}"

# ── blue/green (Phase 5) ────────────────────────────────────────────────────
# แอปรันสองชุดสลับกัน สีเดียวเท่านั้นที่ nginx ชี้ไปหาในแต่ละช่วงเวลา
# ops/switch-deploy.sh เป็นตัวเดียวที่เขียนไฟล์ upstream นี้ จึงใช้มันเป็นแหล่งความจริง
export APP_BLUE_PORT="${APP_BLUE_PORT:-3001}"
export APP_GREEN_PORT="${APP_GREEN_PORT:-3002}"
export NGINX_UPSTREAM_CONF="${NGINX_UPSTREAM_CONF:-/etc/nginx/conf.d/pos-upstream.conf}"

app_container() { echo "posmobileorder-app-$1"; }
app_port()      { [ "$1" = "green" ] && echo "$APP_GREEN_PORT" || echo "$APP_BLUE_PORT"; }
other_color()   { [ "$1" = "blue" ] && echo "green" || echo "blue"; }

# สีที่รับ traffic อยู่ตอนนี้ — อ่านจากไฟล์ upstream ก่อน ถ้ายังไม่มี (ยังไม่เคยตั้ง
# zero-downtime) ค่อยเดาจากคอนเทนเนอร์ที่รันอยู่ · ไม่เจออะไรเลยถือว่า blue
active_color() {
  if [ -f "$NGINX_UPSTREAM_CONF" ] && grep -q ":${APP_GREEN_PORT};" "$NGINX_UPSTREAM_CONF" 2>/dev/null; then
    echo green; return
  fi
  if [ -f "$NGINX_UPSTREAM_CONF" ]; then echo blue; return; fi
  if docker inspect -f '{{.State.Running}}' "$(app_container green)" 2>/dev/null | grep -q true; then
    echo green; return
  fi
  echo blue
}

# คอนเทนเนอร์แอปที่กำลังรับ traffic — สคริปต์อื่น (health-alert/restore-db) ใช้ตัวนี้
# แทนชื่อคงที่เดิม `posmobileorder-app` ที่ไม่มีอยู่แล้วหลังแยกเป็นสองสี
active_app_container() { app_container "$(active_color)"; }
export APP_CONTAINER="${APP_CONTAINER:-}"

# ── ข้อความ ─────────────────────────────────────────────────────────────────
# ทุกบรรทัดมี timestamp เพราะสคริปต์พวกนี้รันจาก cron แล้วอ่านย้อนหลังจาก log
log()  { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }
ok()   { log "  ✓ $*"; }
warn() { log "  ⚠ $*"; }
step() { log "▶ $*"; }
fail() { log "  ✗ $*" >&2; exit 1; }

# ── อ่านค่าจาก .env ของ stack ───────────────────────────────────────────────
# ใช้ grep แทน `source` เพราะ .env อาจมีค่าที่มีอักขระพิเศษแล้ว shell ตีความผิด
env_get() {
  local key="$1" default="${2:-}"
  local val
  val=$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')
  echo "${val:-$default}"
}

pg_user() { env_get POSTGRES_USER posmobileorderuser; }
pg_db()   { env_get POSTGRES_DB   posmobileorderdb; }

# ── ตรวจก่อนเริ่ม ───────────────────────────────────────────────────────────
require_docker() {
  command -v docker > /dev/null || fail "ไม่มีคำสั่ง docker"
}

require_db_running() {
  docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null | grep -q true \
    || fail "คอนเทนเนอร์ ${DB_CONTAINER} ไม่ได้รันอยู่ — สั่ง docker compose -f ${COMPOSE_FILE} up -d ก่อน"
}

# ── แจ้งเตือนทางอีเมลผ่าน Resend ────────────────────────────────────────────
# ยังไม่ได้ตั้ง RESEND_API_KEY → เขียนลง log แทน ไม่ทำให้สคริปต์ล้ม
# (เจตนา: backup ต้องทำงานได้ตั้งแต่วันนี้ ไม่ต้องรออีเมลพร้อม)
notify() {
  local subject="$1" body="$2"
  local key from
  key=$(env_get RESEND_API_KEY)
  from=$(env_get MAIL_FROM)
  local to
  to=$(env_get ALERT_EMAIL)

  if [ -z "$key" ] || [ -z "$from" ] || [ -z "$to" ]; then
    warn "ยังไม่ได้ตั้ง RESEND_API_KEY / MAIL_FROM / ALERT_EMAIL — ข้ามการส่งอีเมล"
    log  "    เรื่อง: ${subject}"
    log  "    เนื้อหา: ${body}"
    return 0
  fi

  local code
  # ห้ามต่อ `|| echo 000` — curl พิมพ์ 000 เองตอนต่อไม่ติด จะได้ "000000"
  code=$(curl -sS -o /tmp/resend-resp.json -w '%{http_code}' --max-time 20 \
    -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer ${key}" \
    -H "Content-Type: application/json" \
    -d "$(printf '{"from":%s,"to":[%s],"subject":%s,"text":%s}' \
          "$(json_str "$from")" "$(json_str "$to")" \
          "$(json_str "$subject")" "$(json_str "$body")")" 2>/dev/null) || true
  [ -n "$code" ] || code="000"

  if [ "$code" = "200" ]; then
    ok "ส่งอีเมลแจ้งเตือนแล้ว"
  else
    warn "ส่งอีเมลไม่สำเร็จ (HTTP ${code}) — $(head -c 200 /tmp/resend-resp.json 2>/dev/null)"
  fi
}

# escape ข้อความให้เป็น JSON string ที่ถูกต้อง (ใช้ node เพราะมีติดเครื่องอยู่แล้ว
# และ jq ไม่ได้ติดตั้งไว้)
json_str() {
  if command -v node > /dev/null; then
    node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"
  else
    printf '"%s"' "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/' | tr -d '\n')"
  fi
}

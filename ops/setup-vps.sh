#!/usr/bin/env bash
#
# setup-vps.sh — ตั้งค่า VPS Ubuntu 24.04 ตัวใหม่ให้พร้อมรับ deploy ของ posmobileorder
#
# รันบนเครื่อง VPS ในฐานะ root (ครั้งแรกหลังเปิดเครื่องมา):
#   scp ops/setup-vps.sh root@<VPS_IP>:/root/
#   ssh root@<VPS_IP> 'bash /root/setup-vps.sh "ssh-ed25519 AAAA... jay@laptop"'
#
# ส่ง public key เป็นอาร์กิวเมนต์ตัวแรก หรือผ่านตัวแปร DEPLOY_SSH_KEY ก็ได้
# ถ้าไม่ส่ง สคริปต์จะวาง placeholder ไว้ให้ แล้ว "ข้ามขั้นตอนปิด password login"
# เพื่อไม่ให้ล็อกตัวเองออกจากเครื่อง (ดูขั้นตอนที่ 6)
#
# สคริปต์นี้รันซ้ำได้ (idempotent) — รันรอบสองจะไม่สร้างของซ้ำและไม่พัง

set -euo pipefail

readonly DEPLOY_USER="deploy"
readonly SSH_DIR="/home/${DEPLOY_USER}/.ssh"
readonly AUTH_KEYS="${SSH_DIR}/authorized_keys"
readonly SSHD_DROPIN="/etc/ssh/sshd_config.d/01-hardening.conf"
readonly CLOUDIMG_CONF="/etc/ssh/sshd_config.d/60-cloudimg-settings.conf"
readonly JAIL_LOCAL="/etc/fail2ban/jail.local"
readonly PLACEHOLDER_MARK="AAAA_PLACEHOLDER"
readonly PLACEHOLDER="ssh-ed25519 ${PLACEHOLDER_MARK}_แทนที่ด้วย_public_key_จริง placeholder"

# public key รับจากอาร์กิวเมนต์ตัวแรก หรือตัวแปรแวดล้อม DEPLOY_SSH_KEY
SSH_PUBLIC_KEY="${1:-${DEPLOY_SSH_KEY:-}}"

# ── ตัวช่วยแสดงสถานะระหว่างรัน ──────────────────────────────────────────────
step() { echo ""; echo "▶ $*"; }
ok()   { echo "  ✓ $*"; }
warn() { echo "  ⚠ $*"; }
fail() { echo "  ✗ $*" >&2; exit 1; }

# ── ตรวจก่อนเริ่ม ───────────────────────────────────────────────────────────
[ "$(id -u)" -eq 0 ] || fail "ต้องรันด้วย root (ใช้ sudo bash $0)"
command -v apt-get > /dev/null || fail "สคริปต์นี้ใช้กับ Ubuntu/Debian เท่านั้น"

echo "═══════════════════════════════════════════════════════════"
echo " ตั้งค่า VPS สำหรับ posmobileorder"
echo " เครื่อง: $(hostname)"
echo "═══════════════════════════════════════════════════════════"

# ── 1) สร้าง user deploy และเพิ่มเข้ากลุ่ม sudo ──────────────────────────────
# ตั้งรหัสผ่านเป็น locked ตั้งแต่ต้น — เครื่องนี้จะล็อกอินด้วย key อย่างเดียว
# ผลข้างเคียง: ไม่มีรหัสผ่านให้พิมพ์ตอน sudo · ดูวิธีจัดการที่ท้ายขั้นตอนนี้
step "1/7 สร้างผู้ใช้ ${DEPLOY_USER} และให้สิทธิ์ sudo"
if id -u "$DEPLOY_USER" > /dev/null 2>&1; then
  ok "มีผู้ใช้ ${DEPLOY_USER} อยู่แล้ว ข้ามการสร้าง"
else
  adduser --disabled-password --gecos "" "$DEPLOY_USER" > /dev/null
  ok "สร้างผู้ใช้ ${DEPLOY_USER} แล้ว (รหัสผ่านถูกล็อก ล็อกอินได้ด้วย key เท่านั้น)"
fi

usermod -aG sudo "$DEPLOY_USER"
ok "เพิ่ม ${DEPLOY_USER} เข้ากลุ่ม sudo แล้ว"

# ⚠️ `${DEPLOY_USER} ALL=(ALL) NOPASSWD:ALL` = ใครได้ SSH key ของบัญชีนี้ไปก็ได้ root ทันที
# โดยไม่ต้องรู้ความลับอะไรเพิ่มอีกเลย · key ตัวเดียวกันนี้เก็บอยู่ใน GitHub Secrets ของ CI ด้วย
# จึงเปิดให้ **เฉพาะตอนที่บัญชีไม่มีรหัสผ่าน** ซึ่งเป็นกรณีเดียวที่ไม่เปิดแล้ว sudo ไม่ได้เลย
#
# งานประจำวันของ deploy ไม่ต้องใช้ root กว้าง ๆ อยู่แล้ว:
#   - docker ใช้ผ่านกลุ่ม docker (ไม่ต้อง sudo)
#   - nginx reload ตอน deploy ใช้ NOPASSWD เฉพาะคำสั่ง ที่ ops/setup-zero-downtime.sh เขียนให้
PW_STATUS="$(passwd -S "$DEPLOY_USER" 2>/dev/null | awk '{print $2}')"

if [ -f "/etc/sudoers.d/90-${DEPLOY_USER}" ]; then
  ok "ตั้งค่า sudoers ของ ${DEPLOY_USER} ไว้แล้ว ไม่แตะซ้ำ"
  if [ "$PW_STATUS" = "P" ]; then
    warn "บัญชีนี้ตั้งรหัสผ่านไว้แล้ว จึงไม่จำเป็นต้องมี NOPASSWD:ALL อีก"
    warn "แนะนำให้ลบทิ้งเพื่อลดความเสี่ยง: sudo rm /etc/sudoers.d/90-${DEPLOY_USER}"
  fi
elif [ "$PW_STATUS" = "P" ]; then
  # มีรหัสผ่านให้พิมพ์อยู่แล้ว — ไม่ต้องเปิดประตูหลังให้ใครก็ตามที่ถือ key
  ok "บัญชีมีรหัสผ่านอยู่แล้ว — ใช้ sudo แบบใส่รหัสผ่านตามปกติ (ไม่เปิด NOPASSWD:ALL)"
else
  echo "${DEPLOY_USER} ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-${DEPLOY_USER}"
  chmod 440 "/etc/sudoers.d/90-${DEPLOY_USER}"
  # ตรวจไวยากรณ์ทันที — sudoers พังแล้วใช้ sudo ไม่ได้ทั้งเครื่อง
  visudo -c > /dev/null || fail "sudoers ผิดรูปแบบ"
  ok "เปิด sudo แบบไม่ต้องใส่รหัสผ่านให้ ${DEPLOY_USER} (บัญชีไม่มีรหัสผ่าน จึงจำเป็น)"
  warn "ควรรัดกุมขึ้นเมื่อสะดวก: sudo passwd ${DEPLOY_USER} แล้ว sudo rm /etc/sudoers.d/90-${DEPLOY_USER}"
fi

# ── 2) สร้าง ~/.ssh และวาง public key ลง authorized_keys ────────────────────
step "2/7 ติดตั้ง authorized_keys"
mkdir -p "$SSH_DIR"

if [ -n "$SSH_PUBLIC_KEY" ]; then
  # กันคีย์ซ้ำตอนรันสคริปต์รอบสอง
  if [ -f "$AUTH_KEYS" ] && grep -qxF "$SSH_PUBLIC_KEY" "$AUTH_KEYS"; then
    ok "คีย์นี้อยู่ใน authorized_keys แล้ว"
  else
    echo "$SSH_PUBLIC_KEY" >> "$AUTH_KEYS"
    ok "เพิ่ม public key ที่ส่งมาแล้ว"
  fi
else
  if [ ! -f "$AUTH_KEYS" ]; then
    echo "$PLACEHOLDER" > "$AUTH_KEYS"
  fi
  warn "ไม่ได้ส่ง public key มา — วาง placeholder ไว้ที่ ${AUTH_KEYS}"
  warn "ต้องแทนที่ด้วยคีย์จริงก่อน ไม่งั้นขั้นตอนที่ 6 จะถูกข้าม"
fi

# ── 3) ตั้ง permission ของ .ssh ─────────────────────────────────────────────
# sshd "ปฏิเสธคีย์เงียบ ๆ" ถ้า permission กว้างเกินไป (StrictModes เปิดโดยค่าเริ่มต้น)
# อาการคือถูกถาม password ทั้งที่วางคีย์ถูกแล้ว — หาสาเหตุยากมากถ้าไม่รู้
step "3/7 ตั้ง permission ของ ${SSH_DIR}"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "$SSH_DIR"
chmod 700 "$SSH_DIR"
chmod 600 "$AUTH_KEYS"
ok ".ssh = 700 · authorized_keys = 600 · เจ้าของ = ${DEPLOY_USER}"

# ── 4) UFW firewall ────────────────────────────────────────────────────────
# ต้อง allow OpenSSH "ก่อน" enable เสมอ ไม่งั้นสายที่กำลังต่ออยู่จะถูกตัดทันที
step "4/7 ตั้งค่า UFW firewall"
if ! command -v ufw > /dev/null; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ufw > /dev/null
  ok "ติดตั้ง ufw แล้ว"
fi

ufw allow OpenSSH > /dev/null
ok "อนุญาต OpenSSH (22/tcp)"
ufw allow 80/tcp > /dev/null
ok "อนุญาต 80/tcp"
ufw allow 443/tcp > /dev/null
ok "อนุญาต 443/tcp"

# --force กัน prompt ยืนยัน เพราะสคริปต์รันแบบ non-interactive
ufw --force enable > /dev/null
ok "เปิดใช้งาน UFW แล้ว (เปิดเฉพาะ 22/80/443)"

# ⚠️ Docker เขียนกฎ iptables เองจึงทะลุ UFW ได้ — พอร์ตที่ประกาศใน compose
# จะเปิดออกเน็ตแม้ UFW deny · docker-compose.prod.yml ต้องผูกเป็น
# "127.0.0.1:3000:3000" เสมอ แล้วให้ nginx ต่อผ่าน loopback
warn "Docker ทะลุ UFW ได้ — compose ของ production ต้องผูกพอร์ตกับ 127.0.0.1 เท่านั้น"

# ── 5) fail2ban ────────────────────────────────────────────────────────────
step "5/7 ติดตั้งและตั้งค่า fail2ban"
if command -v fail2ban-server > /dev/null; then
  ok "มี fail2ban อยู่แล้ว"
else
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq fail2ban > /dev/null
  ok "ติดตั้ง fail2ban แล้ว"
fi

# แก้ที่ jail.local ไม่ใช่ jail.conf — jail.conf ถูกเขียนทับทุกครั้งที่อัปเดตแพ็กเกจ
# backend = systemd จำเป็นบน Ubuntu 24.04 เพราะหลาย image ไม่มี /var/log/auth.log แล้ว
# (log ย้ายไป journald) ถ้าไม่ตั้ง jail จะ start ไม่ขึ้นและไม่แบนใครเลย
cat > "$JAIL_LOCAL" <<'CONF'
# ตั้งค่าโดย ops/setup-vps.sh — แก้ไฟล์นี้ได้ ไม่ถูกเขียนทับตอน apt upgrade
[sshd]
enabled  = true
backend  = systemd
maxretry = 5
findtime = 600
bantime  = 3600
CONF
ok "เขียน ${JAIL_LOCAL} — maxretry=5 findtime=600 bantime=3600"

# ── 6) hardening ของ sshd ──────────────────────────────────────────────────
# ⚠️ กับดักของ Ubuntu cloud image: /etc/ssh/sshd_config มีบรรทัด
#     Include /etc/ssh/sshd_config.d/*.conf
# อยู่บนสุด และ OpenSSH ใช้กติกา "ค่าแรกที่เจอชนะ" — ไฟล์ 60-cloudimg-settings.conf
# ของผู้ให้บริการจึงชนะค่าที่แก้ใน sshd_config เสมอ
# วิธีที่ได้ผลจริงคือวางไฟล์ที่เรียงมาก่อน (01-) แล้วปิดบรรทัดใน 60- ด้วย
step "6/7 ปิด root login และ password login ของ SSH"

has_real_key=false
if [ -s "$AUTH_KEYS" ] && ! grep -q "$PLACEHOLDER_MARK" "$AUTH_KEYS"; then
  has_real_key=true
fi

if [ "$has_real_key" = false ]; then
  warn "ข้ามขั้นตอนนี้ — ${AUTH_KEYS} ยังเป็น placeholder"
  warn "ถ้าปิด password login ตอนนี้จะไม่มีทางเข้าเครื่องได้อีกเลย"
  warn "วางคีย์จริงแล้วรันสคริปต์นี้ซ้ำ: bash $0 \"ssh-ed25519 AAAA...\""
else
  cp /etc/ssh/sshd_config "/etc/ssh/sshd_config.bak.$(date +%Y%m%d%H%M%S)"

  # ไฟล์ 01- เรียงมาก่อน 60- จึงเป็นค่าที่ชนะ
  cat > "$SSHD_DROPIN" <<'CONF'
# ตั้งค่าโดย ops/setup-vps.sh — ต้องขึ้นต้นด้วยเลขน้อยกว่า 60-cloudimg-settings.conf
# เพราะ OpenSSH ใช้ "ค่าแรกที่เจอชนะ" ไม่ใช่ "ค่าหลังสุดชนะ"
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
KbdInteractiveAuthentication no
CONF
  chmod 644 "$SSHD_DROPIN"
  ok "เขียน ${SSHD_DROPIN} (ไฟล์นี้คือตัวที่มีผลจริง)"

  # ปิดบรรทัดที่ขัดกันในไฟล์ของผู้ให้บริการ เผื่อวันหลังมีคนสลับลำดับไฟล์
  if [ -f "$CLOUDIMG_CONF" ]; then
    sed -i 's/^[[:space:]]*PasswordAuthentication[[:space:]]\+yes/#&/I' "$CLOUDIMG_CONF"
    ok "ปิดบรรทัด PasswordAuthentication yes ใน $(basename "$CLOUDIMG_CONF")"
  fi

  # แก้ไฟล์หลักด้วยเพื่อให้คนอ่านแล้วไม่สับสน (ตัวที่มีผลจริงคือไฟล์ 01- ด้านบน)
  sed -i \
    -e 's/^[[:space:]]*#\?[[:space:]]*PermitRootLogin[[:space:]]\+.*/PermitRootLogin no/I' \
    -e 's/^[[:space:]]*#\?[[:space:]]*PasswordAuthentication[[:space:]]\+.*/PasswordAuthentication no/I' \
    -e 's/^[[:space:]]*#\?[[:space:]]*PubkeyAuthentication[[:space:]]\+.*/PubkeyAuthentication yes/I' \
    /etc/ssh/sshd_config
  ok "ปรับ /etc/ssh/sshd_config ให้ตรงกัน"

  # sshd -t ต้องมีโฟลเดอร์ privilege separation อยู่ ไม่งั้นล้มด้วยเหตุผลที่ไม่เกี่ยวกับ config
  # (เจอบนเครื่องที่เพิ่งติดตั้ง openssh-server แต่ยังไม่เคย start service)
  mkdir -p /run/sshd

  # ตรวจไวยากรณ์ก่อน restart เด็ดขาด — config พังแล้ว sshd ไม่ขึ้น = เข้าเครื่องไม่ได้อีก
  sshd -t || fail "sshd config ผิดรูปแบบ — ยังไม่ restart กู้ได้จากไฟล์ .bak"
  ok "ตรวจไวยากรณ์ sshd ผ่าน (sshd -t)"
fi

# ── 7) restart ssh + enable fail2ban ───────────────────────────────────────
# บน Ubuntu ชื่อ service คือ "ssh" ไม่ใช่ "sshd"
step "7/7 restart ssh และเปิดใช้งาน fail2ban"
if [ "$has_real_key" = true ]; then
  systemctl restart ssh
  ok "restart ssh แล้ว (session ที่ต่ออยู่ตอนนี้ไม่ถูกตัด)"
else
  warn "ไม่ได้ restart ssh เพราะยังไม่ได้แก้ config"
fi

systemctl enable --now fail2ban > /dev/null
ok "fail2ban ทำงานแล้วและตั้งให้เริ่มเองตอนบูต"

# ── สรุปสถานะ ──────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo " สรุปสถานะ"
echo "═══════════════════════════════════════════════════════════"
echo "ผู้ใช้ deploy : $(id "$DEPLOY_USER")"
echo "UFW          : $(ufw status | head -1)"
echo "fail2ban     : $(systemctl is-active fail2ban)"
echo "ssh          : $(systemctl is-active ssh)"
if [ "$has_real_key" = true ]; then
  echo "sshd         : ปิด root login + password login แล้ว"
else
  echo "sshd         : ⚠ ยังเปิด password login อยู่ (ยังไม่มี public key จริง)"
fi
echo ""
echo "ทดสอบจากเครื่องตัวเอง — อย่าปิด session นี้จนกว่าจะผ่านทั้งสองข้อ:"
echo "  ssh ${DEPLOY_USER}@<VPS_IP>                              # ต้องเข้าได้"
echo "  ssh -o PubkeyAuthentication=no ${DEPLOY_USER}@<VPS_IP>   # ต้องได้ Permission denied (publickey)"

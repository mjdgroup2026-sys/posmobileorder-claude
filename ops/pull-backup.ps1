# pull-backup.ps1 — ดึงไฟล์ backup จาก VPS ลงเครื่อง Windows (สำเนาที่สอง)
#
#   pwsh -File ops\pull-backup.ps1                 # ดึงลง D:\MJD_Backup
#   pwsh -File ops\pull-backup.ps1 -Install        # ตั้ง Task Scheduler ให้รันทุกวัน 20:00
#   pwsh -File ops\pull-backup.ps1 -Uninstall      # ถอน task ออก
#
# ทำไมต้องมีสำเนาที่สอง: backup ที่อยู่บนเครื่องเดียวกับฐานข้อมูล ไม่ใช่ backup
# ถ้า VPS ถูกลบทั้งเครื่อง (หรือผู้ให้บริการมีปัญหา) ไฟล์หายไปพร้อมกันหมด
#
# ⚠️ ข้อจำกัดที่ต้องรู้: ดึงได้เฉพาะตอนเปิดคอมเท่านั้น ถ้าปิดเครื่องยาว
#    จะได้เท่าที่ VPS ยังไม่หมุนทิ้ง (14 วันตาม RETENTION_DAYS ของ backup-db.sh)
#    ถ้าต้องการสำเนาที่ทำงานตลอดเวลา ให้ตั้ง BACKUP_REMOTE= ใน .env บน VPS
#    แล้วติดตั้ง rclone ชี้ไป S3/B2 แทน (backup-db.sh รองรับไว้แล้ว)

[CmdletBinding()]
param(
  [string]$SshHost   = "posmobileorder",
  [string]$RemoteDir = "/home/deploy/backups",
  [string]$LocalDir  = "D:\MJD_Backup",
  [int]$RetentionDays = 60,
  [string]$TaskName  = "MJD-PullBackup",
  [switch]$Install,
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

function Write-Log {
  param([string]$Message)
  Write-Host ("{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message)
}

# ── ติดตั้ง / ถอน Task Scheduler ────────────────────────────────────────────
if ($Uninstall) {
  try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
    Write-Log "ถอน task '$TaskName' แล้ว"
  } catch {
    Write-Log "ไม่พบ task '$TaskName' (อาจถอนไปแล้ว)"
  }
  return
}

if ($Install) {
  $scriptPath = $MyInvocation.MyCommand.Path
  $pwshPath = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
  if (-not $pwshPath) { $pwshPath = (Get-Command powershell).Source }

  $action = New-ScheduledTaskAction -Execute $pwshPath `
    -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $scriptPath)
  $trigger = New-ScheduledTaskTrigger -Daily -At 20:00
  # StartWhenAvailable: ถ้าปิดเครื่องตอน 20:00 ให้รันทันทีที่เปิดเครื่องครั้งถัดไป
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries

  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Description "ดึง backup ของ MJD Mobile Order จาก VPS ลงเครื่อง" -Force | Out-Null
  Write-Log "ตั้ง task '$TaskName' ให้รันทุกวัน 20:00 แล้ว (ถ้าพลาดรอบจะรันตอนเปิดเครื่องครั้งถัดไป)"
  return
}

# ── ดึงไฟล์ ─────────────────────────────────────────────────────────────────
Write-Log "เริ่มดึง backup จาก ${SshHost}:${RemoteDir}"

if (-not (Test-Path $LocalDir)) {
  New-Item -ItemType Directory -Path $LocalDir -Force | Out-Null
  Write-Log "สร้างโฟลเดอร์ $LocalDir แล้ว"
}

# รายชื่อไฟล์ฝั่ง VPS — ใช้ ssh ตรง ๆ เพราะ alias ใน ~/.ssh/config จัดการ key/user/port ให้แล้ว
$remoteList = & ssh -o BatchMode=yes -o ConnectTimeout=20 $SshHost `
  "ls -1 $RemoteDir/posmobileorderdb-*.dump 2>/dev/null"
if ($LASTEXITCODE -ne 0 -or -not $remoteList) {
  Write-Log "!! ไม่พบไฟล์ backup บน VPS (หรือต่อ ssh ไม่ได้) — ยังไม่ดึงอะไร"
  exit 1
}

$copied = 0
$skipped = 0
foreach ($remoteFile in $remoteList) {
  $name = Split-Path $remoteFile -Leaf
  $localFile = Join-Path $LocalDir $name

  # ข้ามไฟล์ที่ดึงมาแล้ว — ประหยัดเน็ตและทำให้รันซ้ำได้
  if (Test-Path $localFile) { $skipped++; continue }

  & scp -o BatchMode=yes -o ConnectTimeout=20 "${SshHost}:${remoteFile}" $localFile
  if ($LASTEXITCODE -eq 0) {
    $size = (Get-Item $localFile).Length
    Write-Log ("  ดึงแล้ว {0} ({1:N0} bytes)" -f $name, $size)
    $copied++
  } else {
    Write-Log "  !! ดึง $name ไม่สำเร็จ"
    if (Test-Path $localFile) { Remove-Item $localFile -Force }
  }
}

Write-Log "ดึงใหม่ $copied ไฟล์ · มีอยู่แล้ว $skipped ไฟล์"

# ── ลบของเก่าเกิน RetentionDays ─────────────────────────────────────────────
# เก็บนานกว่าฝั่ง VPS (14 วัน) โดยตั้งใจ — สำเนาที่สองควรย้อนได้ไกลกว่า
$cutoff = (Get-Date).AddDays(-$RetentionDays)
$old = Get-ChildItem -Path $LocalDir -Filter "posmobileorderdb-*.dump" -ErrorAction SilentlyContinue |
       Where-Object { $_.LastWriteTime -lt $cutoff }
foreach ($f in $old) {
  Remove-Item $f.FullName -Force
  Write-Log "  ลบของเก่า $($f.Name)"
}

$total = (Get-ChildItem -Path $LocalDir -Filter "posmobileorderdb-*.dump" -ErrorAction SilentlyContinue).Count
Write-Log "เสร็จ — ตอนนี้เก็บไว้ $total ไฟล์ที่ $LocalDir"

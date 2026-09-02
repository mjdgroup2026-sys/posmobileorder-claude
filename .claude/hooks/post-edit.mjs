#!/usr/bin/env node
/// post-edit hook — ทำงานหลัง Edit/Write ทุกครั้ง (ตั้งค่าใน .claude/settings.json)
///
/// 1. รัน eslint --fix เฉพาะไฟล์ที่เพิ่งแก้ (ไม่ใช่ทั้งโปรเจกต์ — เร็วกว่ามาก)
/// 2. เตือนถ้าเจอ semicolon ปิดท้ายบรรทัด (กติกาข้อ 1 ใน CLAUDE.md)
///
/// เขียนเป็น Node ไม่ใช่ shell เพราะเครื่อง Windows ของทีมไม่มี jq
/// และเรียก eslint ผ่าน node + bin/eslint.js ตรง ๆ ไม่ผ่าน .bin/eslint
/// เพราะบน Windows ตัวนั้นเป็น shell script ที่ spawn ไม่ได้
///
/// exit 0 = เงียบ · exit 2 = ส่งข้อความใน stderr กลับให้ Claude อ่านแล้วแก้ต่อ

import { spawnSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

const EXT = new Set([".ts", ".tsx", ".mjs"])
/// ไฟล์ที่ generate เองหรือของ tooling — กติกาข้อ 1 ยกเว้นไว้
const SKIP = ["node_modules", `generated${path.sep}prisma`, ".next", "next-env.d.ts"]

function readStdin() {
  try {
    return readFileSync(0, "utf8")
  } catch {
    return ""
  }
}

const raw = readStdin().trim()
if (!raw) process.exit(0)

let payload
try {
  payload = JSON.parse(raw)
} catch {
  /// payload ไม่ใช่ JSON — ไม่ใช่หน้าที่ของ hook ที่จะทำให้งานพัง
  process.exit(0)
}

const filePath = payload?.tool_input?.file_path ?? payload?.tool_input?.notebook_path
if (!filePath) process.exit(0)
if (!EXT.has(path.extname(filePath))) process.exit(0)
if (SKIP.some((s) => filePath.includes(s))) process.exit(0)
if (!existsSync(filePath)) process.exit(0)

const cwd = payload?.cwd ?? process.cwd()
const eslintBin = path.join(cwd, "node_modules", "eslint", "bin", "eslint.js")

/// ── 1) eslint --fix เฉพาะไฟล์นี้ ────────────────────────────────────────
let lintNote = ""
if (existsSync(eslintBin)) {
  const res = spawnSync(process.execPath, [eslintBin, "--fix", filePath], {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
  })
  /// exit 1 = ยังเหลือ error ที่ --fix แก้เองไม่ได้ → เอาไว้รายงาน
  if (res.status === 1 && res.stdout) lintNote = res.stdout.trim()
}

/// ── 2) ตรวจ semicolon ปิดท้ายบรรทัด ─────────────────────────────────────
/// อ่านไฟล์ "หลัง" eslint --fix เสมอ ไม่งั้นจะรายงานสิ่งที่ถูกแก้ไปแล้ว
const lines = readFileSync(filePath, "utf8").split(/\r?\n/)
const offenders = []
lines.forEach((line, i) => {
  if (/;\s*$/.test(line)) offenders.push({ no: i + 1, text: line.trim() })
})

if (offenders.length === 0 && !lintNote) process.exit(0)

const out = []
if (offenders.length > 0) {
  out.push(`[post-edit] ${filePath} มี semicolon ปิดท้ายบรรทัด ${offenders.length} จุด (กติกาข้อ 1 ห้ามใส่):`)
  for (const o of offenders.slice(0, 20)) out.push(`  บรรทัด ${o.no}: ${o.text}`)
  if (offenders.length > 20) out.push(`  … และอีก ${offenders.length - 20} จุด`)
}
if (lintNote) {
  out.push(`[post-edit] eslint ยังเหลือปัญหาที่ --fix แก้เองไม่ได้:`)
  out.push(lintNote)
}

process.stderr.write(out.join("\n") + "\n")
process.exit(2)

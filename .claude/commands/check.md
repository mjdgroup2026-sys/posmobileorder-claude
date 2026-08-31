---
description: ตรวจคุณภาพโค้ดทั้งโปรเจกต์ — semicolon, typecheck, lint, build
---

ตรวจโปรเจกต์ตามลำดับนี้ แล้วสรุปผลเป็นตารางว่าผ่าน/ไม่ผ่านข้อไหน:

1. **กติกาห้าม semicolon** (กติกาข้อ 1 ใน CLAUDE.md) — หา semicolon ปิดท้ายบรรทัดในไฟล์ `.ts`/`.tsx`/`.mjs`
   โดยยกเว้น `node_modules/`, `.git/`, `generated/`, `.agents/`, `.claude/`, `.windsurf/`, `next-env.d.ts`:
   ```bash
   grep -rnE ';\s*$' --include='*.ts' --include='*.tsx' --include='*.mjs' . \
     --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=generated \
     --exclude-dir=.agents --exclude-dir=.claude --exclude-dir=.windsurf \
     --exclude='next-env.d.ts'
   ```
2. `pnpm typecheck` — ถ้าฟ้อง `LayoutProps`/`PageProps` ไม่รู้จัก ให้รัน `pnpm exec next typegen` ก่อนแล้วลองใหม่
3. `pnpm lint`
4. `pnpm build`

ถ้าเจอ semicolon ให้แก้ให้ครบทุกจุดก่อนไปขั้นถัดไป

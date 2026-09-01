# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# MJD Mobile Order (posmobileorder) — multi-stage build
# Next.js 16 standalone + Prisma 7 (driver adapter @prisma/adapter-pg)
#
# build image ของแอป:
#   docker build -t posmobileorder:latest .
# build image สำหรับรัน migration (ต้องมาจาก stage migrator เท่านั้น):
#   docker build --target migrator -t posmobileorder:latest-migrate .
# ─────────────────────────────────────────────────────────────────────────────


# ───────────────────────────── base ─────────────────────────────
# node:22-alpine + pnpm เวอร์ชันเดียวกับที่ระบุใน package.json (packageManager)
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
WORKDIR /app


# ───────────────────────────── deps ─────────────────────────────
# ติดตั้ง dependencies ทั้งหมด (รวม dev) เพราะ builder ต้องใช้ prisma CLI + typescript + tailwind
# แยกเป็น stage ของตัวเองเพื่อให้ layer cache ทำงาน — แก้โค้ดแล้วไม่ต้อง install ใหม่
FROM base AS deps
# ทนต่อเน็ตสะดุด — pnpm 11 ใช้เวลากับ supply-chain check นาน (~5 นาที สำหรับ 969 entries)
# ถ้าไม่ตั้ง retry ไว้ connection มักหลุดแล้วล้มด้วย "TypeError: fetch failed"
# ipv4first กันกรณี registry resolve เป็น IPv6 แล้ว container ไม่มี route ออก
ENV NODE_OPTIONS=--dns-result-order=ipv4first
# ต้องมี pnpm-workspace.yaml ด้วย — pnpm 11 อ่าน allowBuilds จากไฟล์นี้
# ถ้าไม่มี postinstall ของ prisma/@prisma/engines จะถูกบล็อก แล้ว prisma CLI พังตอน generate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set fetch-retries 5 \
 && pnpm config set fetch-retry-mintimeout 20000 \
 && pnpm config set fetch-retry-maxtimeout 180000 \
 && pnpm install --frozen-lockfile --network-concurrency 8


# ──────────────────────────── builder ───────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# generator "prisma-client" ของ Prisma 7 สร้างผลลัพธ์เป็นไฟล์ .ts ที่ generated/prisma
# ซึ่ง next build ต้องคอมไพล์ต่อ → ต้องรันก่อน build เสมอ ไม่งั้น import "@/generated/prisma/client" พัง
RUN pnpm db:generate

# DATABASE_URL ตอน build เป็นค่าหลอกได้ — ใช้แค่ให้ lib/prisma.ts ผ่าน guard ตอนที่ Next
# prerender หน้า static ไม่ได้ต่อฐานจริง · ค่าจริงถูกอ่านตอน runtime จาก env ของ container
ARG DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
ENV DATABASE_URL=$DATABASE_URL
ENV NEXT_TELEMETRY_DISABLED=1

# ⚠️ ถ้าวันหลังมีตัวแปร NEXT_PUBLIC_* ต้องส่งเป็น --build-arg ตรงนี้ด้วย
# เพราะมันถูก inline ลง bundle ตอน next build เท่านั้น ตั้งตอน runtime ไม่มีผล
RUN pnpm build


# ──────────────────────────── migrator ──────────────────────────
# image แยกสำหรับรัน `prisma migrate deploy` ตอน deploy
# ⚠️ ต้อง build จาก stage นี้เท่านั้น — stage deps ไม่มีโฟลเดอร์ prisma/ จะทำให้ CLI
# ฟ้อง "Could not find Prisma Schema" แล้ว deploy "สำเร็จ" ทั้งที่ DB ไม่มีตาราง
FROM base AS migrator
ENV NODE_ENV=production
# pnpm 11 เช็ค deps ก่อนรันทุก script ถ้าเห็นว่าไม่ตรง lockfile จะสั่ง `pnpm install` เองกลางคัน
# ใน stage นี้ node_modules ถูก copy มาสำเร็จรูปแล้ว การ install ซ้ำมีแต่พัง (ERR_PNPM_IGNORED_BUILDS)
ENV npm_config_verify_deps_before_run=false
COPY --from=deps /app/node_modules ./node_modules
# prisma7.config.ts จำเป็นทั้งคู่ — schema.prisma ไม่มี url ใน datasource block
# ค่ามาจาก config นี้ (process.env.DATABASE_URL) ถ้าไม่ copy มา migrate deploy จะฟ้องหา datasource
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma7.config.ts ./
COPY prisma ./prisma
# seed.ts import "../generated/prisma/client" → ต้อง generate ก่อน ไม่งั้น `prisma db seed` พัง
RUN pnpm db:generate
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]


# ───────────────────────────── runner ───────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# ต้องเป็น 0.0.0.0 ไม่ใช่ localhost ไม่งั้น server ฟังเฉพาะภายใน container แล้ว map port ไม่ติด
ENV HOSTNAME=0.0.0.0

# non-root user — ถ้ามีช่องโหว่ RCE จะไม่ได้สิทธิ์ root ใน container
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

# .next/standalone มี server.js + node_modules เฉพาะที่ใช้จริง (ไม่มี prisma CLI / typescript / vitest)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# ⚠️ static/ กับ public/ ไม่ถูกใส่เข้า standalone ให้อัตโนมัติ ต้อง copy เอง
# ถ้าลืม 2 บรรทัดนี้ แอปจะรันขึ้นปกติแต่ CSS/JS/รูปหายหมด หน้าเว็บโล่งทั้งที่ container healthy
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# cache ของ Next ตอน runtime ต้องเขียนได้ด้วยสิทธิ์ของ nextjs
RUN mkdir -p .next/cache && chown -R nextjs:nodejs .next

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/login || exit 1

CMD ["node", "server.js"]

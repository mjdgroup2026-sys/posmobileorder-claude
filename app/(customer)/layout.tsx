import type { Metadata } from "next"
import { Prompt, Sarabun } from "next/font/google"
import { getStoreSettings } from "@/lib/queries"
import { Toaster } from "@/components/ui/sonner"
import "../globals.css"

// ฟอนต์คนละชุดกับฝั่งพนักงานโดยตั้งใจ — หน้าลูกค้าเปิดบนเน็ตมือถือ
// ไม่ควรโหลดฟอนต์ฝั่งพนักงานทิ้งเปล่า (ดู §6a ใน spec)
const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["thai", "latin"],
  weight: ["500", "600", "700"],
  display: "swap",
})
const sarabun = Sarabun({
  variable: "--font-sarabun",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "สั่งอาหาร",
  description: "สั่งอาหารผ่าน QR Code",
}

export default async function CustomerRootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getStoreSettings()

  return (
    <html lang="th" data-theme="customer" className={`${prompt.variable} ${sarabun.variable}`}>
      {/* สีของร้าน override ตอน runtime — inline style ชนะ selector [data-theme] เสมอ
          จึงไม่ต้อง generate CSS ใหม่ต่อร้าน (ดูกติกาธีมข้อ 4 ใน CLAUDE.md)
          ค่านี้ผ่าน zod ที่บังคับ hex 6 หลักมาแล้ว จึงยัดลง style ได้โดยไม่เปิดช่องให้เขียน CSS เอง */}
      <body
        className="antialiased"
        style={settings?.themeColor ? ({ "--brand": settings.themeColor } as React.CSSProperties) : undefined}
      >
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  )
}

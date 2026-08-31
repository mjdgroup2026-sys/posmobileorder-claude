import type { Metadata } from "next"
import { Inter, Anuphan, JetBrains_Mono } from "next/font/google"
import { Toaster } from "@/components/ui/sonner"
import "../globals.css"

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" })
const anuphan = Anuphan({ variable: "--font-anuphan", subsets: ["thai", "latin"], display: "swap" })
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" })

export const metadata: Metadata = {
  title: "MJD Mobile Order — ระบบหลังร้าน",
  description: "ระบบคลังสินค้าเบิกจ่ายและขายหน้าร้าน",
}

export default function StaffRootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      data-theme="staff"
      className={`${inter.variable} ${anuphan.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  )
}

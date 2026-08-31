"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"
import { IconLogout, IconSettings, IconUser, IconWarning } from "@/components/icons"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Props = {
  user: { name: string; email: string }
  lowStockCount: number
}

export function Topbar({ user, lowStockCount }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleSignOut() {
    setBusy(true)
    await authClient.signOut()
    toast.success("ออกจากระบบแล้ว")
    router.push("/login")
    router.refresh()
  }

  return (
    <header className="topbar">
      <div className="row">
        {lowStockCount > 0 ? (
          <Link href="/products?filter=low" className="chip chip-warning">
            <IconWarning size={14} aria-hidden />
            สินค้าใกล้หมด <span className="num">{lowStockCount}</span> รายการ
          </Link>
        ) : (
          <span className="chip chip-success">
            <span className="dot" />
            สต็อกอยู่ในเกณฑ์ปกติ
          </span>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<button type="button" className="btn btn-ghost" disabled={busy} />}
        >
          <IconUser size={18} aria-hidden />
          <span>{user.name}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <span style={{ display: "block", fontWeight: 600 }}>{user.name}</span>
            <span className="t-caption">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/settings" />}>
            <IconSettings size={16} aria-hidden /> ตั้งค่าโปรไฟล์
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} variant="destructive">
            <IconLogout size={16} aria-hidden /> ออกจากระบบ
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}

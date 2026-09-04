"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { assignUserRole } from "@/app/actions/roles"

/// dropdown เปลี่ยนบทบาทของผู้ใช้รายคนบนหน้า /users (§4)
/// ค่าว่าง = ถอดบทบาทออก ผู้ใช้คนนั้นจะเข้าได้เฉพาะ /settings จนกว่าจะกำหนดใหม่
export function UserRolePicker({
  userId,
  currentRoleId,
  roles,
}: {
  userId: string
  currentRoleId: string | null
  roles: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [value, setValue] = useState(currentRoleId ?? "")
  const [pending, setPending] = useState(false)

  async function change(next: string) {
    const previous = value
    setValue(next)
    setPending(true)

    const formData = new FormData()
    formData.set("userId", userId)
    formData.set("roleId", next)

    try {
      const result = await assignUserRole(formData)
      if (!result.ok) {
        // server ปฏิเสธ (เช่น ผู้ดูแลระบบคนสุดท้าย) — คืนค่าเดิมให้ตรงกับความจริงในฐาน
        setValue(previous)
        toast.error(result.error)
        return
      }
      toast.success(result.message)
      router.refresh()
    } catch {
      setValue(previous)
      toast.error("เปลี่ยนบทบาทไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
    } finally {
      setPending(false)
    }
  }

  return (
    <select
      className="select"
      aria-label="บทบาทของผู้ใช้"
      value={value}
      disabled={pending}
      onChange={(e) => void change(e.target.value)}
    >
      <option value="">— ยังไม่กำหนดบทบาท —</option>
      {roles.map((role) => (
        <option key={role.id} value={role.id}>
          {role.name}
        </option>
      ))}
    </select>
  )
}

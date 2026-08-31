import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { SettingsForm } from "./settings-form"

export const metadata = { title: "ตั้งค่า" }

export default async function SettingsPage() {
  const session = await getSession()
  if (!session?.user) redirect("/login")

  return (
    <>
      <div className="page-head">
        <div>
          <p className="t-eyebrow">ระบบ</p>
          <h1 className="t-h1">ตั้งค่าโปรไฟล์</h1>
        </div>
      </div>

      <SettingsForm name={session.user.name} email={session.user.email} />
    </>
  )
}

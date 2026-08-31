import { listUsers } from "@/lib/queries"
import { formatDateTime } from "@/lib/format"

export const metadata = { title: "ผู้ใช้งาน" }

export default async function UsersPage() {
  const users = await listUsers()

  return (
    <>
      <div className="page-head">
        <div>
          <p className="t-eyebrow">ระบบ</p>
          <h1 className="t-h1">ผู้ใช้งาน</h1>
          <p className="t-body" style={{ marginTop: 4 }}>
            รายชื่อผู้ใช้ทั้งหมดที่สมัครเข้าระบบ
          </p>
        </div>
      </div>

      <div className="alert-banner info">
        v1 ยังไม่แบ่งสิทธิ์รายหน้า — ผู้ใช้ที่ล็อกอินแล้วเข้าถึงได้ทุกหน้าเท่ากันทุกคน
        ระบบบทบาท (Role-Based Permission) อยู่นอกขอบเขต v1
      </div>

      <section className="card-ui">
        <div className="panel-head">
          <h2 className="t-h2">
            ทั้งหมด <span className="num">{users.length}</span> คน
          </h2>
        </div>
        <div className="datatable-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9375rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--ink-3)", background: "var(--surface-2)" }}>
                <th style={{ padding: "10px 24px", fontWeight: 500 }}>ชื่อ</th>
                <th style={{ padding: "10px 12px", fontWeight: 500 }}>อีเมล</th>
                <th style={{ padding: "10px 12px", fontWeight: 500 }}>บทบาท</th>
                <th style={{ padding: "10px 24px", fontWeight: 500, textAlign: "right" }}>สมัครเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "12px 24px", fontWeight: 500 }}>{u.name}</td>
                  <td style={{ padding: "12px" }}>{u.email}</td>
                  <td style={{ padding: "12px" }}>
                    <span className="chip chip-neutral">ยังไม่กำหนดสิทธิ์</span>
                  </td>
                  <td className="num t-caption" style={{ padding: "12px 24px", textAlign: "right" }}>
                    {formatDateTime(u.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

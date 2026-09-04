import { redirect } from "next/navigation"
import QRCode from "qrcode"
import { getCustomerPaymentStatus, getStoreSettings } from "@/lib/queries"
import { buildPromptPayPayload } from "@/lib/promptpay"
import { CustomerShell, CustomerNotice } from "@/components/customer/customer-shell"
import { PromptPayView } from "@/components/customer/promptpay-view"

export const metadata = { title: "ชำระด้วยพร้อมเพย์" }

export default async function PromptPayPage({ params }: PageProps<"/order/[qrToken]/pay/promptpay">) {
  const { qrToken } = await params
  const [status, settings] = await Promise.all([getCustomerPaymentStatus(qrToken), getStoreSettings()])

  if (status.state === "PAID") redirect(`/order/${qrToken}/pay/success`)
  if (status.state === "UNKNOWN" || status.total <= 0) redirect(`/order/${qrToken}/pay`)

  // payload สร้างสดทุกครั้งที่เข้าหน้า — ยอดจึงตรงกับบิลปัจจุบันเสมอแม้ลูกค้าสั่งเพิ่มระหว่างทาง
  const payload = buildPromptPayPayload(status.total)
  if (!payload) {
    return (
      <CustomerNotice
        title="ยังใช้พร้อมเพย์ไม่ได้"
        description="ร้านยังไม่ได้ตั้งค่าบัญชีพร้อมเพย์ กรุณาชำระเงินกับพนักงานที่เคาน์เตอร์"
      />
    )
  }

  const imageDataUrl = await QRCode.toDataURL(payload, {
    width: 512,
    margin: 1,
    errorCorrectionLevel: "M",
  })

  return (
    <CustomerShell
      storeName={settings?.storeName ?? "MJD Mobile Order"}
      tableCode={status.tableCode}
      backHref={`/order/${qrToken}/pay`}
      title="ชำระด้วยพร้อมเพย์"
    >
      <PromptPayView qrToken={qrToken} total={status.total} imageDataUrl={imageDataUrl} />
    </CustomerShell>
  )
}

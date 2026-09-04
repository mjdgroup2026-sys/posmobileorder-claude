import { redirect } from "next/navigation"
import { getCustomerPaymentStatus, getStoreSettings } from "@/lib/queries"
import { isPromptPayConfigured } from "@/lib/promptpay"
import { CustomerShell, CustomerNotice } from "@/components/customer/customer-shell"
import { PayView } from "@/components/customer/pay-view"

export const metadata = { title: "ชำระเงิน" }

export default async function PayPage({ params }: PageProps<"/order/[qrToken]/pay"> ) {
  const { qrToken } = await params
  const [status, settings] = await Promise.all([getCustomerPaymentStatus(qrToken), getStoreSettings()])

  // ปิดบิลไปแล้ว (webhook หรือพนักงานกดยืนยัน) — พาไปหน้าสำเร็จแทนหน้าเลือกวิธีจ่ายที่ไม่มีความหมายแล้ว
  if (status.state === "PAID") redirect(`/order/${qrToken}/pay/success`)

  if (status.state === "UNKNOWN") {
    return (
      <CustomerNotice
        title="ชำระเงินไม่ได้ตอนนี้"
        description="โต๊ะนี้ยังไม่ได้เปิดใช้งานหรือปิดบิลไปแล้ว กรุณาสแกน QR ใหม่หรือแจ้งพนักงาน"
      />
    )
  }

  if (status.total <= 0) {
    return (
      <CustomerNotice
        title="ยังไม่มีรายการที่ต้องชำระ"
        description="สั่งอาหารก่อนแล้วค่อยกลับมาชำระเงินได้เลย"
      />
    )
  }

  return (
    <CustomerShell
      storeName={settings?.storeName ?? "MJD Mobile Order"}
      tableCode={status.tableCode}
      backHref={`/order/${qrToken}/check-bill`}
      title="ชำระเงิน"
    >
      <PayView
        qrToken={qrToken}
        bill={{
          itemsTotal: status.itemsTotal,
          servicePercent: status.servicePercent,
          serviceCharge: status.serviceCharge,
          total: status.total,
        }}
        promptPayReady={isPromptPayConfigured()}
      />
    </CustomerShell>
  )
}

import { resolveCustomerSession, listMenu, getStoreSettings } from "@/lib/queries"
import { CustomerShell, CustomerNotice } from "@/components/customer/customer-shell"
import { MenuView } from "@/components/customer/menu-view"

export const metadata = { title: "เมนูอาหาร" }

const NOTICE = {
  QR_NOT_FOUND: {
    title: "ไม่พบ QR Code นี้",
    description: "กรุณาแจ้งพนักงานเพื่อขอ QR Code ใหม่",
  },
  QR_INVALIDATED: {
    title: "QR Code นี้ใช้ไม่ได้แล้ว",
    description: "กรุณาแจ้งพนักงานให้เปิดโต๊ะใหม่และพิมพ์ QR ใบใหม่ให้",
  },
  NO_SESSION: {
    title: "โต๊ะนี้ยังไม่ได้เปิด",
    description: "กรุณาสแกน QR Code อีกครั้ง หรือแจ้งพนักงานให้เปิดโต๊ะให้",
  },
}

export default async function CustomerMenuPage({ params }: PageProps<"/order/[qrToken]/menu">) {
  const { qrToken } = await params
  const session = await resolveCustomerSession(qrToken)

  if (!session.ok) return <CustomerNotice {...NOTICE[session.reason]} />

  const [menu, settings] = await Promise.all([listMenu(), getStoreSettings()])

  return (
    <CustomerShell storeName={settings?.storeName ?? "MJD Mobile Order"} tableCode={session.tableCode}>
      <MenuView
        qrToken={qrToken}
        featured={menu.featured}
        all={menu.all}
        awaitingBill={session.awaitingBill}
      />
    </CustomerShell>
  )
}

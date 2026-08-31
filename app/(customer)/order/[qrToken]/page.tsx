export default async function CustomerOrderPage({ params }: PageProps<"/order/[qrToken]">) {
  const { qrToken } = await params

  return (
    <main className="content" style={{ maxWidth: 480, margin: "0 auto" }}>
      <div className="card-ui card-pad" style={{ textAlign: "center" }}>
        <p className="t-eyebrow">MJD Mobile Order</p>
        <h1 className="t-h1" style={{ marginTop: 8 }}>
          หน้าสั่งอาหารกำลังจะมา
        </h1>
        <p className="t-body" style={{ marginTop: 12 }}>
          ระบบสั่งอาหารผ่าน QR Code จะเปิดใช้งานใน Phase 9 ตามแผนใน spec
          <br />
          ตอนนี้เป็นเพียงโครง route group ฝั่งลูกค้าเพื่อยึดธีมและฟอนต์ไว้ล่วงหน้า
        </p>
        <p className="t-caption" style={{ marginTop: 16 }}>
          QR token: <span className="num">{qrToken}</span>
        </p>
      </div>
    </main>
  )
}

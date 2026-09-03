import fs from "node:fs"

/// ดึงอาร์ตบอร์ดออกจาก mobile-order.html (bundle 2.7MB) มาเป็นไฟล์ HTML อ่านง่าย
/// ใช้เป็นต้นฉบับดีไซน์ตอนทำ UI ฝั่ง MJD Mobile Order — ไฟล์ผลลัพธ์อยู่นอก git (design-src/)
const source = fs.readFileSync("mobile-order.html", "utf8")
const outDir = "design-src"

const NAMES = [
  "Main",
  "CustomerMenu",
  "CustomerProductDetail",
  "CustomerCart",
  "CustomerOrderConfirmed",
  "CustomerOrderStatus",
  "CustomerCallStaff",
  "CustomerCheckBill",
  "CustomerPaymentSelect",
  "CustomerPromptPay",
  "CustomerPaymentSuccess",
  "CustomerMembership",
  "POSTableOverview",
  "POSNotifications",
  "POSTableDetail",
  "POSBilling",
  "POSManagerSettings",
  "POSQRManagement",
  "KitchenDisplay",
  "KitchenTicketDetail",
]

fs.mkdirSync(outDir, { recursive: true })

for (const name of NAMES) {
  const key = `"${name}.dc.html":"`
  const start = source.indexOf(key)
  if (start < 0) {
    console.log(`ไม่พบ ${name}`)
    continue
  }

  let i = start + key.length
  let out = ""
  let escaped = false
  for (; i < source.length; i++) {
    const ch = source[i]
    if (escaped) {
      out += ch
      escaped = false
      continue
    }
    if (ch === "\\") {
      out += ch
      escaped = true
      continue
    }
    if (ch === '"') break
    out += ch
  }

  const html = JSON.parse(`"${out}"`)
  fs.writeFileSync(`${outDir}/${name}.html`, html)
  console.log(`${name}: ${html.length} bytes`)
}

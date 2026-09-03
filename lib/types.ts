export type FieldErrors = Record<string, string>

/// ผลลัพธ์มาตรฐานของทุก Server Action — ไม่ throw ให้ผู้ใช้เห็น
/// `data` ไว้ส่งค่าที่ฝั่ง client ต้องใช้ต่อทันที (เช่น ใบเสร็จหลัง checkout) โดยไม่ต้องยิงถามซ้ำ
export type ActionResult<T = undefined> =
  | { ok: true; message: string; data?: T }
  | { ok: false; error: string; fieldErrors?: FieldErrors }

export type PaymentMethodValue = "CASH" | "TRANSFER" | "QR"

export const PAYMENT_METHOD_LABEL: Record<PaymentMethodValue, string> = {
  CASH: "เงินสด",
  TRANSFER: "โอนเงิน",
  QR: "สแกน QR",
}

export type ReceiptLine = {
  productId: string
  sku: string
  name: string
  unit: string
  quantity: number
  unitPrice: number
  subtotal: number
}

/// ข้อมูลใบเสร็จที่ createSale ส่งกลับให้หน้าจอพิมพ์ได้ทันที
export type ReceiptData = {
  id: string
  saleNumber: string
  createdAt: string
  cashierName: string
  items: ReceiptLine[]
  subtotal: number
  discount: number
  total: number
  paymentMethod: PaymentMethodValue
  amountReceived: number
  changeDue: number
  note?: string
}

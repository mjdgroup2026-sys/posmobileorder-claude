import "server-only"

/// ตัวเชื่อมกับ SCB Open API (Phase 10) — ออก QR พร้อมเพย์แบบ Bill Payment ที่พก ref1 ไปด้วย
///
/// ทำไมต้องใช้ธนาคารออก QR ให้ แทน `lib/promptpay.ts` ที่สร้างเองได้อยู่แล้ว:
/// payload ที่สร้างเองมีแค่ "เลขพร้อมเพย์ + จำนวนเงิน" ธนาคารจึงไม่รู้ว่าเงินก้อนนี้เป็นของโต๊ะไหน
/// callback ที่ส่งกลับมาจะไม่มีอะไรให้จับคู่เลย · ถ้าไปเดาจาก "ยอดเงิน" จะปิดบิลผิดโต๊ะทันที
/// ที่สองโต๊ะมียอดเท่ากัน · QR ที่ SCB ออกให้พก `ref1` ติดไปกับรายการ แล้วส่งคืนมาใน callback
/// จึงจับคู่กับ `PaymentIntent` ได้แม่นยำ
///
/// `lib/promptpay.ts` ยังไม่ถูกลบและยังใช้อยู่ — เป็น fallback ให้ร้านที่รับเข้าพร้อมเพย์ส่วนตัว
/// แล้วให้พนักงานกดยืนยันเอง (ดู `isScbConfigured()` ที่หน้า pay/promptpay ใช้ตัดสินใจ)
///
/// env ที่ต้องตั้ง:
///   SCB_API_BASE     — sandbox: https://api-sandbox.partners.scb/partners/sandbox
///   SCB_API_KEY      — application key (ใช้เป็น resourceOwnerId ด้วย)
///   SCB_API_SECRET   — application secret
///   SCB_BILLER_ID    — Biller ID ที่ SCB ออกให้ร้าน (ไม่ตั้ง = สร้าง QR ไม่ได้)
///   SCB_REF3_PREFIX  — prefix ของ ref3 ที่ SCB กำหนดให้ร้าน (บังคับตามสเปก)

/// SCB ตอบ code 1000 เมื่อสำเร็จ ค่าอื่นคือข้อผิดพลาดพร้อมคำอธิบายใน description
const SCB_SUCCESS = 1000

/// เผื่อเวลาไว้ก่อน token หมดอายุจริง — กันเคสที่ token หมดอายุระหว่างคำขอกำลังเดินทาง
const TOKEN_SAFETY_WINDOW_MS = 60_000

export type ScbResult<T> = { ok: true; data: T } | { ok: false; error: string }

type ScbEnvelope<T> = {
  status?: { code?: number; description?: string }
  data?: T
}

type TokenData = { accessToken: string; expiresIn: number }

type QrCreateData = { qrRawData?: string; qrImage?: string }

/// token cache ระดับโมดูล — SCB ให้ token อายุ 30 นาที ขอใหม่ทุกครั้งที่ลูกค้าเปิดหน้าจ่ายเงิน
/// จะกินโควตาฟรี ๆ และเพิ่ม latency ให้หน้าที่ลูกค้ากำลังรออยู่
let cachedToken: { value: string; expiresAtMs: number } | null = null

function readEnv(): { base: string; key: string; secret: string } | null {
  const base = process.env.SCB_API_BASE
  const key = process.env.SCB_API_KEY
  const secret = process.env.SCB_API_SECRET
  if (!base || !key || !secret) return null
  return { base: base.replace(/\/+$/, ""), key, secret }
}

/// ร้านพร้อมใช้เส้นทาง SCB หรือยัง — ขาด biller id ก็สร้าง QR ไม่ได้ ถือว่ายังไม่พร้อม
export function isScbConfigured(): boolean {
  return Boolean(readEnv() && process.env.SCB_BILLER_ID)
}

/// SCB บังคับให้ทุกคำขอมี requestUId ที่ไม่ซ้ำ ใช้ไล่ล็อกฝั่งธนาคารเวลาเปิดเคส
function requestUid(): string {
  return crypto.randomUUID()
}

function headers(key: string, token?: string): Record<string, string> {
  const base: Record<string, string> = {
    "Content-Type": "application/json",
    resourceOwnerId: key,
    requestUId: requestUid(),
    "accept-language": "EN",
  }
  if (token) base.authorization = `Bearer ${token}`
  return base
}

/// อ่าน envelope ของ SCB ให้เป็น ScbResult — รวมการตีความ status.code ไว้ที่เดียว
async function readEnvelope<T>(response: Response, label: string): Promise<ScbResult<T>> {
  let body: ScbEnvelope<T>
  try {
    body = (await response.json()) as ScbEnvelope<T>
  } catch {
    return { ok: false, error: `${label}: ธนาคารตอบกลับไม่ใช่ JSON (HTTP ${response.status})` }
  }

  const code = body.status?.code
  if (code !== SCB_SUCCESS || !body.data) {
    const description = body.status?.description ?? `HTTP ${response.status}`
    return { ok: false, error: `${label}: ${description} (code ${code ?? "?"})` }
  }

  return { ok: true, data: body.data }
}

/// ขอ access token (cache ไว้จนใกล้หมดอายุ)
export async function getAccessToken(): Promise<ScbResult<string>> {
  const env = readEnv()
  if (!env) return { ok: false, error: "ยังไม่ได้ตั้งค่า SCB_API_BASE / SCB_API_KEY / SCB_API_SECRET" }

  if (cachedToken && cachedToken.expiresAtMs > Date.now()) {
    return { ok: true, data: cachedToken.value }
  }

  let response: Response
  try {
    response = await fetch(`${env.base}/v1/oauth/token`, {
      method: "POST",
      headers: headers(env.key),
      body: JSON.stringify({ applicationKey: env.key, applicationSecret: env.secret }),
      cache: "no-store",
    })
  } catch (error) {
    return { ok: false, error: `ขอ token ไม่สำเร็จ: ${error instanceof Error ? error.message : "เชื่อมต่อธนาคารไม่ได้"}` }
  }

  const parsed = await readEnvelope<TokenData>(response, "ขอ token ไม่สำเร็จ")
  if (!parsed.ok) return parsed

  const { accessToken, expiresIn } = parsed.data
  if (!accessToken) return { ok: false, error: "ธนาคารไม่ได้ส่ง accessToken กลับมา" }

  cachedToken = {
    value: accessToken,
    expiresAtMs: Date.now() + Math.max(expiresIn * 1000 - TOKEN_SAFETY_WINDOW_MS, 0),
  }
  return { ok: true, data: accessToken }
}

/// ล้าง cache — ใช้ในเทส และเผื่อกรณีธนาคารเพิกถอน token กลางคัน
export function resetTokenCache(): void {
  cachedToken = null
}

/// ref1/ref2/ref3 ของ SCB รับเฉพาะ A-Z และ 0-9 ยาวไม่เกิน 20 ตัว (ไม่มีขีด ไม่มีตัวพิมพ์เล็ก)
const REF_PATTERN = /^[A-Z0-9]{1,20}$/

export type CreateQrInput = {
  /// ยอดที่ต้องจ่าย (บาท) — ส่งเข้า SCB เป็นสตริงทศนิยม 2 ตำแหน่งตามสเปก
  amount: number
  /// โค้ดสั้นที่แมปกลับมาเป็น TableSession ได้ — ตัวเลข+พิมพ์ใหญ่ ไม่เกิน 20 ตัว
  ref1: string
  /// ส่งเฉพาะเมื่อ Supporting Reference ใน Merchant Profile ตั้งเป็น "Two references"
  /// ร้านนี้ตั้งเป็น "One reference" จึงเว้นไว้ — ส่งไปทั้งที่ธนาคารไม่ได้รอรับ เสี่ยงถูกปฏิเสธ
  ref2?: string
}

/// สร้าง QR ผ่าน SCB แล้วคืน payload EMVCo ดิบ (เอาไป render เป็นรูปด้วย `qrcode` เองเหมือนเดิม)
export async function createQrCode(input: CreateQrInput): Promise<ScbResult<string>> {
  const env = readEnv()
  if (!env) return { ok: false, error: "ยังไม่ได้ตั้งค่าคีย์ของ SCB" }

  const billerId = process.env.SCB_BILLER_ID
  if (!billerId) return { ok: false, error: "ยังไม่ได้ตั้งค่า SCB_BILLER_ID" }

  // ref3 ต้องเป็น "prefix + ค่า" (เช่น SCB1234) ไม่ใช่ prefix เปล่า ๆ ตามสเปก QR 30
  // prefix ตัวนี้ยังเป็นตัวกำหนดว่า callback จะถูกส่งมาที่ URL ไหนด้วย — SCB ลงทะเบียน
  // ปลายทาง payment confirmation เป็นคู่ (Biller ID, ref3 prefix) ตั้งผิดคือ callback ไม่มาเลย
  const ref3Prefix = process.env.SCB_REF3_PREFIX
  if (!ref3Prefix) return { ok: false, error: "ยังไม่ได้ตั้งค่า SCB_REF3_PREFIX" }

  if (!REF_PATTERN.test(input.ref1)) {
    return { ok: false, error: "ref1 ต้องเป็น A-Z หรือ 0-9 ยาวไม่เกิน 20 ตัว" }
  }

  const ref3 = `${ref3Prefix}${input.ref1}`.slice(0, 20)

  const token = await getAccessToken()
  if (!token.ok) return token

  let response: Response
  try {
    response = await fetch(`${env.base}/v1/payment/qrcode/create`, {
      method: "POST",
      headers: headers(env.key, token.data),
      body: JSON.stringify({
        qrType: "PP",
        ppType: "BILLERID",
        ppId: billerId,
        amount: input.amount.toFixed(2),
        ref1: input.ref1,
        ...(input.ref2 ? { ref2: input.ref2 } : {}),
        ref3,
      }),
      cache: "no-store",
    })
  } catch (error) {
    return { ok: false, error: `สร้าง QR ไม่สำเร็จ: ${error instanceof Error ? error.message : "เชื่อมต่อธนาคารไม่ได้"}` }
  }

  const parsed = await readEnvelope<QrCreateData>(response, "สร้าง QR ไม่สำเร็จ")
  if (!parsed.ok) return parsed

  const raw = parsed.data.qrRawData
  if (!raw) return { ok: false, error: "ธนาคารไม่ได้ส่ง qrRawData กลับมา" }

  return { ok: true, data: raw }
}

/// รายการชำระเงินที่ธนาคารยืนยันว่าเกิดขึ้นจริง (ตัดมาเฉพาะฟิลด์ที่เราใช้ตัดสินใจ)
export type BillPaymentTransaction = {
  transactionId: string
  amount: number
  billPaymentRef1: string
  transactionDateandTime?: string
}

type InquiryRow = {
  transactionId?: string
  amount?: number | string
  billPaymentRef1?: string
  transactionDateandTime?: string
}

/// eventCode ของ Thai QR Tag 30 (QR บิลเพย์เมนต์ที่เราใช้) — 00300104 เป็นของ B Scan C คนละแบบ
const EVENT_CODE_THAI_QR_TAG30 = "00300100"

/// ถามธนาคารว่ารายการนี้เกิดขึ้นจริงไหม — **ด่านความปลอดภัยหลักของ callback**
///
/// ⚠️ SCB **ไม่ได้เซ็นหรือแนบ credential ใด ๆ มากับ payment confirmation** (ยืนยันจากเอกสาร
/// qr-payment/payment-confirmation) แปลว่าใครก็ตามที่เดา URL ถูกก็ยิง JSON ปลอมมาปิดบิลได้ฟรี
/// จึงห้ามเชื่อ payload ที่ยิงเข้ามาเด็ดขาด ต้องถามกลับมาที่ธนาคารด้วยฟังก์ชันนี้ก่อนปิดบิลเสมอ
export async function inquireBillPayment(params: {
  /// วันที่ของรายการในรูป yyyy-MM-dd (โซนเวลาไทย) — ธนาคารบังคับให้ระบุ
  transactionDate: string
  ref1: string
}): Promise<ScbResult<BillPaymentTransaction>> {
  const env = readEnv()
  if (!env) return { ok: false, error: "ยังไม่ได้ตั้งค่าคีย์ของ SCB" }

  const billerId = process.env.SCB_BILLER_ID
  if (!billerId) return { ok: false, error: "ยังไม่ได้ตั้งค่า SCB_BILLER_ID" }

  const token = await getAccessToken()
  if (!token.ok) return token

  const query = new URLSearchParams({
    eventCode: EVENT_CODE_THAI_QR_TAG30,
    transactionDate: params.transactionDate,
    billerId,
    reference1: params.ref1,
  })

  let response: Response
  try {
    response = await fetch(`${env.base}/v1/payment/billpayment/inquiry?${query.toString()}`, {
      method: "GET",
      headers: headers(env.key, token.data),
      cache: "no-store",
    })
  } catch (error) {
    return {
      ok: false,
      error: `ตรวจสอบรายการกับธนาคารไม่สำเร็จ: ${error instanceof Error ? error.message : "เชื่อมต่อธนาคารไม่ได้"}`,
    }
  }

  const parsed = await readEnvelope<InquiryRow[]>(response, "ตรวจสอบรายการกับธนาคารไม่สำเร็จ")
  if (!parsed.ok) return parsed

  // ธนาคารคืน data เป็น array — เอาแถวที่ ref1 ตรงเท่านั้น ห้ามหยิบแถวแรกมั่ว ๆ
  const row = (Array.isArray(parsed.data) ? parsed.data : []).find((r) => r.billPaymentRef1 === params.ref1)
  if (!row?.transactionId) {
    return { ok: false, error: "ธนาคารไม่พบรายการชำระเงินที่ตรงกับเลขอ้างอิงนี้" }
  }

  return {
    ok: true,
    data: {
      transactionId: row.transactionId,
      amount: Number(row.amount ?? 0),
      billPaymentRef1: row.billPaymentRef1 ?? params.ref1,
      transactionDateandTime: row.transactionDateandTime,
    },
  }
}

/// รูปแบบที่ SCB บังคับให้เราตอบกลับทุก payment confirmation
/// ตอบผิดรูป = ธนาคารถือว่าล้มเหลว แล้วยิงซ้ำ 3 ครั้ง ห่างกัน 12 วินาที ก่อนเลิกแล้วส่งอีเมลแทน
export function confirmationResponse(transactionId: string, confirmId: string) {
  return { resCode: "00", resDesc: "success", transactionId, confirmId }
}

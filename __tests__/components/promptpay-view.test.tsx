// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"
import { PromptPayView } from "@/components/customer/promptpay-view"

const replaceMock = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
}))

/// หน้า QR พร้อมเพย์ฝั่งลูกค้า — จุดที่พังจริงเมื่อ 2026-09-10
///
/// นาฬิกาถอยหลัง 15 นาทีบนจอเป็นของฝั่งเราเท่านั้น QR ที่ค้างอยู่ในแอปธนาคารของลูกค้ายังจ่ายได้จริง
/// ของเดิมพอนาฬิกาหมดจะ "หยุดโพล" ลูกค้าที่จ่ายสำเร็จหลังจากนั้นจึงไม่มีวันได้เห็นใบเสร็จ
/// ทั้งที่บิลปิดเรียบร้อยแล้วฝั่งร้าน
describe("หน้า QR พร้อมเพย์ของลูกค้า", () => {
  const UNPAID = { ok: true, status: { state: "UNPAID" } }
  const PAID = { ok: true, status: { state: "PAID", saleNumber: "INV-000009", total: 260 } }

  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    replaceMock.mockReset()
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => UNPAID }) as unknown as Response)
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function renderView() {
    return render(<PromptPayView qrToken="tok-1" total={260} imageDataUrl="data:image/png;base64,AA" />)
  }

  /// เดินเวลาแบบ async — ให้ effect ของ React ได้รันระหว่างทาง
  async function advance(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  it("ยังโพลถามสถานะต่อ แม้นาฬิกาบนจอจะหมดอายุไปแล้ว", async () => {
    renderView()

    await advance(10_000)
    expect(fetchMock).toHaveBeenCalled()

    // เดินเลย 15 นาทีไปจนนาฬิกาหมด แล้วดูว่ายังถามต่อหรือไม่
    await advance(15 * 60 * 1000)
    expect(screen.getByText(/ถ้าคุณสแกนจ่ายไปแล้ว ไม่ต้องจ่ายซ้ำ/)).toBeInTheDocument()

    const callsAtExpiry = fetchMock.mock.calls.length
    await advance(30_000)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAtExpiry)
  })

  it("จ่ายสำเร็จหลังนาฬิกาหมด → ยังพาไปหน้าใบเสร็จให้ลูกค้า", async () => {
    renderView()

    await advance(15 * 60 * 1000 + 5_000)
    expect(replaceMock).not.toHaveBeenCalled()

    // ธนาคารยืนยันเงินเข้าหลัง QR บนจอหมดอายุ — บิลปิดแล้ว สถานะจึงกลายเป็น PAID
    fetchMock.mockResolvedValue({ ok: true, json: async () => PAID } as unknown as Response)

    await advance(10_000)
    expect(replaceMock).toHaveBeenCalledWith("/order/tok-1/pay/success")
  })
})

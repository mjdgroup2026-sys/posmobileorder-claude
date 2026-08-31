export type FieldErrors = Record<string, string>

/// ผลลัพธ์มาตรฐานของทุก Server Action — ไม่ throw ให้ผู้ใช้เห็น
export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: FieldErrors }

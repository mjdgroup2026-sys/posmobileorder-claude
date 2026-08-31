/// แปลง object เป็น FormData ให้เหมือนที่ Server Action ได้รับจากฟอร์มจริง
/// ค่า undefined = ไม่ set ฟิลด์นั้นเลย (formData.get() จะคืน null)
export function makeFormData(values: Record<string, string | number | undefined>): FormData {
  const formData = new FormData()
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue
    formData.set(key, String(value))
  }
  return formData
}

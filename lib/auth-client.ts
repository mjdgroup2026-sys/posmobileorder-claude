import { createAuthClient } from "better-auth/react"

// ไม่ตั้ง baseURL โดยตั้งใจ — ใช้ path สัมพัทธ์ `/api/auth`
// (NEXT_PUBLIC_* ถูก inline ตอน build เท่านั้น ถ้า hardcode จะติด localhost ไปกับ image)
export const authClient = createAuthClient()

export const { signIn, signUp, signOut, useSession } = authClient

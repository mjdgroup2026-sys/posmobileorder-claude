-- Phase 10 — แยกยอดพร้อมเพย์/บัตรออกจากยอด "สแกน QR" ในใบปิดยอดประจำวัน
--
-- ก่อนหน้านี้ทุกวิธีที่ไม่ใช่ CASH/TRANSFER ถูกรวมลง totalQR ทั้งหมด พอมี PROMPTPAY/CARD
-- จากช่องทาง MJD Mobile Order เข้ามา ตัวเลข "สแกน QR" จะกลายเป็นถังขยะรวมทุกอย่าง
-- (ยอดเงินสดที่ใช้คำนวณส่วนต่างไม่กระทบ แต่ใบปิดยอดต้องอ่านแล้วตรงกับความจริง)

ALTER TABLE "cashier_closing" ADD COLUMN "totalCard" DECIMAL(12,2) NOT NULL DEFAULT 0;

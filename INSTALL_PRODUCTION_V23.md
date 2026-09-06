# V23 Production Deployment — Step by Step

## 0. Backup ก่อนเริ่ม

ก่อน Upgrade:

1. Duplicate Google Spreadsheet ปัจจุบัน หรือ Backup V22 ด้วยตนเอง
2. เก็บ ZIP `V22.6.1` ไว้ Rollback
3. ห้ามลบ `Repair_Log`, `Master_Model`, `Failure_Guide`

## 1. Frontend

Replace ใน GitHub repository:

- `index.html`
- `style.css`
- `app.js`

Add file ใหม่:

- `excel-engine.js`

`config.json` ใช้ GAS_URL เดิมได้ ถ้า Update Deployment เดิม

## 2. Apps Script

Replace ทั้งไฟล์:

- `Code.gs`
- `setup.gs`

กด Save

## 3. Run setupSheets()

เลือก Function:

`setupSheets`

กด Run

ระบบจะสร้าง/ตรวจ:

- Repair_Log
- Master_Model
- Failure_Guide
- Failure_Guide_Images
- Failure_Summary
- Failure_Master
- Failure_Alias
- Audit_Log

### Initial Admin Password

ถ้ายังไม่เคย Setup V23 ระบบจะ Generate Password เช่น:

`TE-xxxxxxxxxxxx`

ดูใน Execution Log บรรทัด:

`IMPORTANT - INITIAL ADMIN PASSWORD: ...`

เก็บ Password นี้ทันที

ระบบเก็บใน Script Properties เฉพาะ Salt + SHA-256

ถ้าลืม Password ให้ Run:

`resetAdminPassword()`

แล้วดู Password ใหม่ใน Execution Log

## 4. Security — สำคัญมาก

หลัง Setup ค่าเริ่มต้น Compatibility คือ:

`WRITE_ACCESS_MODE=OPEN`

OPEN ใช้ทดสอบได้ แต่ไม่แนะนำ Production

### ทางเลือก A — ให้ระบบหา Workspace Domain

Run:

`configureWorkspaceWriteAccess()`

ถ้า Apps Script อ่าน email ของ account ที่ Run ได้ จะตั้ง:

- WRITE_ACCESS_MODE = DOMAIN
- ALLOWED_DOMAIN = domain ของ account

### ทางเลือก B — ตั้ง Script Properties เอง

Apps Script → Project Settings → Script Properties

เพิ่ม:

`WRITE_ACCESS_MODE` = `DOMAIN`

`ALLOWED_DOMAIN` = `your-company-domain.com`

ไม่ต้องใส่ @

### Test ก่อนใช้จริง

ทดสอบ Save จาก account ที่ได้รับอนุญาต

ถ้าขึ้นว่าไม่สามารถอ่าน Workspace email ได้ แสดงว่า Deployment/Identity config ยังไม่เหมาะกับ DOMAIN/WORKSPACE

## 5. Self Test

Run:

`runSelfTest()`

ต้องเห็น:

`V23.0 Self Test: PASS`

## 6. Deploy

Apps Script:

Deploy → Manage deployments → เลือก Deployment ที่ URL ตรงกับ `config.json`

Edit → Version → New version → Deploy

## 7. Health Check

เปิด:

`GAS_URL?action=health`

ต้องมี:

- `ok: true`
- `apiVersion: V23.0`
- `historyDisplayOrder`
- `security`

หน้า Admin ต้องขึ้น Backend V23.0

## 8. Admin Login

ใช้:

- User: ชื่อผู้ใช้งานใดก็ได้ที่ไม่ว่าง
- Password: Initial Admin Password จาก setup log

Login สำเร็จ Backend จะส่ง Session Token อายุ 8 ชั่วโมง

## 9. Backup Trigger

Admin → Production Control & Security

กด:

`ติดตั้ง Auto Backup 02:00`

Apps Script trigger จะ Run ในช่วงเวลาใกล้ 02:00 ตาม scheduler ของ Google

## 10. Acceptance Test

ทำตามลำดับ:

1. Save Repair ใหม่ 1 Record
2. ตรวจ Repair_Log A:N
3. ตรวจ Failure_Summary +1
4. ตรวจ Failure_Master มี Failure
5. History Search/Model/Station/Date
6. Sort ทุกแบบ
7. Pagination 25/50/100/200
8. Export History พร้อมรูป
9. เปิด Failure Popup
10. เพิ่ม Guide:
   - Repair Step
   - Root Cause
   - Check Point
   - Spec
   - Verification
   - Tool
   - Model/Station
   - รูป 2–3 รูป
11. ตรวจ Failure_Guide
12. ตรวจ Failure_Guide_Images
13. Export Current Failure
14. Export All Guide
15. Dashboard Model/Station Breakdown
16. Excel Dashboard ต้องมี 4 กราฟ
17. Admin Edit Repair
18. Admin Delete dummy Repair
19. Admin Edit Guide
20. Admin Delete dummy Guide
21. Merge dummy Failure alias
22. ตรวจ Audit_Log
23. Backup Now
24. ตรวจ Drive folder ATS1_Repair_Backups
25. ปิด Network → Mutation buttons ต้อง Disable
26. เปิด Network → Refresh อัตโนมัติ
27. Logout Admin → Admin mutation ต้องใช้ Session ใหม่

## 11. Rollback

ถ้ามีปัญหา:

1. GitHub rollback Frontend เป็น V22.6.1
2. Apps Script Manage deployments → เลือก Version V22.2 ก่อนหน้า
3. Sheet ใหม่ของ V23 สามารถปล่อยไว้ได้ ไม่กระทบ Repair_Log เดิม
4. อย่าลบ Backup จนกว่าจะยืนยันข้อมูลครบ

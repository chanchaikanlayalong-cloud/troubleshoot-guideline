# Troubleshoot Guideline V23.0 — Production Ready

ระบบ Repair / Troubleshooting Knowledge สำหรับ TE/Production

## Version

- Frontend: `V23.0`
- Apps Script API: `V23.0`
- Repair_Log: Canonical `A:N` เดิม ไม่เปลี่ยนลำดับ Storage

## ฟังก์ชันเดิมที่คงไว้

- Repair History
- Repair Form
- Dashboard Responsive
- Admin Edit / Delete
- Repair image + Google Drive
- Failure Count / Top Failure / Timeline
- Detailed Failure Guide
- Excel History พร้อมรูปจริง
- Excel Detailed Guide พร้อมรูปจริง
- Excel Current Failure พร้อมรูปจริง
- Excel Dashboard พร้อมกราฟ
- Mobile Portrait / Landscape / Desktop

## Production Hardening 1–12

### 1. Security

- ไม่มี `adminmin` หรือ Admin password/hash ฝังใน Frontend/Code.gs
- Backend สร้าง Initial Admin Password ตอน `setupSheets()` ครั้งแรก
- Backend เก็บเฉพาะ Salt + SHA-256 ใน Script Properties
- Admin login ตรวจที่ Backend และได้รับ Session Token อายุ 8 ชั่วโมง
- Password ไม่ถูกเก็บใน Browser หลัง Login สำเร็จ
- Login ผิด 5 ครั้งใน 15 นาที จะพัก User นั้น 10 นาที
- Write Access รองรับ:
  - `OPEN` — ใช้ทดสอบ/Compatibility
  - `WORKSPACE` — ต้องอ่าน Google account ได้
  - `DOMAIN` — จำกัดโดเมน
- Production แนะนำ `DOMAIN`

### 2. Idempotency / Duplicate Protection

ทุก POST mutation ใช้ `opId` แบบ cryptographic random

Backend claim `opId` ก่อนทำงาน ดังนั้น Request เดิม Retry แล้วจะไม่ append ซ้ำ

ครอบคลุม:

- Save Repair
- Save Failure Guide
- Admin Edit/Delete
- Normalize
- Merge Failure
- Backup
- Admin Login/Logout

Operation state เก็บเฉพาะช่วงสั้นและจำกัดจำนวน เพื่อไม่กิน Script Properties quota

### 3. Audit Log

Sheet ใหม่: `Audit_Log`

เก็บ:

- Timestamp
- Actor
- Action
- Entity Type
- Entity ID
- Before JSON
- After JSON
- Source

Action เช่น:

- CREATE_REPAIR
- UPDATE_REPAIR
- DELETE_REPAIR
- CREATE_GUIDE
- UPDATE_GUIDE
- DELETE_GUIDE
- MERGE_FAILURE
- NORMALIZE_REPAIR_LOG
- ADMIN_LOGIN / ADMIN_LOGIN_FAILED / ADMIN_LOGOUT
- CREATE_BACKUP
- INSTALL_BACKUP_TRIGGER

### 4. Performance — Failure Summary

`Failure_Summary` ไม่ Full Scan ทุก Save แล้ว

- Save → `+1` เฉพาะ Failure นั้น
- Delete → `-1`
- Edit Failure → `-1 old / +1 new`
- Full rebuild ใช้เฉพาะ Setup / Normalize / Merge / Recovery

### 5. History Filter / Sort / Pagination

History เพิ่ม:

- Search
- Model Filter
- Station Filter
- Date From
- Date To
- Sort:
  - ใหม่สุดก่อน
  - เก่าสุดก่อน
  - Repair Time มาก → น้อย
  - Repair Time น้อย → มาก
  - Failure A → Z
  - Model A → Z
  - Station A → Z
- Rows/Page: 25 / 50 / 100 / 200
- Previous / Next

Excel History ใช้ Filter + Sort ปัจจุบันทั้งหมด แต่ Pagination ไม่ตัดข้อมูล Export

### 6. Failure Master / Alias / Merge

Sheet ใหม่:

- `Failure_Master`
- `Failure_Alias`

Repair/Guide ใหม่จะ resolve เป็น Canonical Failure

Admin มี `Merge Failure` เช่น:

`AC Led On Fail` → `AC LED ON FAIL`

ระบบจะ:

- Update Repair_Log
- Update Failure_Guide
- Add Alias
- Redirect Alias เก่า
- Rebuild Failure Summary
- Audit

### 7. Structured Troubleshooting Knowledge

Failure Guide เพิ่ม Field:

- Repair Step / วิธีแก้ไขแบบละเอียด
- Root Cause
- Check Point
- Expected Value / Spec
- Verification
- Tool / Equipment
- Related Model
- Related Station
- ผู้เพิ่ม
- วันที่/เวลา

### 8. Multiple Images

Sheet ใหม่: `Failure_Guide_Images`

- Failure Guide รองรับหลายรูป
- User เลือกได้สูงสุด 5 รูปต่อการ Upload
- Admin เพิ่มหลายรูปได้
- Admin ลบรูปทั้งหมดแล้วเพิ่มใหม่ได้
- Legacy image จาก V22 migrate ไป Image table ได้
- Popup แสดงเป็น Gallery
- Excel Detailed Guide / Current Failure รองรับรูป 1–5 เป็นรูปจริงใน `.xlsx`

### 9. Dashboard / Failure Analytics

Dashboard เดิมคงอยู่และเพิ่ม:

- Model Breakdown
- Station Breakdown

Failure Popup เพิ่ม:

- Avg Repair Time
- Last Seen
- Top Model
- Top Station
- Model Breakdown
- Station Breakdown
- Recent Occurrences 5 รายการ

Excel Dashboard เพิ่มกราฟ:

- Top Failure
- Timeline
- Model Breakdown
- Station Breakdown
- Failure Ranking
- KPI

### 10. Excel Engine

เพิ่ม `excel-engine.js`

- Local module
- ไม่ใช้ CDN
- รองรับ Factory/Offline environment
- XML sanitization
- Binary XLSX download
- Existing embedded image/chart engine ยังทำงานเดิม

### 11. Backup

Drive Folder:

`ATS1_Repair_Backups`

Backup Workbook จะ copy Sheet สำคัญทั้งหมด

Retention:

- DAILY: 7
- WEEKLY: 4
- MONTHLY: 12
- MANUAL: 10

Admin มี:

- Backup ตอนนี้
- Install Auto Backup
- Backup Status

Auto Backup ใช้ Apps Script time trigger ประมาณ 02:00

### 12. Offline / Network Protection

- Detect Online / Offline
- Offline Banner
- Disable Mutation buttons เมื่อ Offline
- `requireOnline()` ป้องกัน Save/Edit/Delete ที่ชั้น JS อีกครั้ง
- เมื่อ Online กลับมา → Refresh อัตโนมัติ

## Google Sheet Structure

### Repair_Log — คง A:N เดิม

| Col | Field |
|---|---|
| A | Repair ID |
| B | วันที่ |
| C | เวลา |
| D | Model |
| E | Station |
| F | Fail |
| G | แก้ปัญหายังไง |
| H | เริ่มซ่อม |
| I | ซ่อมเสร็จ |
| J | Repair Time (นาที) |
| K | คนทำ |
| L | Image File ID |
| M | Image URL |
| N | Image Name |

### Failure_Guide — A:S

เพิ่ม Structured troubleshooting fields โดยไม่ลบข้อมูล V22

### New Sheets

- Failure_Guide_Images
- Failure_Master
- Failure_Alias
- Audit_Log

## Important Security Note

GitHub Pages เป็น Public Frontend จึงไม่สามารถซ่อน Secret ใน JavaScript ได้

V23 จึงย้าย Admin authentication ไป Backend และไม่เก็บ Admin password ใน GitHub source

สำหรับ Production ให้ตั้ง Apps Script deployment / Google Workspace ให้ `Session.getActiveUser().getEmail()` อ่าน identity ได้ แล้วใช้ `WRITE_ACCESS_MODE=DOMAIN` หรือ `WORKSPACE`

ถ้า Deployment configuration ทำให้ Active User email ว่าง ระบบ DOMAIN/WORKSPACE จะปฏิเสธการ Save โดยตั้งใจ ต้องปรับ Deployment/Workspace policy ก่อนใช้งานจริง

## Upgrade

อ่าน `INSTALL_PRODUCTION_V23.md` ก่อน Deploy

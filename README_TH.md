# ATS1 Repair Web V6

GitHub Pages + Google Apps Script + Google Sheet + Google Drive

## เพิ่มใน V6

- `Fail` — ช่องบังคับกรอก
- `แก้ปัญหายังไง`
- `รูปประกอบ` — ไม่บังคับ
- `เริ่มซ่อม` / `ซ่อมเสร็จ`
- `Repair Time (นาที)` คำนวณอัตโนมัติ
- Model เลือกจากรายการเดิมหรือพิมพ์ Model ใหม่ได้
- Model ใหม่ถูกเพิ่มเข้า `Master_Model` อัตโนมัติ
- รูปถูกเก็บใน Google Drive
- Repair History ดึงข้อมูลจาก Sheet และ Thumbnail จาก Drive

## โครงสร้าง Repair_Log

| Repair ID | วันที่ | เวลา | Model | Station | Fail | แก้ปัญหายังไง | เริ่มซ่อม | ซ่อมเสร็จ | Repair Time (นาที) | คนทำ | Image File ID | Image URL | Image Name |
|---|---|---|---|---|---|---|---|---|---:|---|---|---|---|

## การเก็บรูป

ค่าเริ่มต้นใน `Code.gs`:

```javascript
DRIVE_FOLDER_ID: '',
```

ถ้าปล่อยว่าง ระบบจะสร้าง Folder:

```text
ATS1_Repair_Images
```

ใน My Drive ของบัญชีที่ Deploy Apps Script ให้อัตโนมัติเมื่อมีการใช้งานครั้งแรก

ถ้ามี Folder ที่ต้องการใช้อยู่แล้ว สามารถใส่ Folder ID ใน `DRIVE_FOLDER_ID`

## การแสดงรูปใน History

ระบบพยายามตั้งรูปเป็น `Anyone with the link` เพราะหน้าเว็บรันอยู่บน GitHub Pages

```javascript
PUBLIC_IMAGE_ACCESS: true
```

หากนโยบาย Google Workspace ของบริษัทไม่อนุญาตการแชร์แบบ Anyone with link:
- รูปยังบันทึกใน Drive ได้
- แต่ Thumbnail บน GitHub Pages อาจไม่แสดงจนกว่าจะ Sign in
- History จะมีทางเปิดรูปใน Google Drive

## สิ่งที่ต้องแก้ใน Code.gs

ต้องใส่ Spreadsheet ID:

```javascript
SPREADSHEET_ID: 'YOUR_GOOGLE_SHEET_ID',
```

`config.json` ในชุดนี้ใช้ GAS_URL เดิมที่คุณให้ไว้แล้ว

## หลังเปลี่ยน Code.gs

Apps Script:

1. Deploy
2. Manage deployments
3. Edit
4. Version → New version
5. Deploy

เพราะถ้าแก้ Code.gs แต่ไม่ Deploy New version เว็บ `/exec` จะยังใช้โค้ดเก่า

## ทดสอบ

เปิด:

```text
YOUR_GAS_URL?action=health
```

ควรได้ JSON ที่มี:

```json
{
  "ok": true,
  "message": "ATS1 Repair API is running",
  "imageFolderId": "..."
}
```

การเรียก `health` ครั้งแรกจะสร้างโฟลเดอร์รูปให้ด้วยถ้ายังไม่มี

## หมายเหตุเกี่ยวกับ Sheet เก่า

ถ้า `Repair_Log` เป็น V5 ระบบจะเพิ่มคอลัมน์ `Fail` หลัง `Station`
และเพิ่มคอลัมน์รูปด้านท้ายให้อัตโนมัติ โดยพยายามรักษาข้อมูลเดิมไว้


---

# Version 7 — Production UI / Responsive Layout

V7 ปรับเฉพาะ Frontend ไม่เปลี่ยน Google Sheet schema และไม่เปลี่ยนชื่อคอลัมน์ใน Sheet

## เปลี่ยนชื่อที่แสดงบนเว็บ

คอลัมน์ใน Sheet ยังชื่อ `Fail` เหมือนเดิม แต่หน้าเว็บแสดงเป็น:

- `Failure / Symptom`
- `อาการเสีย / ปัญหาที่พบ`

และ `แก้ปัญหายังไง` แสดงเป็น:

- `Repair Action`
- `วิธีตรวจสอบและวิธีแก้ปัญหา`

ดังนั้นข้อมูลเก่าและ Code.gs ยังใช้ได้เหมือนเดิม

## Responsive

### มือถือแนวตั้ง
- Form 1 คอลัมน์
- ปุ่ม Save/Cancel อยู่ด้านล่างและ Sticky
- Repair History เปลี่ยนจากตารางกว้างเป็น Card อัตโนมัติ
- ช่องกรอกใช้ขนาด 16px ป้องกัน Browser Zoom

### มือถือแนวนอน
- Form เปลี่ยนเป็น 2 คอลัมน์
- Timing ใช้ 4 ช่องในแถวเดียวเมื่อพื้นที่พอ
- Header และระยะห่างถูกลดลงเพื่อใช้พื้นที่จอให้คุ้ม

### Desktop / Laptop
- Form แบ่งเป็น 3 Section:
  1. Machine Information
  2. Failure & Repair
  3. Repair Timing & Owner
- Layout 12-column responsive
- History ยังคงเป็นตารางพร้อม Sticky Header

## Backend / Sheet

`Code.gs`, `setup.gs`, `config.json` ใช้ของ V6 เดิม
ไม่มีการเปลี่ยนชื่อหรือเพิ่มคอลัมน์ใด ๆ ใน Google Sheet


---

# Version 8 — Dashboard + Page Order

ลำดับหน้าใหม่:

1. `Repair History`
2. `Repair Form`
3. `Dashboard`

V8 ไม่เปลี่ยน Google Sheet schema และไม่เพิ่มคอลัมน์ใหม่

Dashboard ใช้ข้อมูลที่ Web โหลดมาจาก `Repair_Log` แล้วคำนวณใน Browser

## Dashboard Filter

เลือก:

- รายวัน
- รายสัปดาห์
- รายเดือน

และเลือกช่วงจริงด้วย:

- `<input type="date">`
- `<input type="week">`
- `<input type="month">`

สามารถ Filter เพิ่มตาม:

- Model
- Station

## Top Failure

เลือกจำนวนอันดับ:

- Top 5
- Top 10
- Top 15
- Top 20

แสดง:

- Failure / Symptom
- จำนวนครั้ง
- % ของ Repair Records ในช่วงที่เลือก
- Average Repair Time

## Timeline

- รายวัน → แยกจำนวน Repair Records ตามชั่วโมง
- รายสัปดาห์ → แยกตามวันในสัปดาห์
- รายเดือน → แยกตามวันในเดือน

## KPI

แสดง:

- Repair Records
- Average Repair Time
- จำนวน Models
- จำนวน Stations

ทั้งหมดกรองตาม Timeline / Model / Station เดียวกับ Dashboard


---

# Version 9

เพิ่มมุมมองเวลา:

- ALL
- รายวัน
- รายสัปดาห์
- รายเดือน
- 1 ปี

เมื่อเลือก `1 ปี` จะมีรายการปีจากข้อมูลจริงใน Repair History ให้เลือก

Timeline:
- ALL → แยกตามเดือน/ปี
- รายวัน → แยกตามชั่วโมง
- รายสัปดาห์ → แยกตามวัน
- รายเดือน → แยกตามวันในเดือน
- 1 ปี → แสดงครบ 12 เดือน

จำนวน Top Failure:
- เลือกได้ตั้งแต่ 0 ถึง 99
- 0 = ไม่แสดง Top Failure / Ranking
- 1–99 = แสดงตามจำนวนอันดับที่เลือก

ไม่มีการเปลี่ยน Google Sheet schema


---

# Version 10 — Mobile Repair History Horizontal Table

ปรับ Repair History บนมือถือ:

- ไม่แสดงเป็น Card แนวตั้งแล้ว
- ใช้ Table แนวนอนเหมือน Desktop
- ใช้นิ้วเลื่อนซ้าย/ขวาได้
- Header ของตาราง Sticky อยู่ด้านบน
- `Repair ID` Sticky อยู่ด้านซ้าย เพื่อให้รู้ว่ากำลังดู Record ไหน
- Search / Model Filter ยังอยู่ด้านบน
- รองรับทั้ง Portrait และ Landscape

ไม่มีการเปลี่ยน Google Sheet, Apps Script หรือข้อมูล Backend


---

# Version 11 — Google Drive Image Fix

แก้ปัญหา URL แบบ:

`https://drive.google.com/file/d//view`

สาเหตุคือ `Image File ID` ว่างหรือหน้าเว็บไม่ได้รับ ID

V11:
- ตรวจ Image File ID ก่อนสร้างลิงก์
- ถ้า ID ว่าง แต่ Image URL มี ID อยู่ จะดึง ID จาก URL อัตโนมัติ
- ถ้ามี File ID แต่ Image URL ว่าง จะสร้าง Thumbnail URL จาก File ID
- ไม่เปิดลิงก์ `/d//view` อีก
- ถ้าไม่มี ID จริง แสดง `ไม่พบ Image File ID`
- ไม่เปลี่ยนโครงสร้าง Google Sheet

## ตรวจข้อมูลใน Repair_Log

คอลัมน์รูปยังเป็น:

- L = Image File ID
- M = Image URL
- N = Image Name

ถ้ารายการมีรูป คอลัมน์ L ต้องมี Google Drive File ID


---

# Version 12 — Mobile Table + Correct Column Mapping + Image Fallback + Admin

## 1. Mobile Repair History

V12 บังคับ Repair History บนมือถือให้เป็น Table แนวนอนด้วย CSS Override ตอนท้ายไฟล์

และ `index.html` ใช้:

```html
style.css?v=12
app.js?v=12
```

เพื่อบังคับ Browser/Safari โหลดไฟล์ใหม่ ไม่ใช้ Cache เก่า

## 2. แก้ข้อมูลใส่ผิดช่อง

Backend ไม่อ่านข้อมูลจาก Column number แบบตายตัวอีกแล้ว

V12 อ่านและเขียนตามชื่อ Header เช่น:

- `Fail` → failure
- `แก้ปัญหายังไง` → repairAction
- `เริ่มซ่อม` → startRepair
- `ซ่อมเสร็จ` → finishRepair
- `Repair Time (นาที)` → repairTime
- `คนทำ` → repairBy

ดังนั้นแม้ลำดับ Column ไม่ตรงกับ Code รุ่นเก่า ข้อมูลใหม่จะไม่เลื่อนไปผิดช่อง

> ถ้าข้อมูลเก่าถูกบันทึกลงเซลล์ผิดไปแล้ว ข้อมูลเดิมจะไม่ถูกย้ายอัตโนมัติ
> ให้ใช้หน้า Admin ของ V12 แก้ไข Record เดิมได้

## 3. Image

ถ้า Google Workspace ไม่ยอมให้ GitHub โหลด Google Drive Thumbnail โดยตรง:

1. เว็บลอง Drive Thumbnail ก่อน
2. ถ้าโหลดไม่ได้ จะใช้ `action=imageData`
3. Apps Script อ่านรูปจาก Drive ในนาม Owner
4. ส่งรูปกลับเป็น Data URL ให้หน้าเว็บ

จึงไม่จำเป็นต้อง Public Drive เสมอไปสำหรับการ Preview

## 4. Admin

เพิ่มหน้า `Admin`

Login:

- User: ใส่อะไรก็ได้
- Password: `adminmin`

Admin สามารถ:

- Search Record
- เลือก Record
- แก้วันที่
- แก้เวลา
- แก้ Model
- แก้ Station
- แก้ Failure / Symptom
- แก้ Repair Action
- แก้เวลาเริ่ม/เสร็จ
- แก้คนทำ
- Repair Time คำนวณใหม่อัตโนมัติ
- ลบรูปของ Record
- ลบ Record ทั้งแถว

การแก้ไข/ลบถูกตรวจ Password ซ้ำที่ Apps Script Backend

## 5. Google Sheet

V12 ไม่เพิ่ม ไม่ย้าย และไม่ลบ Column ใน Google Sheet

`setup.gs` ใช้ตรวจสอบ Header และ Drive Folder เท่านั้น


---

# Version 13 — Recover Shifted Old Data + Drive Image

จาก Sheet ที่เคยถูก Version เก่าทำให้ Header/Column เลื่อน V13 จะไม่แก้โครงสร้าง Sheet

Backend จะ:

1. หา `Image URL` จากข้อมูลจริงในแถว
2. หา `Image File ID` จากช่องก่อนหน้า
3. ไล่ย้อนกลับเพื่อระบุ:
   - คนทำ
   - Repair Time
   - ซ่อมเสร็จ
   - เริ่มซ่อม
   - Repair Action
   - Failure / Symptom
4. ใช้ Mapping นี้กับ Repair History, Save ใหม่ และ Admin

จึงสามารถอ่านข้อมูลเก่าที่หัว Column ไม่ตรงกับข้อมูลได้โดยไม่ต้องย้าย Column

## ตรวจ V13

หลัง Deploy Apps Script New Version เปิด:

`YOUR_GAS_URL?action=health`

ควรเห็น:

```json
{
  "ok": true,
  "message": "ATS1 Repair API V13 is running",
  "inferredFromData": true,
  "detectedColumns": {
    ...
    "imageFileId": 14,
    "imageUrl": 15
  }
}
```

เลข Column อาจต่างกันตาม Sheet จริง

## Cache

Frontend ใช้:

- `style.css?v=13`
- `app.js?v=13`

เพื่อบังคับมือถือโหลด CSS/JS ใหม่


---

# Version 14 — Reliable Admin Edit/Delete

V14 แก้ Admin ที่ก่อนหน้านี้กดแล้วไม่รู้ว่า Apps Script ตอบอะไร เพราะ POST ใช้ `no-cors`

## วิธีใหม่

1. หน้าเว็บสร้าง `opId`
2. ส่ง `adminUpdate` หรือ `adminDelete` ไป Apps Script
3. Apps Script ทำงานและเก็บผลสำเร็จ/Error ไว้ใน Script Properties
4. หน้าเว็บเรียก `adminOpStatus` กลับด้วย JSONP
5. เว็บแสดง Error จริง เช่น:
   - Admin password ไม่ถูกต้อง
   - Repair ID ไม่พบ
   - Backend ยังเป็น Version เก่า
   - Apps Script deployment URL ไม่ตรง
6. ถ้าสำเร็จจึง Reload History

## Backend Version Check

ก่อนเข้า Admin V14 จะเรียก:

`?action=health`

และต้องเห็น:

```json
"apiVersion": "V14"
```

ถ้าไม่ใช่ V14 หน้า Admin จะไม่ยอมเข้า และจะแจ้งให้ Deploy New version ก่อน

## สิ่งที่ต้องทำ

หลังแทน `Code.gs` ด้วย V14:

1. Save
2. Deploy
3. Manage deployments
4. Edit
5. Version → New version
6. Deploy

ถ้าสร้าง Deployment ใหม่แทนการ Edit deployment เดิม ต้องเอา `/exec` URL ใหม่ไปใส่ใน `config.json`


---

# Version 15 — Row-by-row Recovery

ปัญหาที่พบใน Sheet จริงคือข้อมูลเก่าแต่ละแถว Shift ไม่เท่ากัน

V15 จึงไม่ใช้ Mapping เดียวทั้ง Sheet

## วิธีอ่านแต่ละแถว

หลัง Station ระบบจะ:

1. หา Google Drive Image URL / File ID
2. หาเวลา HH:MM สองค่าท้าย → เริ่มซ่อม / ซ่อมเสร็จ
3. ค่าก่อนเวลา → Failure / Repair Action
4. ค่าหลังเวลาซ่อมเสร็จ → Repair Time / คนทำ
5. File ID / URL / Image Name อ่านจากตำแหน่งจริงของแถวนั้น

## ข้อมูลใหม่

ทุก Record ใหม่เขียนเป็นมาตรฐาน A:N:

A Repair ID
B วันที่
C เวลา
D Model
E Station
F Fail
G แก้ปัญหายังไง
H เริ่มซ่อม
I ซ่อมเสร็จ
J Repair Time (นาที)
K คนทำ
L Image File ID
M Image URL
N Image Name

## Admin

เพิ่มปุ่ม:

`จัดข้อมูลเก่าให้ตรงช่อง`

เมื่อกด ระบบจะ Parse ข้อมูลเก่าทีละแถว แล้ว Rewrite ให้เป็น A:N มาตรฐาน

Admin Edit ก็จะ Normalize Record ที่แก้ไขอัตโนมัติ

## Deploy

ต้อง Deploy Code.gs V15 เป็น New version แล้ว Admin ต้องแสดง:

`Backend: V15`


---

# Version 16 — Refresh + Code Review Fixes

## Refresh

หลังทำรายการต่อไปนี้ เว็บจะ Refresh Google Sheet ใหม่อัตโนมัติ:

- บันทึก Repair
- Admin Edit
- Admin Delete
- Normalize old data

หน้า Repair History แสดง `รีเฟรชล่าสุด: HH:MM:SS`

Admin table จะถูก Render ใหม่หลัง `loadHistory()` จึงไม่ค้างข้อมูลเก่าหลังแก้ไขหรือลบ

## Save confirmation

V15 ใช้ POST แบบ `no-cors` แล้วถือว่าสำเร็จทันที

V16 ใช้ Operation ID และ Poll status จาก Apps Script เหมือน Admin
จึง Reset Form หลัง Backend ยืนยันว่าบันทึกสำเร็จจริงเท่านั้น

## Normalize backup

ก่อนกด `จัดข้อมูลเก่าให้ตรงช่อง`
ระบบจะสร้าง Backup Sheet อัตโนมัติ เช่น:

`Backup_Repair_Log_20260905_142530`

แล้วค่อย Normalize Repair_Log

## Concurrency

Admin Edit / Delete / Normalize ใช้ `LockService`
เพื่อลดความเสี่ยงแก้หรือลบผิดแถวเมื่อมีหลายคนใช้งานพร้อมกัน

## Google Drive safety

`imageData` ถูกจำกัดให้อ่านได้เฉพาะไฟล์ที่อยู่ใน
`ATS1_Repair_Images`

ไม่สามารถส่ง File ID ของไฟล์อื่นใน Drive ของเจ้าของ Script
เพื่อให้ Web App อ่านไฟล์นั้นได้

## Operation status

ผล Operation ไม่ถูกลบทันทีหลัง Poll ครั้งแรก
เพื่อป้องกันกรณี response แรกหายแล้วเว็บค้าง pending

Status เก่ากว่า 10 นาทีจะถูก cleanup อัตโนมัติ

## Deploy

Frontend และ Apps Script ต้องเป็น V16 ทั้งคู่

Health check:

`GAS_URL?action=health`

ต้องมี:

```json
{
  "ok": true,
  "apiVersion": "V16"
}
```


---

# Version 18 — Backend Repair Owner Fix

V18 ใช้ฐานจาก V16 และคงระบบเดิมทั้งหมด:

- Auto Refresh
- Admin Edit / Delete
- Dashboard
- Google Drive image
- Normalize old data
- Operation status
- LockService
- Backup ก่อน Normalize

## ปัญหาที่แก้

ตัวอย่างข้อมูลใน Sheet:

```text
H เริ่มซ่อม       = 15:06
I ซ่อมเสร็จ       = 15:06
J Repair Time      = ว่าง
K คนทำ             = MIN
```

Logic เก่าจะมองค่าที่ไม่ว่างตัวแรกหลังซ่อมเสร็จเป็น Repair Time

จึงกลายเป็น:

```text
repairTime = MIN
repairBy   = ว่าง
```

แล้วภายหลังระบบคำนวณ Repair Time ใหม่เป็น 0 แต่ไม่ได้ย้าย MIN กลับมาเป็นคนทำ

## Logic V18

ค่าหลัง "ซ่อมเสร็จ" ถูกแยกตามชนิดข้อมูล:

- ค่าที่เป็นตัวเลข >= 0 → Repair Time
- ค่าที่ไม่ใช่ตัวเลข → คนทำ

ถ้าไม่มี Repair Time ระบบคำนวณจาก:

`เริ่มซ่อม → ซ่อมเสร็จ`

ดังนั้น:

```text
15:06 → 15:06
Repair Time = 0
คนทำ = MIN
```

## Fallback

ถ้า Parser ยังไม่ได้ `repairBy` แต่ Column K มีข้อความที่ไม่ใช่ตัวเลข
V18 จะใช้ Column K เป็น `คนทำ`

## Deploy

Frontend และ Apps Script ต้องเป็น V18 ทั้งคู่

Health check:

```text
GAS_URL?action=health
```

ต้องมี:

```json
{
  "ok": true,
  "apiVersion": "V18"
}
```


---

# Version 19 — Dashboard Responsive Layout

V19 ปรับเฉพาะ Frontend Dashboard
Backend ยังใช้ Apps Script V18

## Desktop / Notebook

- Filter 6 ช่องในแถวเดียวเมื่อพื้นที่พอ
- KPI 4 ช่องในแถวเดียว
- Top Failure และ Timeline วางซ้าย/ขวา
- Failure Ranking เต็มความกว้างด้านล่าง

## Mobile Portrait

- Header และ Tabs ลดความสูง
- Filter 1 คอลัมน์
- KPI แบบ 2x2
- Top Failure เต็มความกว้าง
- Timeline เต็มความกว้างและเลื่อนซ้าย/ขวาได้
- Ranking เป็นตารางแนวนอนเลื่อนซ้าย/ขวา

## Mobile Landscape

- Filter 3 คอลัมน์
- KPI 4 ช่องในแถวเดียว
- Top Failure ด้านซ้าย
- Timeline ด้านขวา
- ใช้ความสูงหน้าจอน้อยลง

## Deploy

อัปเดตเฉพาะ Frontend:

- index.html
- style.css
- app.js
- config.json

Apps Script Backend V18 ใช้ตัวเดิมได้


---

# Version 20 — Reviewed & Hardened

V20 ทำ Code Review ทั้ง Frontend และ Apps Script

การเปลี่ยนแปลงหลัก:

- แก้ Refresh race condition
- Admin Edit รอค่าที่แก้จริง ไม่ใช่แค่ Repair ID ยังอยู่
- Canonical A:N อ่านตรง ไม่ใช้ heuristic
- เวลา HH:mm ตรวจ range จริง
- Admin ตรวจ Date / Record Time
- Dashboard ไม่รับ Invalid Date แบบ rollover
- Invalid record time ไม่ถูกนับเป็น 00:00
- Top Failure รวมตัวพิมพ์เล็ก/ใหญ่
- Repair Time เขียนลง Sheet เป็นตัวเลข
- Save ล้มหลัง Upload รูป → ลบ orphan image
- Remove Image → Commit Sheet ก่อน Trash Drive
- Reject Duplicate Repair ID
- Normalize All ตรวจ Duplicate ก่อนเขียนทับ
- Health check ไม่สร้าง Drive folder
- Model dropdown de-duplicate
- History Model filter รวม Model จากข้อมูลจริง
- เพิ่ม `runSelfTest()` ใน setup.gs
- เพิ่ม `CODE_REVIEW_V20.md`

Frontend และ Apps Script ต้องเป็น V20 ทั้งคู่


---

# Version 21 — User-first Repair History

V21 ปรับเฉพาะ Frontend และใช้ Apps Script V20 เดิม

## Repair History order

แสดงเฉพาะข้อมูลที่ User ใช้ตรวจสอบบ่อย และเรียงเป็น:

1. Failure / Symptom
2. Repair Action
3. รูป
4. Model
5. Station
6. เริ่มซ่อม
7. ซ่อมเสร็จ
8. Repair Time (นาที)
9. คนทำ
10. Repair ID

`วันที่` และ `เวลาบันทึก` ยังอยู่ในข้อมูล Backend และยังใช้ค้นหา /
Dashboard ได้ แต่ไม่แสดงในตาราง History เพื่อประหยัดพื้นที่

## Branding

```html
<title>Troubleshoot Guideline</title>
<div class="eyebrow">TEST ENGINEERING · CDBU4</div>
<h1>troubleshoot guideline</h1>
<p>บันทึกและติดตามประวัติการซ่อมเครื่อง TE</p>
```

Admin note:

```html
<p class="admin-note">ใส่UserและPassword</p>
```

## Deploy

อัปเดตเฉพาะ Frontend:

- index.html
- style.css
- app.js
- config.json

Apps Script V20 ไม่ต้อง Deploy ใหม่


---

# V22 — Failure Knowledge / Detailed Troubleshooting Guide

V22 เพิ่มระบบ Knowledge สำหรับ Failure โดยคงฟังก์ชันเดิมทั้งหมดจาก V21

## เมื่อคลิก Failure

คลิกชื่อ Failure ได้จาก:
- Repair History
- Top Failure
- Failure Ranking

Popup จะแสดง:
- Failure นี้เกิดทั้งหมดกี่ครั้ง
- วิธีแก้ไขแบบละเอียดทุกวิธีที่เคยเพิ่ม
- ผู้เพิ่ม
- วันที่ / เวลา
- รูปประกอบ
- ปุ่มเพิ่มวิธีแก้ไขแบบละเอียด

## Sheet ใหม่

### Failure_Summary
สร้างและ Sum อัตโนมัติจาก Repair_Log

Columns:
1. Failure Key
2. Failure / Symptom
3. Fail Count
4. Last Seen
5. Updated At

### Failure_Guide
เก็บวิธีแก้ไขแบบละเอียดแยกจาก Repair_Log

Columns:
1. Guide ID
2. Failure Key
3. Failure / Symptom
4. วิธีแก้ไขแบบละเอียด
5. ผู้เพิ่ม
6. วันที่
7. เวลา
8. Image File ID
9. Image URL
10. Image Name
11. Updated Date
12. Updated Time

## Admin

หน้า Admin เดิมยังอยู่ครบ และเพิ่มส่วน:

Detailed Failure Guide Management

Admin สามารถ:
- Search Guide
- Edit Failure
- Edit วิธีแก้ละเอียด
- Edit ผู้เพิ่ม
- ลบรูป
- เปลี่ยนรูป
- Delete Guide

## สำคัญหลัง Update

1. Replace Frontend:
   - index.html
   - style.css
   - app.js
   - config.json ใช้ของเดิมได้

2. Replace Apps Script:
   - Code.gs
   - setup.gs

3. Run `setupSheets()` 1 ครั้ง
   - สร้าง Failure_Guide
   - สร้าง Failure_Summary
   - Sum ข้อมูล Fail เดิมจาก Repair_Log

4. Deploy Apps Script:
   Deploy → Manage deployments → Edit → New version → Deploy

5. Health:
   `GAS_URL?action=health`

ต้องเห็น:
`"apiVersion":"V22"`

## ข้อมูลเดิม

V22 ไม่ลบ Repair_Log เดิม
ไม่ลบ Master_Model
ไม่ลบ Admin เดิม
ไม่ลบ Dashboard เดิม
ไม่ลบระบบรูปเดิม

Failure_Guide และ Failure_Summary เป็น Sheet เพิ่มใหม่


---

# V22.1 Reviewed

V22.1 เป็น V22 ที่ผ่าน Code Review เพิ่มเติมและแก้ Bug โดยไม่ตัดฟังก์ชันเดิม

แก้หลัก:
- รูปขยายของ Failure Guide อยู่เหนือ Popup
- Esc ปิดรูปก่อน ไม่ปิด 2 Popup พร้อมกัน
- Failure_Summary sync พังจะไม่ทำให้ Repair_Log ที่บันทึกสำเร็จถูกแจ้งว่า Save Fail
- เพิ่มเวลารอ Backend
- Reset รูปใน Admin Guide ให้ถูกต้อง
- ตรวจ Guide ID ซ้ำก่อน Edit/Delete

Deploy Frontend + Apps Script ใหม่ และ Health ต้องเห็น:

`"apiVersion":"V22.1"`


---

# V22.2 — History Order + API Alignment

Repair History ล็อกลำดับ:

1. Failure / Symptom
2. Repair Action
3. รูป
4. Model
5. Station
6. เริ่มซ่อม
7. ซ่อมเสร็จ
8. Repair Time (นาที)
9. คนทำ
10. Repair ID

เพิ่ม Frontend/API contract check และแก้ loading/error colspan เป็น 10.
Repair_Log A:N เดิมไม่เปลี่ยน เพื่อไม่ให้ข้อมูลเก่าเลื่อน.


---

# V22.3 — Excel Export (Frontend Only)

Backend ยังคง V22.2 และไม่ต้อง Deploy Apps Script ใหม่

## Export History

ปุ่ม:
`Excel History`

Export เฉพาะข้อมูลที่ตรงกับ:
- Search ปัจจุบัน
- Model Filter ปัจจุบัน

ตัวอย่าง:
- Search = `AC_OK`
- Model = `ECD900020030`

Excel จะมีเฉพาะ Record ที่ตรงทั้งสองเงื่อนไข

History ไม่มีการ Sort ตาม Model
`filterModel` เป็น Filter เท่านั้น

ลำดับ History/Export:
Record ใหม่สุดก่อน ตาม Backend

Excel History ใช้ Column ตามหน้าเว็บ:
1. Failure / Symptom
2. Repair Action
3. รูป
4. Model
5. Station
6. เริ่มซ่อม
7. ซ่อมเสร็จ
8. Repair Time (นาที)
9. คนทำ
10. Repair ID

Workbook มีอีก Sheet `Export Filter`
เพื่อบอก Search, Model Filter, Sort และจำนวน Record ที่ Export

## Export Detailed Failure Guide

ปุ่ม:
`Excel วิธีแก้ละเอียด`

Export Failure_Guide ทุก Record ที่เคยบันทึก:
- Guide ID
- Failure / Symptom
- Fail Count
- วิธีแก้ไขแบบละเอียด
- ผู้เพิ่ม
- วันที่
- เวลา
- รูป / URL
- Image Name
- Updated Date
- Updated Time

Fail Count คิดจาก Repair History ทั้งหมด
ไม่ขึ้นกับ Search/Model Filter ในหน้า History

## Excel format

ใช้ Excel XML `.xls` ที่สร้างจาก Browser โดยตรง
ไม่ใช้ CDN และไม่ต้องติดตั้ง JavaScript Library เพิ่ม

## Deploy

อัปเดต Frontend:
- index.html
- style.css
- app.js

ไม่ต้องแก้:
- Code.gs
- setup.gs
- config.json

Backend ต้องคง `V22.2`

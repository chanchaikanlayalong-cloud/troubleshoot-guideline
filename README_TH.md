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

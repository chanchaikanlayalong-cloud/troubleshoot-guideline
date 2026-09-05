# V22.2 API Alignment Check

## Repair History visible order

1. Failure / Symptom → `failure`
2. Repair Action → `repairAction`
3. รูป → `imageFileId`, `imageUrl`, `imageName`
4. Model → `model`
5. Station → `station`
6. เริ่มซ่อม → `startRepair`
7. ซ่อมเสร็จ → `finishRepair`
8. Repair Time (นาที) → `repairTime`
9. คนทำ → `repairBy`
10. Repair ID → `repairId`

## Frontend POST save
- `model`
- `station`
- `failure`
- `repairAction`
- `startRepair`
- `finishRepair`
- `repairTime`
- `repairBy`
- `imageName`
- `imageMimeType`
- `imageBase64`

## Backend required save parameters
- `model`
- `station`
- `failure`
- `repairAction`
- `startRepair`
- `finishRepair`
- `repairBy`

Backend recalculates Repair Time from start/finish.

## Backend GET records fields
- `sheetRow`
- `repairId`
- `date`
- `time`
- `model`
- `station`
- `failure`
- `repairAction`
- `startRepair`
- `finishRepair`
- `repairTime`
- `repairBy`
- `imageFileId`
- `imageUrl`
- `imageName`

## Repair_Log canonical storage
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

Sheet order remains A:N to preserve existing data.
History display order is independent from Sheet order.

## Configuration
GAS URL:
`https://script.google.com/macros/s/AKfycbxfa2ab8bhYd560qgbP_W5iOkUt3X-KFmYE3hFQnovGVqqwRAHlf_DRP7RgcWKgPD6_8A/exec`

Spreadsheet ID in Code.gs:
`1VAEBe8tEPCpaNVoYdru_hbwQ-XrPTrbalftafJqVwLU`

## Runtime API contract
`?action=health` returns:
- `historyDisplayOrder`
- `repairRecordApiFields`

Frontend checks records fields before rendering.
Admin checks History contract before login.

## Bug fixed
History has 10 columns, so loading/error placeholder now uses `colspan="10"`.

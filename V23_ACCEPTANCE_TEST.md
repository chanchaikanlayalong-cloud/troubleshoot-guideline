# V23 Acceptance Test Sheet

ใช้เอกสารนี้หลัง Deploy ทุกครั้ง

| # | Test | Expected |
|---:|---|---|
| 1 | Health | apiVersion V23.0 |
| 2 | Admin Login valid | Login PASS + session token |
| 3 | Admin Login wrong x5 | Temporary lock |
| 4 | Save Repair | 1 row only |
| 5 | Retry same opId | No duplicate row |
| 6 | Failure Summary | Count +1 |
| 7 | History Filter | Correct filtered rows |
| 8 | History Sort | Correct ordering |
| 9 | Pagination | Correct page/count |
| 10 | History Excel | All filtered rows, not only current page |
| 11 | Failure Guide structured fields | Saved/read correctly |
| 12 | 3 guide images | Gallery shows 3 |
| 13 | Guide Excel | Embedded images, no image links |
| 14 | Failure analytics | Count/MTTR/model/station/recent correct |
| 15 | Merge Failure | Repair/Guide/Summary/Alias all updated |
| 16 | Admin Edit Repair | Audit before/after exists |
| 17 | Admin Delete | Summary decrements |
| 18 | Backup Now | New backup workbook in Drive |
| 19 | Auto backup trigger | Installed |
| 20 | Dashboard export | 4 charts + ranking/KPI |
| 21 | Offline Save | Blocked |
| 22 | Back Online | Auto refresh |
| 23 | Logout | Admin writes blocked without new session |

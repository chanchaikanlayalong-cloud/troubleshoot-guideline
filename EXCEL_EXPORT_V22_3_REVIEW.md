# V22.3 Excel Export Review

## Current History behavior
- Search: filter
- Model selector: filter
- Model sort: NONE
- Record order: newest first from Backend

## Export History
Uses the SAME `getCurrentHistoryFilteredRecords()` function as `renderHistory()`.

Therefore the exported rows exactly follow:
- Current Search
- Current Model Filter
- Same newest-first row order

## Export Detailed Failure Guide
Reads fresh `failureGuides` data from Apps Script V22.2.
Exports every saved detailed guide.
Fail Count is calculated from all loaded Repair History records, not the History filter.

## Backend
No Backend changes.

SHA256 unchanged:
- Code.gs
- setup.gs
- config.json

## Function preservation
- Existing frontend functions preserved: 98/98
- Existing backend functions preserved: 57/57
- Total frontend functions after export feature: 110
- Total backend functions: 57

## Validation
- app.js syntax: PASS
- config.json: PASS
- JS -> HTML ID check: PASS

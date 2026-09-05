# ATS1 Repair Web V20 — Code Review

## Fixed defects

### 1. Refresh race condition
V19 returned `false` when another refresh was already running.
A save/edit/delete verification could therefore read stale `allRecords`.

V20 shares the same in-flight refresh Promise and performs Model → History
sequentially.

### 2. Admin edit false-positive success
V19 considered an edit refreshed as soon as the Repair ID existed.
That Repair ID already existed before the edit, so stale values could be
mistaken for the new values.

V20 waits until the edited fields actually match.

### 3. Canonical rows were still parsed heuristically
The legacy parser is useful for shifted old rows, but canonical A:N rows
should not be guessed.

V20 detects canonical rows first and reads A:N directly.
This also supports numeric-only owner values without confusing them with
Repair Time.

### 4. Invalid time values
Both frontend and backend could accept impossible values if called outside
the normal `<input type="time">` control.

V20 validates HH:mm ranges (00:00–23:59).

### 5. Admin date / record time validation
Admin could save invalid date/time text and silently break Dashboard filters.

V20 validates:
- Date: `dd/MM/yyyy`
- Record time: `HH:mm:ss`
- Start/finish: `HH:mm`

### 6. Dashboard date parser
JavaScript Date could roll invalid dates such as 31/02 into March.

V20 uses strict component validation and does not guess unknown formats.

### 7. Invalid record time counted at 00:00
V19 mapped invalid record time to hour 0.

V20 excludes invalid time from the hourly timeline instead.

### 8. Top Failure capitalization split
`PSU FAIL` and `psu fail` were counted separately.

V20 groups Failure case-insensitively while preserving the first display text.

### 9. Repair Time stored as text
Canonical writer converted Repair Time through `clean_()` and stored a string.

V20 writes Repair Time as a numeric cell.

### 10. Orphan Drive image
If image upload succeeded but Sheet append failed, the Drive file remained.

V20 trashes the just-uploaded image on save failure.

### 11. Admin remove-image consistency
V19 could trash the Drive image before the Sheet update finished.

V20 commits the Sheet first, then trashes the image.

### 12. Duplicate Repair ID safety
Admin edit/delete used the first match if duplicate Repair IDs existed.

V20 rejects ambiguous duplicate IDs.
Normalize All also aborts if duplicate IDs are detected.

### 13. Health check side effect
V19 health check could create the image folder.

V20 health is read-only and only reports whether the folder is ready.

### 14. Model duplicates
Master_Model duplicates could appear in dropdowns.

V20 de-duplicates and natural-sorts model names.

### 15. History Model filter coverage
A model present in Repair_Log but missing from Master_Model could not be
selected in the History filter.

V20 merges models from Master_Model and actual records.

### 16. Image modal stale error handler
An old modal image error handler could survive between image opens.

V20 clears the handler on open/close.

### 17. Duplicate Admin checkbox reset
Removed duplicated `adminRemoveImage.checked = false`.

## Security note not automatically changed

`PUBLIC_IMAGE_ACCESS` is still `true` to preserve current image behavior.
That means newly uploaded Drive images may be shared as "Anyone with the link"
when the Google Workspace policy permits it.

For stricter production privacy, set it to `false`. The existing Apps Script
image fallback can still display images, but loading may be slower.

The Admin password is intentionally still `adminmin` because that is the
requested behavior. Backend actions still verify the password server-side.

## Verification performed

- `app.js` syntax checked with Node
- `Code.gs` JavaScript syntax checked with Node
- `config.json` parsed successfully
- duplicate HTML IDs checked
- JavaScript-referenced element IDs checked against HTML
- duplicate function declarations checked
- canonical parser scenarios tested
- legacy owner/Repair Time scenario tested
- invalid time validation tested

# Code Review V23.0 Production Ready

## Review Scope

- Data integrity
- Security
- Idempotency
- Multi-user behavior
- Auditability
- Performance
- Mobile/UX
- Failure Knowledge
- Images
- Excel/XLSX
- Backup
- Offline behavior

## Key Controls

### Data Integrity

- Repair_Log A:N preserved
- Repair ID duplicate check retained
- Normalize creates backup before rewrite
- Formula injection protection retained through `clean_()`
- Failure Summary incremental updates
- Full rebuild available for recovery

### Security

- No plaintext admin password in source
- No client-side password hash
- Salted backend SHA-256 in Script Properties
- Session token stored only in JS memory
- Session expiry 8h
- Login rate limit per username
- Domain/Workspace write access mode
- Admin sensitive reads use POST + Session Token, not token in JSONP URL

### Idempotency

- Cryptographically strong browser `opId`
- Atomic backend claim under ScriptLock
- Duplicate Request returns existing status
- Script Properties operation states capped/expired to protect quota

### Multi-user

ScriptLock protects critical mutations:

- Repair Save/Edit/Delete/Normalize
- Guide Save/Edit/Delete
- Failure Merge
- Backup

### Audit

Audit_Log records state-changing Admin/User events and backup/security activity.

### Performance

- Save Repair no longer rebuilds entire Failure Summary
- DOM History paginated
- Breakdown lists capped to Top 12
- Failure analytics scans current Repair dataset only when a Failure popup is opened

Known scaling note: Frontend still retrieves the complete Repair records dataset because Dashboard/Excel require all records. If Repair_Log grows into tens of thousands of rows, next optimization should be server-side History paging + lazy Dashboard dataset loading.

### Excel

- Local excel-engine module
- XML invalid-control sanitization
- Images embedded, not links
- Detailed Guide export supports structured fields and up to five image columns
- Dashboard export includes Top Failure, Timeline, Model Breakdown, Station Breakdown

## Compatibility

V23 Frontend requires V23 Apps Script.

Do not mix V23 Frontend with V22.2 Backend.

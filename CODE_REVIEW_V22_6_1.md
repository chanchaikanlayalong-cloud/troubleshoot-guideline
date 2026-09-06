# V22.6.1 Code Review

Reviewed source:
`Troubleshoot_Guideline_V22_6_Dashboard_Excel.zip`

## Fixed

1. Stale version message
   - UI reported Frontend V22.3.
   - Now uses `FRONTEND_VERSION` dynamically.

2. Dashboard web/export logic drift
   - KPI, Top Failure, Timeline were calculated twice.
   - Web rendering now reuses the same data helpers as Excel export.

3. Top Failure bar scale
   - Export max bar used 470 px inside a 650 px track.
   - Max bar now fills 650/650 like web 100%.

4. Top Failure chart compression
   - 20–99 failures could be squeezed to max 1000 px.
   - XLSX now preserves generated chart height.

5. Timeline aspect-ratio distortion
   - Wide ALL-mode chart could be rendered into a capped 1200 px width.
   - XLSX now uses actual canvas pixel dimensions.

6. Excel freeze pane
   - Dashboard used `ySplit=rankingStartRow`, potentially freezing dozens/hundreds of rows.
   - Now freezes only rows 1–4.

7. XLSX XML safety
   - Invalid XML 1.0 control characters could create a workbook repair warning.
   - Invalid control characters are removed before XML escaping.

## Validation
- Existing frontend named functions preserved: 143/143
- Existing backend named functions preserved: 57/57
- app.js syntax: PASS
- Code.gs syntax: PASS
- config.json: PASS
- JS → HTML ID references: PASS
- Code.gs SHA256: unchanged
- setup.gs SHA256: unchanged
- config.json SHA256: unchanged

Backend remains V22.2.

# Troubleshoot Guideline V21 — Dashboard Layout Review

## Source
Built directly from the uploaded `troubleshoot-guideline-main.zip`.

## Functional files preserved byte-for-byte
- `app.js` — SHA256 unchanged
- `Code.gs` — SHA256 unchanged
- `setup.gs` — SHA256 unchanged
- `config.json` — SHA256 unchanged

## Verification
- app.js lines: 1894 → 1894
- Code.gs lines: 1871 → 1871
- setup.gs lines: 122 → 122
- Frontend named functions: 79 → 79
- Backend named functions: 42 → 42
- `node --check app.js`: PASS
- `node --check Code.gs`: PASS
- `config.json`: valid JSON

## Files intentionally changed
1. `style.css`
   - Dashboard-only responsive layout overrides appended.
2. `index.html`
   - Added CSS layout classes to existing Dashboard labels.
   - Changed only the CSS cache query to `style.css?v=21-dashboard-layout-3`.

No Dashboard input, select option, button, KPI, chart, ranking table,
page, Admin function, repair function, image function, refresh function,
or backend function was removed.

## Layouts

### Desktop
- Filters in one compact row where space allows.
- KPI cards 4 across.
- Top Failure + Timeline side-by-side.
- Failure Ranking full width.

### Mobile portrait
- Filters in 2 columns:
  - Time view + selected date period
  - Model + Station
  - Top Failure count full row
- KPI 2×2.
- Top Failure, Timeline, Ranking each full width.
- Timeline and Ranking scroll inside their own cards, not the whole page.
- Very narrow phones (<=350px) automatically use one-column controls/KPI.

### Mobile landscape
- Filters 3 columns.
- KPI 4 across.
- Top Failure + Timeline side-by-side.
- Ranking full width.

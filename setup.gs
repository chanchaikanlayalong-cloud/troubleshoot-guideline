/**
 * setup.gs V22.2
 * ไม่เพิ่ม/ลบ Column
 * ตรวจ Sheet และแก้ Header A:N ให้ตรงมาตรฐาน
 */

function setupSheets() {
  const ss = SpreadsheetApp.openById(
    CONFIG.SPREADSHEET_ID
  );

  const repair = ss.getSheetByName(
    CONFIG.REPAIR_SHEET
  );

  if (!repair) {
    throw new Error(
      'ไม่พบชีต ' +
      CONFIG.REPAIR_SHEET
    );
  }

  ensureCanonicalHeader_(repair);

  let master = ss.getSheetByName(
    CONFIG.MODEL_SHEET
  );

  if (!master) {
    master = ss.insertSheet(
      CONFIG.MODEL_SHEET
    );

    master.getRange('A1')
      .setValue('Model');
  }

  master.getRange('A1')
    .setFontWeight('bold')
    .setBackground('#70AD47')
    .setFontColor('#FFFFFF');

  master.setFrozenRows(1);

  const guideSheet = ensureFailureGuideSheet_(ss);
  const summarySheet = ensureFailureSummarySheet_(ss);
  const summary = syncFailureSummary_();

  const folder = getImageFolder_();

  Logger.log('API Version: ' + API_VERSION);
  Logger.log('Repair_Log Header OK');
  Logger.log('Failure_Guide ready: ' + guideSheet.getName());
  Logger.log('Failure_Summary ready: ' + summarySheet.getName());
  Logger.log('Failure Summary rows: ' + summary.length);
  Logger.log('Image Folder URL: ' + folder.getUrl());
  Logger.log('Image Folder ID: ' + folder.getId());
  Logger.log('Setup completed successfully');
}


function showRepairImageFolder() {
  const folder = getImageFolder_();

  Logger.log(
    'Folder URL: ' +
    folder.getUrl()
  );

  Logger.log(
    'Folder ID: ' +
    folder.getId()
  );
}


/**
 * V22.2 Self Test
 * ไม่แก้ข้อมูลใน Sheet
 */
function runSelfTest() {
  const canonicalRow = [
    'ATS1-20260905-9999',
    '05/09/2026',
    '15:00:42',
    'ECD90020030',
    'ATS2',
    'symps',
    'solder',
    '15:06',
    '15:06',
    '',
    'MIN',
    '',
    '',
    ''
  ];

  const parsed = parseRepairRow_(
    canonicalRow,
    2
  );

  if (parsed.repairTime !== '0') {
    throw new Error(
      'Self Test Fail: Repair Time expected 0'
    );
  }

  if (parsed.repairBy !== 'MIN') {
    throw new Error(
      'Self Test Fail: repairBy expected MIN'
    );
  }

  if (recordToCanonicalRow_(parsed).length !== 14) {
    throw new Error(
      'Self Test Fail: Canonical row must have 14 columns'
    );
  }

  if (normalizeHHMM_('25:00') !== '') {
    throw new Error(
      'Self Test Fail: invalid HH:mm accepted'
    );
  }

  Logger.log('V22.2 Self Test: PASS');
}

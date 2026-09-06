/**
 * setup.gs V23.0 Production Ready
 * - ไม่ลบข้อมูลเดิม
 * - Repair_Log ยังใช้ Canonical A:N เดิม
 * - เพิ่ม Production sheets สำหรับ Knowledge / Audit / Master / Images
 * - Admin password เก็บเฉพาะ SHA-256 ใน Script Properties
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

  const guideSheet =
    ensureFailureGuideSheet_(ss);

  const guideImagesSheet =
    ensureFailureGuideImagesSheet_(ss);

  const summarySheet =
    ensureFailureSummarySheet_(ss);

  const failureMasterSheet =
    ensureFailureMasterSheet_(ss);

  const failureAliasSheet =
    ensureFailureAliasSheet_(ss);

  const auditSheet =
    ensureAuditSheet_(ss);

  const security =
    ensureAdminPasswordConfigured_();

  const props =
    PropertiesService.getScriptProperties();

  if (!props.getProperty('WRITE_ACCESS_MODE')) {
    props.setProperty(
      'WRITE_ACCESS_MODE',
      'OPEN'
    );

    Logger.log(
      'SECURITY WARNING: WRITE_ACCESS_MODE=OPEN. ' +
      'ใช้เพื่อ Upgrade/ทดสอบเท่านั้น. Production แนะนำ configureWorkspaceWriteAccess() ' +
      'หรือกำหนด WRITE_ACCESS_MODE=DOMAIN + ALLOWED_DOMAIN ใน Script Properties'
    );
  }

  const migratedImages =
    migrateLegacyGuideImages_();

  const summary =
    rebuildFailureSummary_();

  const folder =
    getImageFolder_();

  Logger.log('API Version: ' + API_VERSION);
  Logger.log('Repair_Log Header OK (A:N preserved)');
  Logger.log('Failure_Guide ready: ' + guideSheet.getName());
  Logger.log('Failure_Guide_Images ready: ' + guideImagesSheet.getName());
  Logger.log('Failure_Summary ready: ' + summarySheet.getName());
  Logger.log('Failure_Master ready: ' + failureMasterSheet.getName());
  Logger.log('Failure_Alias ready: ' + failureAliasSheet.getName());
  Logger.log('Audit_Log ready: ' + auditSheet.getName());
  Logger.log('Failure Summary rows: ' + summary.length);
  Logger.log('Legacy Guide Images migrated: ' + migratedImages);
  Logger.log('Image Folder URL: ' + folder.getUrl());
  Logger.log('Image Folder ID: ' + folder.getId());

  if (security.generated) {
    Logger.log('============================================================');
    Logger.log('IMPORTANT - INITIAL ADMIN PASSWORD: ' + security.password);
    Logger.log('เก็บ Password นี้ไว้ก่อนปิด Execution Log');
    Logger.log('ถ้าลืม ให้ Run resetAdminPassword() เพื่อสร้างใหม่');
    Logger.log('============================================================');
  } else {
    Logger.log('Admin Password: configured in Script Properties');
  }

  Logger.log('WRITE_ACCESS_MODE: ' + getWriteAccessMode_());
  Logger.log('ALLOWED_DOMAIN: ' + (getAllowedDomain_() || '(not set)'));
  Logger.log('Setup V23 completed successfully');
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
 * V23.0 Self Test
 * ไม่แก้ข้อมูล Repair_Log
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

  if (FAILURE_GUIDE_HEADERS.length !== 19) {
    throw new Error(
      'Self Test Fail: Failure_Guide headers must have 19 columns'
    );
  }

  if (normalizeFailureKey_(' AC   LED  FAIL ') !== 'ac led fail') {
    throw new Error(
      'Self Test Fail: Failure normalization'
    );
  }

  if (API_VERSION !== 'V23.0') {
    throw new Error(
      'Self Test Fail: API Version must be V23.0'
    );
  }

  Logger.log('V23.0 Self Test: PASS');
}

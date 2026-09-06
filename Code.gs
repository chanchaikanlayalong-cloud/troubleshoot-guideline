/**
 * ATS1 Repair API V23.0
 *
 * จุดสำคัญ:
 * - ข้อมูลใหม่บันทึกแบบ Canonical A:N เสมอ
 * - ข้อมูลเก่าที่เคย Shift อ่านทีละแถวจากรูปแบบข้อมูลจริง
 * - Admin แก้ไข Record แล้วจะ Normalize แถวนั้นเป็น A:N
 * - Admin มี Normalize All สำหรับจัดข้อมูลเก่าทั้งหมด
 * - ไม่เพิ่ม/ลบ Column ของ Sheet
 */

const CONFIG = {
  SPREADSHEET_ID: '1VAEBe8tEPCpaNVoYdru_hbwQ-XrPTrbalftafJqVwLU',
  REPAIR_SHEET: 'Repair_Log',
  MODEL_SHEET: 'Master_Model',
  FAILURE_GUIDE_SHEET: 'Failure_Guide',
  FAILURE_SUMMARY_SHEET: 'Failure_Summary',
  FAILURE_MASTER_SHEET: 'Failure_Master',
  FAILURE_ALIAS_SHEET: 'Failure_Alias',
  FAILURE_GUIDE_IMAGES_SHEET: 'Failure_Guide_Images',
  AUDIT_SHEET: 'Audit_Log',
  BACKUP_FOLDER_NAME: 'ATS1_Repair_Backups',
  TIMEZONE: 'Asia/Bangkok',
  DRIVE_FOLDER_ID: '',
  PUBLIC_IMAGE_ACCESS: true,
  ADMIN_SESSION_HOURS: 8
};

const API_VERSION = 'V23.0';

const CANONICAL_HEADERS = [
  'Repair ID',            // A
  'วันที่',               // B
  'เวลา',                 // C
  'Model',                // D
  'Station',              // E
  'Fail',                 // F
  'แก้ปัญหายังไง',       // G
  'เริ่มซ่อม',            // H
  'ซ่อมเสร็จ',            // I
  'Repair Time (นาที)',   // J
  'คนทำ',                 // K
  'Image File ID',        // L
  'Image URL',            // M
  'Image Name'            // N
];

const FAILURE_GUIDE_HEADERS = [
  'Guide ID',                         // A
  'Failure Key',                      // B
  'Failure / Symptom',                // C
  'Repair Step / วิธีแก้ไขแบบละเอียด', // D
  'ผู้เพิ่ม',                          // E
  'วันที่',                            // F
  'เวลา',                              // G
  'Image File ID',                    // H legacy/main image
  'Image URL',                        // I
  'Image Name',                       // J
  'Updated Date',                     // K
  'Updated Time',                     // L
  'Root Cause',                       // M
  'Check Point',                      // N
  'Expected Value / Spec',            // O
  'Verification',                     // P
  'Tool / Equipment',                 // Q
  'Related Model',                    // R
  'Related Station'                   // S
];

const FAILURE_GUIDE_IMAGE_HEADERS = [
  'Image ID',
  'Guide ID',
  'Image File ID',
  'Image URL',
  'Image Name',
  'Caption',
  'Sort Order',
  'Added At'
];

const FAILURE_MASTER_HEADERS = [
  'Canonical Failure',
  'Failure Key',
  'Status',
  'Created At',
  'Updated At'
];

const FAILURE_ALIAS_HEADERS = [
  'Alias',
  'Alias Key',
  'Canonical Failure',
  'Canonical Key',
  'Created At'
];

const AUDIT_HEADERS = [
  'Timestamp',
  'Actor',
  'Action',
  'Entity Type',
  'Entity ID',
  'Before JSON',
  'After JSON',
  'Source'
];

const FAILURE_SUMMARY_HEADERS = [
  'Failure Key',               // A
  'Failure / Symptom',         // B
  'Fail Count',                // C
  'Last Seen',                 // D
  'Updated At'                 // E
];

/*
 * V22.2 Repair History display contract.
 * "image" uses imageFileId / imageUrl / imageName from records API.
 */
const HISTORY_DISPLAY_ORDER = [
  'failure',
  'repairAction',
  'image',
  'model',
  'station',
  'startRepair',
  'finishRepair',
  'repairTime',
  'repairBy',
  'repairId'
];

const REPAIR_RECORD_API_FIELDS = [
  'sheetRow',
  'repairId',
  'date',
  'time',
  'model',
  'station',
  'failure',
  'repairAction',
  'startRepair',
  'finishRepair',
  'repairTime',
  'repairBy',
  'imageFileId',
  'imageUrl',
  'imageName'
];


/* =========================================================
   WEB API
========================================================= */

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = String(p.action || 'records');
    const callback = safeCallback_(p.callback || '');

    let data;

    if (action === 'models') {
      data = { ok: true, models: getModels_() };

    } else if (action === 'records') {
      data = { ok: true, records: getRecords_() };

    } else if (action === 'failureDetail') {
      data = getFailureDetail_(p.failure);

    } else if (action === 'failureGuides') {
      data = {
        ok: true,
        guides: getFailureGuides_(p.failure || '')
      };

    } else if (action === 'failureSummary') {
      data = {
        ok: true,
        failures: buildFailureSummary_()
      };

    } else if (action === 'failureMasters') {
      data = {
        ok: false,
        error: 'V23: Failure Master requires Admin POST session'
      };

    } else if (action === 'imageData') {
      data = getImageData_(p.fileId);

    } else if (action === 'adminOpStatus') {
      data = getAdminOperationStatus_(p.opId);

    } else if (action === 'adminAudit') {
      data = {
        ok: false,
        error: 'V23: Audit Log requires Admin POST session'
      };

    } else if (action === 'backupStatus') {
      data = {
        ok: false,
        error: 'V23: Backup status requires Admin POST session'
      };

    } else if (action === 'health') {
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sh = ss.getSheetByName(CONFIG.REPAIR_SHEET);
      const folderInfo = getExistingImageFolderInfo_();

      data = {
        ok: true,
        apiVersion: API_VERSION,
        message: 'ATS1 Repair API ' + API_VERSION + ' is running',
        rowCount: sh ? Math.max(0, sh.getLastRow() - 1) : 0,
        failureGuideSheet: CONFIG.FAILURE_GUIDE_SHEET,
        failureSummarySheet: CONFIG.FAILURE_SUMMARY_SHEET,
        failureMasterSheet: CONFIG.FAILURE_MASTER_SHEET,
        failureAliasSheet: CONFIG.FAILURE_ALIAS_SHEET,
        failureGuideImagesSheet: CONFIG.FAILURE_GUIDE_IMAGES_SHEET,
        auditSheet: CONFIG.AUDIT_SHEET,
        historyDisplayOrder: HISTORY_DISPLAY_ORDER,
        repairRecordApiFields: REPAIR_RECORD_API_FIELDS,
        imageFolderReady: folderInfo.ready,
        imageFolderId: folderInfo.id,
        imageFolderUrl: folderInfo.url,
        security: getSecurityHealth_()
      };

    } else {
      data = { ok: false, error: 'Unknown action' };
    }

    return output_(data, callback);

  } catch (err) {
    return output_(
      {
        ok: false,
        error: String(err.message || err),
        apiVersion: API_VERSION
      },
      safeCallback_((e && e.parameter && e.parameter.callback) || '')
    );
  }
}


function doPost(e) {
  const p = (e && e.parameter) || {};
  const action = String(p.action || '');
  const opId = String(p.opId || '').trim();

  const idempotentActions = [
    'save',
    'saveFailureGuide',
    'adminLogin',
    'adminLogout',
    'adminUpdate',
    'adminDelete',
    'adminGuideUpdate',
    'adminGuideDelete',
    'adminNormalizeAll',
    'adminFailureMerge',
    'adminCreateBackup',
    'adminInstallBackupTrigger',
    'adminGetAudit',
    'adminGetFailureMasters',
    'adminGetBackupStatus'
  ];

  try {
    if (opId && idempotentActions.includes(action)) {
      const claim = claimOperation_(opId, action);

      if (!claim.claimed) {
        return json_(
          claim.result || {
            ok: true,
            pending: true,
            opId: opId,
            apiVersion: API_VERSION
          }
        );
      }
    }

    let result;

    if (action === 'adminLogin') {
      result = {
        ok: true,
        ...adminLogin_(p.username, p.password)
      };

    } else if (action === 'adminLogout') {
      const session = verifyAdminSession_(p.adminSessionToken);
      invalidateAdminSession_(p.adminSessionToken);

      appendAudit_(
        session.user,
        'ADMIN_LOGOUT',
        'SESSION',
        '',
        null,
        null,
        'Admin'
      );

      result = {
        ok: true,
        loggedOut: true,
        user: session.user
      };

    } else if (action === 'save') {
      const access = verifyWriteAccess_(p);

      const required = [
        'model',
        'station',
        'failure',
        'repairAction',
        'startRepair',
        'finishRepair',
        'repairBy'
      ];

      required.forEach(key => {
        if (!String(p[key] || '').trim()) {
          throw new Error('Missing field: ' + key);
        }
      });

      result = {
        ok: true,
        ...saveRecord_(p, access.email)
      };

    } else if (action === 'saveFailureGuide') {
      const access = verifyWriteAccess_(p);

      result = {
        ok: true,
        ...saveFailureGuide_(p, access.email)
      };

    } else if (
      [
        'adminUpdate',
        'adminDelete',
        'adminGuideUpdate',
        'adminGuideDelete',
        'adminNormalizeAll',
        'adminFailureMerge',
        'adminCreateBackup',
        'adminInstallBackupTrigger',
        'adminGetAudit',
        'adminGetFailureMasters',
        'adminGetBackupStatus'
      ].includes(action)
    ) {
      const session = verifyAdminSession_(p.adminSessionToken);

      if (action === 'adminUpdate') {
        result = { ok: true, ...adminUpdateRecord_(p, session.user) };

      } else if (action === 'adminDelete') {
        result = { ok: true, ...adminDeleteRecord_(p, session.user) };

      } else if (action === 'adminGuideUpdate') {
        result = { ok: true, ...adminUpdateFailureGuide_(p, session.user) };

      } else if (action === 'adminGuideDelete') {
        result = { ok: true, ...adminDeleteFailureGuide_(p, session.user) };

      } else if (action === 'adminNormalizeAll') {
        result = { ok: true, ...adminNormalizeAll_(session.user) };

      } else if (action === 'adminFailureMerge') {
        result = {
          ok: true,
          ...adminMergeFailure_(p.source, p.target, session.user)
        };

      } else if (action === 'adminCreateBackup') {
        result = {
          ok: true,
          ...createProductionBackup_('MANUAL', session.user)
        };

      } else if (action === 'adminInstallBackupTrigger') {
        result = {
          ok: true,
          ...installDailyBackupTrigger_(session.user)
        };

      } else if (action === 'adminGetAudit') {
        result = {
          ok: true,
          audit: getAuditLog_(p.limit || 50).map(item => ({
            timestamp: item.timestamp,
            actor: item.actor,
            action: item.action,
            entityType: item.entityType,
            entityId: item.entityId,
            source: item.source
          })),
          sessionUser: session.user
        };

      } else if (action === 'adminGetFailureMasters') {
        result = {
          ok: true,
          ...getFailureMasters_()
        };

      } else if (action === 'adminGetBackupStatus') {
        result = {
          ok: true,
          ...getBackupStatus_()
        };
      }

    } else {
      throw new Error('Unknown action: ' + action);
    }

    if (opId) {
      saveAdminOperationStatus_(opId, result);
    }

    return json_(result);

  } catch (err) {
    const result = {
      ok: false,
      error: String(err.message || err),
      apiVersion: API_VERSION
    };

    if (opId && idempotentActions.includes(action)) {
      try {
        saveAdminOperationStatus_(opId, result);
      } catch (statusErr) {
        console.log(statusErr);
      }
    }

    return json_(result);
  }
}


/* =========================================================
   CANONICAL SHEET
========================================================= */

function ensureCanonicalHeader_(sh) {
  // แก้เฉพาะชื่อ Header A:N ไม่เพิ่ม/ลบ Column
  if (sh.getMaxColumns() < CANONICAL_HEADERS.length) {
    throw new Error(
      'Repair_Log ต้องมีอย่างน้อย ' +
      CANONICAL_HEADERS.length +
      ' columns'
    );
  }

  sh.getRange(1, 1, 1, CANONICAL_HEADERS.length)
    .setValues([CANONICAL_HEADERS])
    .setFontWeight('bold')
    .setBackground('#1F4E78')
    .setFontColor('#FFFFFF');

  sh.setFrozenRows(1);
}


function recordToCanonicalRow_(record) {
  const repairTime = normalizeRepairTimeCell_(record.repairTime);

  return [
    clean_(record.repairId),
    clean_(record.date),
    clean_(record.time),
    clean_(record.model),
    clean_(record.station),
    clean_(record.failure),
    clean_(record.repairAction),
    clean_(record.startRepair),
    clean_(record.finishRepair),
    repairTime,
    clean_(record.repairBy),
    clean_(record.imageFileId),
    clean_(record.imageUrl),
    clean_(record.imageName)
  ];
}


function normalizeRepairTimeCell_(value) {
  const text = String(value ?? '').trim();

  if (!text) return '';

  if (!isNonNegativeNumber_(text)) {
    throw new Error(
      'Repair Time ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป'
    );
  }

  return Number(text);
}


/* =========================================================
   ROW-SPECIFIC OLD DATA PARSER
========================================================= */

function parseRepairRow_(row, sheetRow) {
  const values = row.map(v => String(v || '').trim());

  const record = {
    sheetRow: sheetRow,

    // A:E เป็นส่วนที่คงที่ที่สุดจากทุก Version
    repairId: values[0] || '',
    date: values[1] || '',
    time: values[2] || '',
    model: values[3] || '',
    station: values[4] || '',

    failure: '',
    repairAction: '',
    startRepair: '',
    finishRepair: '',
    repairTime: '',
    repairBy: '',

    imageFileId: '',
    imageUrl: '',
    imageName: ''
  };


  /*
   * V20:
   * ถ้าแถวอยู่ในรูปแบบมาตรฐาน A:N แล้ว ให้อ่านตรงตาม Column ก่อน
   * ไม่ใช้ heuristic เพื่อรองรับชื่อคนที่เป็นตัวเลข และลดโอกาสอ่านผิดช่อง
   */
  if (looksCanonicalRepairRow_(values)) {
    return parseCanonicalRepairRow_(values, sheetRow);
  }

  // -----------------------------------------
  // 1) IMAGE
  // -----------------------------------------

  const imageUrlIndex = values.findIndex(v =>
    /drive\.google\.com/i.test(v) &&
    (
      /thumbnail/i.test(v) ||
      /\/file\/d\//i.test(v) ||
      /[?&]id=/i.test(v)
    )
  );

  let contentEnd = values.length - 1;

  if (imageUrlIndex >= 0) {
    record.imageUrl = values[imageUrlIndex];

    // ปกติ File ID อยู่ช่องก่อน URL
    if (
      imageUrlIndex > 0 &&
      isDriveFileId_(values[imageUrlIndex - 1])
    ) {
      record.imageFileId = values[imageUrlIndex - 1];
    } else {
      record.imageFileId = extractDriveId_(record.imageUrl);
    }

    // Image Name ปกติอยู่ช่องหลัง URL
    if (
      imageUrlIndex + 1 < values.length &&
      values[imageUrlIndex + 1]
    ) {
      record.imageName = values[imageUrlIndex + 1];
    }

    contentEnd = imageUrlIndex - 2;

  } else {
    // ไม่มี URL: ลองหา File ID จากด้านขวา
    for (let i = values.length - 1; i >= 5; i--) {
      if (isDriveFileId_(values[i])) {
        record.imageFileId = values[i];

        if (i + 1 < values.length) {
          record.imageName = values[i + 1] || '';
        }

        contentEnd = i - 1;
        break;
      }
    }
  }

  if (record.imageFileId && !record.imageUrl) {
    record.imageUrl = buildImageUrl_(record.imageFileId, '');
  }

  // -----------------------------------------
  // 2) START / FINISH
  // หา Time HH:MM หลัง Station
  // ใช้ 2 ตัวท้ายสุดก่อน Repair Time/Owner
  // -----------------------------------------

  const timeIndexes = [];

  for (let i = 5; i <= contentEnd; i++) {
    if (/^\d{1,2}:\d{2}$/.test(values[i])) {
      timeIndexes.push(i);
    }
  }

  if (timeIndexes.length >= 2) {
    const startIndex = timeIndexes[timeIndexes.length - 2];
    const finishIndex = timeIndexes[timeIndexes.length - 1];

    record.startRepair = normalizeHHMM_(values[startIndex]);
    record.finishRepair = normalizeHHMM_(values[finishIndex]);

    // -----------------------------------------
    // 3) REPAIR ACTION / FAILURE
    // -----------------------------------------

    const beforeStart = [];

    for (let i = 5; i < startIndex; i++) {
      if (values[i]) beforeStart.push(i);
    }

    if (beforeStart.length >= 1) {
      const actionIndex = beforeStart[beforeStart.length - 1];
      record.repairAction = values[actionIndex];

      if (beforeStart.length >= 2) {
        const failureIndex = beforeStart[beforeStart.length - 2];
        record.failure = values[failureIndex];
      }
    }

    // -----------------------------------------
    // 4) REPAIR TIME / OWNER
    // หลัง finish → repairTime → owner
    // -----------------------------------------

    const afterFinish = [];

    for (let i = finishIndex + 1; i <= contentEnd; i++) {
      if (values[i]) {
        afterFinish.push({
          index: i,
          value: values[i]
        });
      }
    }

    /*
     * V20 legacy parser fix:
     *
     * เดิม Backend ถือว่า:
     *   ค่าที่ไม่ว่างตัวแรกหลัง "ซ่อมเสร็จ" = Repair Time
     *   ค่าที่ไม่ว่างตัวที่สอง = คนทำ
     *
     * ปัญหา:
     * ถ้า Repair Time ใน Sheet ว่าง แต่ K "คนทำ" มีค่า เช่น MIN
     * Backend จะอ่าน MIN เป็น Repair Time และทำให้ repairBy ว่าง
     *
     * วิธีใหม่:
     * - Repair Time ต้องเป็นตัวเลข >= 0 เท่านั้น
     * - คนทำเลือกจากค่าที่ไม่ใช่ตัวเลข
     * - ถ้า Repair Time ไม่มี ให้คำนวณใหม่จากเริ่มซ่อม/ซ่อมเสร็จ
     */

    const repairTimeCandidate = afterFinish.find(item =>
      isNonNegativeNumber_(item.value)
    );

    if (repairTimeCandidate) {
      record.repairTime = repairTimeCandidate.value;
    }

    const ownerCandidate = afterFinish.find(item =>
      !isNonNegativeNumber_(item.value)
    );

    if (ownerCandidate) {
      record.repairBy = ownerCandidate.value;
    }

  } else {
    // ถ้าเป็น Row ที่เสียมาก ใช้ Canonical F:N เป็น fallback
    record.failure = values[5] || '';
    record.repairAction = values[6] || '';
    record.startRepair = normalizeHHMM_(values[7] || '');
    record.finishRepair = normalizeHHMM_(values[8] || '');
    record.repairTime = values[9] || '';
    record.repairBy = values[10] || '';

    if (!record.imageFileId && isDriveFileId_(values[11])) {
      record.imageFileId = values[11];
    }

    if (!record.imageUrl && /drive\.google\.com/i.test(values[12] || '')) {
      record.imageUrl = values[12];
    }

    if (!record.imageName) {
      record.imageName = values[13] || '';
    }
  }

  // Repair Time ถ้าเป็นค่าที่เสีย/ว่าง แต่เวลาเริ่มเสร็จมี
  if (
    record.startRepair &&
    record.finishRepair &&
    !isNonNegativeNumber_(record.repairTime)
  ) {
    record.repairTime = String(
      calculateRepairMinutes_(
        record.startRepair,
        record.finishRepair
      )
    );
  }

  /*
   * V20 fallback:
   * ถ้าคนทำยังว่าง และ canonical K มีข้อความที่ไม่ใช่ตัวเลข
   * ให้ใช้ K เป็นคนทำ
   */
  if (
    !record.repairBy &&
    values.length > 10 &&
    values[10] &&
    !isNonNegativeNumber_(values[10])
  ) {
    record.repairBy = values[10];
  }

  // URL สร้างจาก ID เสมอเพื่อให้ Preview สม่ำเสมอ
  if (record.imageFileId) {
    record.imageUrl = buildImageUrl_(record.imageFileId, record.imageUrl);
  }

  return record;
}



function looksCanonicalRepairRow_(values) {
  if (values.length < CANONICAL_HEADERS.length) return false;

  const repairId = String(values[0] || '').trim();
  const start = String(values[7] || '').trim();
  const finish = String(values[8] || '').trim();
  const repairTime = String(values[9] || '').trim();
  const fileId = String(values[11] || '').trim();
  const imageUrl = String(values[12] || '').trim();

  if (!repairId) return false;

  const timesLookCanonical =
    (!start && !finish) ||
    (Boolean(normalizeHHMM_(start)) && Boolean(normalizeHHMM_(finish)));

  const repairTimeLooksCanonical =
    !repairTime || isNonNegativeNumber_(repairTime);

  const imageLooksCanonical =
    (!fileId && !imageUrl) ||
    (isDriveFileId_(fileId) || /drive\.google\.com/i.test(imageUrl));

  return (
    timesLookCanonical &&
    repairTimeLooksCanonical &&
    imageLooksCanonical
  );
}


function parseCanonicalRepairRow_(values, sheetRow) {
  const startRepair = normalizeHHMM_(values[7]);
  const finishRepair = normalizeHHMM_(values[8]);

  let repairTime = String(values[9] || '').trim();

  if (
    startRepair &&
    finishRepair &&
    !isNonNegativeNumber_(repairTime)
  ) {
    repairTime = String(
      calculateRepairMinutes_(
        startRepair,
        finishRepair
      )
    );
  }

  const imageFileId =
    isDriveFileId_(values[11])
      ? String(values[11]).trim()
      : extractDriveId_(values[12]);

  return {
    sheetRow: sheetRow,
    repairId: String(values[0] || '').trim(),
    date: String(values[1] || '').trim(),
    time: String(values[2] || '').trim(),
    model: String(values[3] || '').trim(),
    station: String(values[4] || '').trim(),
    failure: String(values[5] || '').trim(),
    repairAction: String(values[6] || '').trim(),
    startRepair: startRepair,
    finishRepair: finishRepair,
    repairTime: repairTime,
    repairBy: String(values[10] || '').trim(),
    imageFileId: imageFileId,
    imageUrl: imageFileId
      ? buildImageUrl_(imageFileId, values[12])
      : String(values[12] || '').trim(),
    imageName: String(values[13] || '').trim()
  };
}


function normalizeHHMM_(value) {
  const text = String(value || '').trim();
  const m = text.match(/^(\d{1,2}):(\d{2})$/);

  if (!m) return '';

  const hour = Number(m[1]);
  const minute = Number(m[2]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 || hour > 23 ||
    minute < 0 || minute > 59
  ) {
    return '';
  }

  return (
    String(hour).padStart(2, '0') +
    ':' +
    String(minute).padStart(2, '0')
  );
}



function normalizeDateText_(value) {
  const text = String(value || '').trim();
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!m) return '';

  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);

  if (year > 2400) {
    year -= 543;
  }

  const date = new Date(year, month - 1, day, 12, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return '';
  }

  const outputYear =
    Number(m[3]) > 2400
      ? year + 543
      : year;

  return (
    String(day).padStart(2, '0') +
    '/' +
    String(month).padStart(2, '0') +
    '/' +
    String(outputYear).padStart(4, '0')
  );
}


function normalizeHHMMSS_(value) {
  const text = String(value || '').trim();
  const m = text.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);

  if (!m) return '';

  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const second = Number(m[3]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    hour < 0 || hour > 23 ||
    minute < 0 || minute > 59 ||
    second < 0 || second > 59
  ) {
    return '';
  }

  return [
    String(hour).padStart(2, '0'),
    String(minute).padStart(2, '0'),
    String(second).padStart(2, '0')
  ].join(':');
}


function requireText_(value, label, maxLength) {
  const text = String(value || '').trim();

  if (!text) {
    throw new Error(label + ' ห้ามว่าง');
  }

  if (text.length > maxLength) {
    throw new Error(
      label + ' ยาวเกิน ' + maxLength + ' ตัวอักษร'
    );
  }

  return text;
}


function isNonNegativeNumber_(value) {
  const text = String(value || '').trim();

  if (!/^\d+(?:\.\d+)?$/.test(text)) return false;

  const n = Number(text);
  return Number.isFinite(n) && n >= 0;
}


function isDriveFileId_(value) {
  return /^[A-Za-z0-9_-]{10,}$/.test(
    String(value || '').trim()
  );
}


function extractDriveId_(value) {
  const text = String(value || '').trim();

  const patterns = [
    /\/file\/d\/([A-Za-z0-9_-]{10,})/i,
    /[?&]id=([A-Za-z0-9_-]{10,})/i,
    /\/thumbnail\?id=([A-Za-z0-9_-]{10,})/i
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);

    if (m && m[1]) return m[1];
  }

  return '';
}


/* =========================================================
   RECORDS
========================================================= */

function getRecords_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CONFIG.REPAIR_SHEET);

  if (!sh) {
    throw new Error('ไม่พบชีต ' + CONFIG.REPAIR_SHEET);
  }

  const lastRow = sh.getLastRow();

  if (lastRow < 2) return [];

  const lastCol = Math.max(
    sh.getLastColumn(),
    CANONICAL_HEADERS.length
  );

  const rows = sh.getRange(
    2,
    1,
    lastRow - 1,
    lastCol
  ).getDisplayValues();

  return rows
    .map((row, index) =>
      parseRepairRow_(row, index + 2)
    )
    .reverse();
}


/* =========================================================
   SAVE NEW RECORD
========================================================= */

function saveRecord_(p, actorEmail) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CONFIG.REPAIR_SHEET);

  if (!sh) {
    throw new Error('ไม่พบชีต ' + CONFIG.REPAIR_SHEET);
  }

  ensureCanonicalHeader_(sh);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  let image = {
    fileId: '',
    url: '',
    name: ''
  };

  try {
    const now = new Date();
    const repairId = createRepairId_(sh, now);

    const dateText = Utilities.formatDate(
      now,
      CONFIG.TIMEZONE,
      'dd/MM/yyyy'
    );

    const timeText = Utilities.formatDate(
      now,
      CONFIG.TIMEZONE,
      'HH:mm:ss'
    );

    const startRepair = normalizeHHMM_(p.startRepair);
    const finishRepair = normalizeHHMM_(p.finishRepair);

    if (!startRepair || !finishRepair) {
      throw new Error('เวลาเริ่มซ่อมหรือซ่อมเสร็จไม่ถูกต้อง');
    }

    const model = requireText_(p.model, 'Model', 120);
    const station = requireText_(p.station, 'Station', 120);
    const failure = ensureFailureMasterEntry_(
      requireText_(p.failure, 'Failure / Symptom', 1500)
    );
    const repairAction = requireText_(p.repairAction, 'Repair Action', 5000);
    const repairBy = requireText_(p.repairBy, 'คนทำ', 120);

    image = saveImageIfProvided_(repairId, p);

    const record = {
      repairId: repairId,
      date: dateText,
      time: timeText,
      model: model,
      station: station,
      failure: failure,
      repairAction: repairAction,
      startRepair: startRepair,
      finishRepair: finishRepair,
      repairTime: calculateRepairMinutes_(startRepair, finishRepair),
      repairBy: repairBy,
      imageFileId: image.fileId,
      imageUrl: image.url,
      imageName: image.name
    };

    sh.appendRow(recordToCanonicalRow_(record));
    addModelIfNew_(ss, model);
    SpreadsheetApp.flush();

    incrementFailureSummary_(
      failure,
      1,
      [dateText, timeText].join(' ')
    );

    appendAudit_(
      actorEmail || repairBy || 'unknown',
      'CREATE_REPAIR',
      'REPAIR',
      repairId,
      null,
      record,
      'User'
    );

    return {
      repairId: repairId,
      imageFileId: image.fileId || ''
    };

  } catch (err) {
    if (image.fileId) {
      trashRepairImageSafely_(image.fileId);
    }

    throw err;

  } finally {
    lock.releaseLock();
  }
}

function createRepairId_(sh, now) {
  const ymd = Utilities.formatDate(
    now,
    CONFIG.TIMEZONE,
    'yyyyMMdd'
  );

  const prefix = 'ATS1-' + ymd + '-';
  const lastRow = sh.getLastRow();

  let maxSeq = 0;

  if (lastRow >= 2) {
    const ids = sh.getRange(
      2,
      1,
      lastRow - 1,
      1
    ).getDisplayValues().flat();

    ids.forEach(id => {
      const text = String(id || '').trim();

      if (text.startsWith(prefix)) {
        const n = parseInt(
          text.slice(prefix.length),
          10
        );

        if (Number.isFinite(n)) {
          maxSeq = Math.max(maxSeq, n);
        }
      }
    });
  }

  return (
    prefix +
    String(maxSeq + 1).padStart(4, '0')
  );
}


/* =========================================================
   ADMIN
========================================================= */

function sha256Hex_(value) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  );

  return digest
    .map(byte => {
      const n = byte < 0 ? byte + 256 : byte;
      return n.toString(16).padStart(2, '0');
    })
    .join('');
}


function secureToken_() {
  const raw = [
    Utilities.getUuid(),
    Utilities.getUuid(),
    Date.now(),
    Math.random()
  ].join('|');

  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      raw,
      Utilities.Charset.UTF_8
    )
  ).replace(/=+$/g, '');
}


function adminPasswordProperty_() {
  return 'ADMIN_PASSWORD_SHA256';
}


function adminPasswordSaltProperty_() {
  return 'ADMIN_PASSWORD_SALT';
}


function passwordHash_(passwordValue, saltValue) {
  return sha256Hex_(
    String(saltValue || '') +
    '|' +
    String(passwordValue || '')
  );
}


function ensureAdminPasswordConfigured_() {
  const props = PropertiesService.getScriptProperties();
  let hash = props.getProperty(adminPasswordProperty_());
  let salt = props.getProperty(adminPasswordSaltProperty_());

  if (hash && salt) {
    return { configured: true, generated: false };
  }

  const password =
    'TE-' +
    Utilities.getUuid()
      .replace(/-/g, '')
      .slice(0, 12);

  salt = secureToken_().slice(0, 32);
  hash = passwordHash_(password, salt);

  props.setProperty(adminPasswordSaltProperty_(), salt);
  props.setProperty(adminPasswordProperty_(), hash);

  Logger.log('IMPORTANT - Initial Admin Password: ' + password);
  Logger.log('Password plaintext is NOT stored in source; salted SHA-256 is in Script Properties.');

  return {
    configured: true,
    generated: true,
    password: password
  };
}


function resetAdminPassword() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(adminPasswordProperty_());
  props.deleteProperty(adminPasswordSaltProperty_());

  const result = ensureAdminPasswordConfigured_();
  Logger.log('New Admin Password: ' + result.password);

  return result;
}


// Backward-compatible helper. V23 UI does not store or validate password client-side.
function verifyAdminPassword_(password) {
  ensureAdminPasswordConfigured_();

  const props = PropertiesService.getScriptProperties();
  const expected = props.getProperty(adminPasswordProperty_());
  const salt = props.getProperty(adminPasswordSaltProperty_());

  if (!expected || !salt || passwordHash_(password, salt) !== expected) {
    throw new Error('Admin password ไม่ถูกต้อง');
  }

  return true;
}


function adminSessionKey_(token) {
  return 'ADMIN_SESSION_' + sha256Hex_(token);
}


function adminLoginGuardKey_(usernameValue) {
  return (
    'ADMIN_LOGIN_GUARD_' +
    sha256Hex_(
      String(usernameValue || '')
        .trim()
        .toLowerCase()
    ).slice(0, 24)
  );
}


function getAdminLoginGuard_(usernameValue) {
  const props = PropertiesService.getScriptProperties();
  const key = adminLoginGuardKey_(usernameValue);
  const text = props.getProperty(key);

  if (!text) {
    return { attempts: 0, firstAt: 0, lockedUntil: 0 };
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    props.deleteProperty(key);
    return { attempts: 0, firstAt: 0, lockedUntil: 0 };
  }
}


function assertAdminLoginAllowed_(usernameValue) {
  const guard = getAdminLoginGuard_(usernameValue);
  const now = Date.now();

  if (Number(guard.lockedUntil || 0) > now) {
    const seconds = Math.ceil((guard.lockedUntil - now) / 1000);
    throw new Error(
      'Admin Login ถูกพักชั่วคราวจากการลองรหัสหลายครั้ง กรุณารอ ' +
      seconds +
      ' วินาที'
    );
  }
}


function recordAdminLoginFailure_(usernameValue) {
  const props = PropertiesService.getScriptProperties();
  const key = adminLoginGuardKey_(usernameValue);
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const lockMs = 10 * 60 * 1000;
  let guard = getAdminLoginGuard_(usernameValue);

  if (!guard.firstAt || now - Number(guard.firstAt) > windowMs) {
    guard = { attempts: 0, firstAt: now, lockedUntil: 0 };
  }

  guard.attempts = Number(guard.attempts || 0) + 1;

  if (guard.attempts >= 5) {
    guard.lockedUntil = now + lockMs;
  }

  props.setProperty(key, JSON.stringify(guard));
}


function clearAdminLoginGuard_(usernameValue) {
  PropertiesService
    .getScriptProperties()
    .deleteProperty(adminLoginGuardKey_(usernameValue));
}


function cleanupAdminSessions_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const now = Date.now();

  Object.keys(all).forEach(key => {
    if (!key.startsWith('ADMIN_SESSION_')) return;

    try {
      const session = JSON.parse(all[key]);

      if (!session.expiresAt || Number(session.expiresAt) <= now) {
        props.deleteProperty(key);
      }
    } catch (err) {
      props.deleteProperty(key);
    }
  });
}


function adminLogin_(usernameValue, passwordValue) {
  ensureAdminPasswordConfigured_();
  cleanupAdminSessions_();

  const username = requireText_(usernameValue, 'User', 120);
  assertAdminLoginAllowed_(username);

  try {
    verifyAdminPassword_(passwordValue);
  } catch (err) {
    recordAdminLoginFailure_(username);

    appendAudit_(
      username,
      'ADMIN_LOGIN_FAILED',
      'SESSION',
      '',
      null,
      null,
      'Admin'
    );

    throw err;
  }

  clearAdminLoginGuard_(username);

  const token = secureToken_();
  const now = Date.now();

  const session = {
    user: username,
    createdAt: now,
    expiresAt:
      now +
      CONFIG.ADMIN_SESSION_HOURS * 60 * 60 * 1000
  };

  PropertiesService
    .getScriptProperties()
    .setProperty(
      adminSessionKey_(token),
      JSON.stringify(session)
    );

  appendAudit_(
    username,
    'ADMIN_LOGIN',
    'SESSION',
    '',
    null,
    { expiresAt: new Date(session.expiresAt).toISOString() },
    'Admin'
  );

  return {
    sessionToken: token,
    sessionUser: username,
    expiresAt: session.expiresAt
  };
}


function verifyAdminSession_(tokenValue) {
  const token = String(tokenValue || '').trim();

  if (!token) {
    throw new Error('Admin Session หมดอายุหรือยังไม่ได้ Login');
  }

  cleanupAdminSessions_();

  const props = PropertiesService.getScriptProperties();
  const key = adminSessionKey_(token);
  const text = props.getProperty(key);

  if (!text) {
    throw new Error('Admin Session ไม่ถูกต้องหรือหมดอายุ');
  }

  const session = JSON.parse(text);

  if (Number(session.expiresAt || 0) <= Date.now()) {
    props.deleteProperty(key);
    throw new Error('Admin Session หมดอายุ กรุณา Login ใหม่');
  }

  return session;
}


function invalidateAdminSession_(tokenValue) {
  const token = String(tokenValue || '').trim();
  if (!token) return;

  PropertiesService
    .getScriptProperties()
    .deleteProperty(adminSessionKey_(token));
}


function getWriteAccessMode_() {
  return String(
    PropertiesService
      .getScriptProperties()
      .getProperty('WRITE_ACCESS_MODE') ||
    'OPEN'
  ).trim().toUpperCase();
}


function getAllowedDomain_() {
  return String(
    PropertiesService
      .getScriptProperties()
      .getProperty('ALLOWED_DOMAIN') ||
    ''
  )
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
}


function configureWorkspaceWriteAccess() {
  const email = String(
    Session.getActiveUser().getEmail() || ''
  ).trim();

  if (!email || !email.includes('@')) {
    throw new Error(
      'ไม่สามารถอ่าน Google Workspace email ได้ กรุณาตั้ง Script Properties WRITE_ACCESS_MODE=DOMAIN และ ALLOWED_DOMAIN เอง'
    );
  }

  const domain = email.split('@').pop().toLowerCase();
  const props = PropertiesService.getScriptProperties();

  props.setProperty('WRITE_ACCESS_MODE', 'DOMAIN');
  props.setProperty('ALLOWED_DOMAIN', domain);

  Logger.log('WRITE_ACCESS_MODE = DOMAIN');
  Logger.log('ALLOWED_DOMAIN = ' + domain);

  return { mode: 'DOMAIN', domain: domain };
}


function configureOpenWriteAccess() {
  PropertiesService
    .getScriptProperties()
    .setProperty('WRITE_ACCESS_MODE', 'OPEN');

  Logger.log('WARNING: WRITE_ACCESS_MODE = OPEN');

  return { mode: 'OPEN' };
}


function verifyWriteAccess_(p) {
  const mode = getWriteAccessMode_();
  const email = String(
    Session.getActiveUser().getEmail() || ''
  ).trim();

  if (mode === 'OPEN') {
    return { mode: mode, email: email };
  }

  if (!email) {
    throw new Error(
      'ระบบ Production กำหนดให้ต้อง Login Google Workspace ก่อนบันทึก'
    );
  }

  if (mode === 'WORKSPACE') {
    return { mode: mode, email: email };
  }

  if (mode === 'DOMAIN') {
    const domain = getAllowedDomain_();

    if (!domain) {
      throw new Error('ยังไม่ได้ตั้ง ALLOWED_DOMAIN ใน Script Properties');
    }

    if (!email.toLowerCase().endsWith('@' + domain)) {
      throw new Error('บัญชีนี้ไม่ได้รับสิทธิ์เขียนข้อมูล');
    }

    return { mode: mode, email: email };
  }

  throw new Error('WRITE_ACCESS_MODE ไม่ถูกต้อง: ' + mode);
}


function getSecurityHealth_() {
  const props = PropertiesService.getScriptProperties();
  const mode = getWriteAccessMode_();
  const domain = getAllowedDomain_();
  const adminConfigured = Boolean(
    props.getProperty(adminPasswordProperty_()) &&
    props.getProperty(adminPasswordSaltProperty_())
  );

  return {
    adminPasswordConfigured: adminConfigured,
    writeAccessMode: mode,
    allowedDomain: domain,
    warning: !adminConfigured || mode === 'OPEN',
    message:
      mode === 'OPEN'
        ? 'WRITE_ACCESS_MODE=OPEN เหมาะกับทดสอบเท่านั้น; Production แนะนำ DOMAIN/WORKSPACE'
        : 'Write access policy enabled'
  };
}


function findRowByRepairId_(sh, repairId) {
  const target = String(repairId || '').trim();

  if (!target) {
    throw new Error('ไม่พบ Repair ID');
  }

  const lastRow = sh.getLastRow();

  if (lastRow < 2) {
    throw new Error('ไม่มีข้อมูล');
  }

  const ids = sh.getRange(
    2,
    1,
    lastRow - 1,
    1
  ).getDisplayValues().flat();

  const matches = [];

  ids.forEach((value, index) => {
    if (String(value || '').trim() === target) {
      matches.push(index + 2);
    }
  });

  if (!matches.length) {
    throw new Error(
      'ไม่พบ Repair ID: ' + target
    );
  }

  if (matches.length > 1) {
    throw new Error(
      'พบ Repair ID ซ้ำใน Sheet: ' +
      target +
      ' กรุณาแก้ข้อมูลซ้ำก่อน'
    );
  }

  return matches[0];
}


function adminUpdateRecord_(p, actorValue) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sh = ss.getSheetByName(CONFIG.REPAIR_SHEET);

    if (!sh) {
      throw new Error('ไม่พบชีต ' + CONFIG.REPAIR_SHEET);
    }

    ensureCanonicalHeader_(sh);

    const rowNumber = findRowByRepairId_(sh, p.repairId);
    const lastCol = Math.max(sh.getLastColumn(), CANONICAL_HEADERS.length);

    const oldRow = sh.getRange(
      rowNumber,
      1,
      1,
      lastCol
    ).getDisplayValues()[0];

    const oldRecord = parseRepairRow_(oldRow, rowNumber);

    const date = normalizeDateText_(p.date);
    const recordTime = normalizeHHMMSS_(p.time);

    if (!date) {
      throw new Error('วันที่ต้องเป็นรูปแบบ dd/MM/yyyy และเป็นวันที่จริง');
    }

    if (!recordTime) {
      throw new Error('เวลาบันทึกต้องเป็นรูปแบบ HH:mm:ss');
    }

    const startRepair = normalizeHHMM_(p.startRepair);
    const finishRepair = normalizeHHMM_(p.finishRepair);

    if (!startRepair || !finishRepair) {
      throw new Error('เวลาเริ่มซ่อมและซ่อมเสร็จต้องเป็น HH:mm');
    }

    const model = requireText_(p.model, 'Model', 120);
    const station = requireText_(p.station, 'Station', 120);
    const failure = ensureFailureMasterEntry_(
      requireText_(p.failure, 'Failure / Symptom', 1500)
    );
    const repairAction = requireText_(p.repairAction, 'Repair Action', 5000);
    const repairBy = requireText_(p.repairBy, 'คนทำ', 120);

    let fileId = oldRecord.imageFileId;
    let imageUrl = oldRecord.imageUrl;
    let imageName = oldRecord.imageName;
    let imageFileToTrash = '';

    if (String(p.removeImage || '') === 'true') {
      imageFileToTrash = fileId;
      fileId = '';
      imageUrl = '';
      imageName = '';
    }

    const record = {
      repairId: oldRecord.repairId,
      date: date,
      time: recordTime,
      model: model,
      station: station,
      failure: failure,
      repairAction: repairAction,
      startRepair: startRepair,
      finishRepair: finishRepair,
      repairTime: calculateRepairMinutes_(startRepair, finishRepair),
      repairBy: repairBy,
      imageFileId: fileId,
      imageUrl: imageUrl,
      imageName: imageName
    };

    sh.getRange(rowNumber, 1, 1, lastCol).clearContent();
    sh.getRange(
      rowNumber,
      1,
      1,
      CANONICAL_HEADERS.length
    ).setValues([recordToCanonicalRow_(record)]);

    addModelIfNew_(ss, record.model);
    SpreadsheetApp.flush();

    const oldCanonical = resolveCanonicalFailure_(oldRecord.failure, false);
    const oldKey = normalizeFailureKey_(oldCanonical);
    const newKey = normalizeFailureKey_(failure);

    if (oldKey !== newKey) {
      incrementFailureSummary_(oldCanonical, -1, '');
      incrementFailureSummary_(
        failure,
        1,
        [date, recordTime].join(' ')
      );
    } else {
      // Same Failure but date/time may have changed. Keep last-seen accurate.
      const latest = findLatestFailureSeen_(failure);
      incrementFailureSummary_(failure, 0, latest);
    }

    appendAudit_(
      actorValue || 'Admin',
      'UPDATE_REPAIR',
      'REPAIR',
      record.repairId,
      oldRecord,
      record,
      'Admin'
    );

    if (imageFileToTrash) {
      trashRepairImageSafely_(imageFileToTrash);
    }

    return {
      repairId: record.repairId,
      updated: true,
      normalized: true
    };

  } finally {
    lock.releaseLock();
  }
}
function adminDeleteRecord_(p, actorValue) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sh = ss.getSheetByName(CONFIG.REPAIR_SHEET);

    if (!sh) {
      throw new Error('ไม่พบชีต ' + CONFIG.REPAIR_SHEET);
    }

    const rowNumber = findRowByRepairId_(sh, p.repairId);
    const lastCol = Math.max(sh.getLastColumn(), CANONICAL_HEADERS.length);

    const row = sh.getRange(
      rowNumber,
      1,
      1,
      lastCol
    ).getDisplayValues()[0];

    const record = parseRepairRow_(row, rowNumber);

    sh.deleteRow(rowNumber);
    SpreadsheetApp.flush();

    incrementFailureSummary_(record.failure, -1, '');

    appendAudit_(
      actorValue || 'Admin',
      'DELETE_REPAIR',
      'REPAIR',
      record.repairId,
      record,
      null,
      'Admin'
    );

    if (record.imageFileId) {
      trashRepairImageSafely_(record.imageFileId);
    }

    return {
      repairId: String(p.repairId || '').trim(),
      deleted: true
    };

  } finally {
    lock.releaseLock();
  }
}
function adminNormalizeAll_(actorValue) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sh = ss.getSheetByName(CONFIG.REPAIR_SHEET);

    if (!sh) {
      throw new Error('ไม่พบชีต ' + CONFIG.REPAIR_SHEET);
    }

    const lastRow = sh.getLastRow();

    if (lastRow < 2) {
      ensureCanonicalHeader_(sh);
      return {
        normalizedRows: 0,
        backupSheet: ''
      };
    }

    const lastCol = Math.max(sh.getLastColumn(), CANONICAL_HEADERS.length);
    const rows = sh.getRange(
      2,
      1,
      lastRow - 1,
      lastCol
    ).getDisplayValues();

    const resolver = getFailureResolverMaps_();

    const parsed = rows.map((row, index) => {
      const record = parseRepairRow_(row, index + 2);

      if (record.failure) {
        const canonical = resolveCanonicalFailureWithMaps_(record.failure, resolver);
        record.failure = canonical;
      }

      return record;
    });

    const valid = parsed.filter(
      record => String(record.repairId || '').trim()
    );

    const seenIds = new Set();
    const duplicateIds = new Set();

    valid.forEach(record => {
      const id = String(record.repairId || '').trim();

      if (seenIds.has(id)) {
        duplicateIds.add(id);
      } else {
        seenIds.add(id);
      }
    });

    if (duplicateIds.size) {
      throw new Error(
        'Normalize ถูกยกเลิก เพราะพบ Repair ID ซ้ำ: ' +
        Array.from(duplicateIds).slice(0, 10).join(', ')
      );
    }

    const backupSheet = createRepairLogBackup_(ss, sh);
    ensureCanonicalHeader_(sh);

    sh.getRange(
      2,
      1,
      lastRow - 1,
      lastCol
    ).clearContent();

    if (valid.length) {
      sh.getRange(
        2,
        1,
        valid.length,
        CANONICAL_HEADERS.length
      ).setValues(valid.map(recordToCanonicalRow_));
    }

    SpreadsheetApp.flush();
    rebuildFailureSummary_();

    appendAudit_(
      actorValue || 'Admin',
      'NORMALIZE_REPAIR_LOG',
      'REPAIR_LOG',
      CONFIG.REPAIR_SHEET,
      null,
      {
        normalizedRows: valid.length,
        backupSheet: backupSheet.getName()
      },
      'Admin'
    );

    return {
      normalizedRows: valid.length,
      backupSheet: backupSheet.getName()
    };

  } finally {
    lock.releaseLock();
  }
}

function createRepairLogBackup_(ss, sourceSheet) {
  const stamp = Utilities.formatDate(
    new Date(),
    CONFIG.TIMEZONE,
    'yyyyMMdd_HHmmss'
  );

  const baseName = 'Backup_Repair_Log_' + stamp;
  let name = baseName;
  let seq = 1;

  while (ss.getSheetByName(name)) {
    name = baseName + '_' + seq;
    seq++;
  }

  const backup = sourceSheet.copyTo(ss);
  backup.setName(name);

  return backup;
}

/* =========================================================
   ADMIN OPERATION STATUS
========================================================= */

function adminOpKey_(opId) {
  return 'ADMIN_OP_' + String(opId || '').trim();
}


function validateOperationId_(opId) {
  const id = String(opId || '').trim();

  if (!/^[A-Za-z0-9_-]{8,120}$/.test(id)) {
    throw new Error('Invalid operation ID');
  }

  return id;
}


function claimOperation_(opId, action) {
  const id = validateOperationId_(opId);
  cleanupOldOperationStatuses_();

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const props = PropertiesService.getScriptProperties();
    const key = adminOpKey_(id);
    const existing = props.getProperty(key);

    if (existing) {
      try {
        return {
          claimed: false,
          result: JSON.parse(existing)
        };
      } catch (err) {
        props.deleteProperty(key);
      }
    }

    const pending = {
      ok: true,
      pending: true,
      opId: id,
      action: String(action || ''),
      claimedAt: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      apiVersion: API_VERSION
    };

    props.setProperty(key, JSON.stringify(pending));

    return {
      claimed: true,
      result: pending
    };

  } finally {
    lock.releaseLock();
  }
}


function saveAdminOperationStatus_(opId, result) {
  const id = validateOperationId_(opId);

  PropertiesService
    .getScriptProperties()
    .setProperty(
      adminOpKey_(id),
      JSON.stringify({
        pending: false,
        ...result,
        opId: id,
        apiVersion: API_VERSION,
        timestamp: new Date().toISOString()
      })
    );
}


function getAdminOperationStatus_(opId) {
  let id;

  try {
    id = validateOperationId_(opId);
  } catch (err) {
    return {
      ok: false,
      pending: false,
      error: err.message,
      apiVersion: API_VERSION
    };
  }

  const text = PropertiesService
    .getScriptProperties()
    .getProperty(adminOpKey_(id));

  if (!text) {
    return {
      ok: true,
      pending: true,
      opId: id,
      apiVersion: API_VERSION
    };
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      pending: false,
      error: 'Invalid operation status',
      apiVersion: API_VERSION
    };
  }
}


function cleanupOldOperationStatuses_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const now = Date.now();
  const completedMaxAge = 2 * 60 * 60 * 1000;
  const pendingMaxAge = 30 * 60 * 1000;
  const survivors = [];

  Object.keys(all).forEach(key => {
    if (!key.startsWith('ADMIN_OP_')) return;

    try {
      const data = JSON.parse(all[key]);
      const time = Date.parse(data.timestamp || data.claimedAt || '');
      const maxAge = data.pending ? pendingMaxAge : completedMaxAge;

      if (!Number.isFinite(time) || now - time > maxAge) {
        props.deleteProperty(key);
        return;
      }

      survivors.push({ key, time });

    } catch (err) {
      props.deleteProperty(key);
    }
  });

  // Script Properties has a finite quota. Keep only recent operation states.
  survivors
    .sort((a, b) => b.time - a.time)
    .slice(100)
    .forEach(item => props.deleteProperty(item.key));
}

function normalizeFailureKey_(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}


/* =========================================================
   PRODUCTION INFRASTRUCTURE
   Sheets / Audit / Failure Master / Backup
========================================================= */

function ensureSheetWithHeaders_(ss, sheetName, headers, headerColor) {
  let sh = ss.getSheetByName(sheetName);

  if (!sh) {
    sh = ss.insertSheet(sheetName);
  }

  if (sh.getMaxColumns() < headers.length) {
    sh.insertColumnsAfter(
      sh.getMaxColumns(),
      headers.length - sh.getMaxColumns()
    );
  }

  sh.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold')
    .setBackground(headerColor || '#44546A')
    .setFontColor('#FFFFFF');

  sh.setFrozenRows(1);

  return sh;
}


function ensureAuditSheet_(ss) {
  return ensureSheetWithHeaders_(
    ss,
    CONFIG.AUDIT_SHEET,
    AUDIT_HEADERS,
    '#5B5B5B'
  );
}


function appendAudit_(actorValue, actionValue, entityTypeValue, entityIdValue, beforeValue, afterValue, sourceValue) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sh = ensureAuditSheet_(ss);

    const timestamp = Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      'dd/MM/yyyy HH:mm:ss'
    );

    const safeJson = value => {
      if (value === null || value === undefined || value === '') {
        return '';
      }

      const text = typeof value === 'string'
        ? value
        : JSON.stringify(value);

      return clean_(text.slice(0, 45000));
    };

    sh.appendRow([
      timestamp,
      clean_(String(actorValue || 'unknown').slice(0, 200)),
      clean_(String(actionValue || '').slice(0, 100)),
      clean_(String(entityTypeValue || '').slice(0, 100)),
      clean_(String(entityIdValue || '').slice(0, 300)),
      safeJson(beforeValue),
      safeJson(afterValue),
      clean_(String(sourceValue || '').slice(0, 120))
    ]);

  } catch (err) {
    console.log('Audit Log failed: ' + String(err.message || err));
  }
}


function getAuditLog_(limitValue) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ensureAuditSheet_(ss);
  const lastRow = sh.getLastRow();

  if (lastRow < 2) return [];

  const limit = Math.min(
    200,
    Math.max(1, Number(limitValue || 50))
  );

  const startRow = Math.max(2, lastRow - limit + 1);

  return sh.getRange(
    startRow,
    1,
    lastRow - startRow + 1,
    AUDIT_HEADERS.length
  )
    .getDisplayValues()
    .reverse()
    .map(row => ({
      timestamp: row[0] || '',
      actor: row[1] || '',
      action: row[2] || '',
      entityType: row[3] || '',
      entityId: row[4] || '',
      beforeJson: row[5] || '',
      afterJson: row[6] || '',
      source: row[7] || ''
    }));
}


function ensureFailureMasterSheet_(ss) {
  return ensureSheetWithHeaders_(
    ss,
    CONFIG.FAILURE_MASTER_SHEET,
    FAILURE_MASTER_HEADERS,
    '#4472C4'
  );
}


function ensureFailureAliasSheet_(ss) {
  return ensureSheetWithHeaders_(
    ss,
    CONFIG.FAILURE_ALIAS_SHEET,
    FAILURE_ALIAS_HEADERS,
    '#8064A2'
  );
}


function getFailureResolverMaps_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const master = ensureFailureMasterSheet_(ss);
  const alias = ensureFailureAliasSheet_(ss);

  const masterMap = new Map();
  const aliasMap = new Map();
  const masterRows = new Map();

  if (master.getLastRow() >= 2) {
    master.getRange(
      2,
      1,
      master.getLastRow() - 1,
      FAILURE_MASTER_HEADERS.length
    ).getDisplayValues().forEach((row, index) => {
      const failure = String(row[0] || '').trim();
      const key = String(row[1] || normalizeFailureKey_(failure)).trim();
      const status = String(row[2] || 'ACTIVE').trim().toUpperCase();

      if (failure && key && status !== 'DELETED') {
        masterMap.set(key, failure);
        masterRows.set(key, index + 2);
      }
    });
  }

  if (alias.getLastRow() >= 2) {
    alias.getRange(
      2,
      1,
      alias.getLastRow() - 1,
      FAILURE_ALIAS_HEADERS.length
    ).getDisplayValues().forEach(row => {
      const aliasKey = String(row[1] || '').trim();
      const canonical = String(row[2] || '').trim();

      if (aliasKey && canonical) {
        aliasMap.set(aliasKey, canonical);
      }
    });
  }

  return {
    ss,
    master,
    alias,
    masterMap,
    aliasMap,
    masterRows
  };
}


function resolveCanonicalFailureWithMaps_(failureValue, maps) {
  const failure = String(failureValue || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!failure) return '';

  const key = normalizeFailureKey_(failure);

  if (maps.aliasMap.has(key)) {
    return maps.aliasMap.get(key);
  }

  if (maps.masterMap.has(key)) {
    return maps.masterMap.get(key);
  }

  return failure;
}


function ensureFailureMasterEntry_(failureValue) {
  const failure = requireText_(
    failureValue,
    'Failure / Symptom',
    1500
  )
    .replace(/\s+/g, ' ')
    .trim();

  const key = normalizeFailureKey_(failure);
  const maps = getFailureResolverMaps_();

  if (maps.aliasMap.has(key)) {
    return maps.aliasMap.get(key);
  }

  if (maps.masterMap.has(key)) {
    return maps.masterMap.get(key);
  }

  const now = Utilities.formatDate(
    new Date(),
    CONFIG.TIMEZONE,
    'dd/MM/yyyy HH:mm:ss'
  );

  maps.master.appendRow([
    clean_(failure),
    clean_(key),
    'ACTIVE',
    now,
    now
  ]);

  return failure;
}


function resolveCanonicalFailure_(failureValue, createIfMissing) {
  const failure = String(failureValue || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!failure) return '';

  const maps = getFailureResolverMaps_();
  const resolved = resolveCanonicalFailureWithMaps_(failure, maps);

  if (
    normalizeFailureKey_(resolved) !== normalizeFailureKey_(failure) ||
    maps.masterMap.has(normalizeFailureKey_(failure))
  ) {
    return resolved;
  }

  return createIfMissing
    ? ensureFailureMasterEntry_(failure)
    : failure;
}


function getFailureMasters_() {
  const maps = getFailureResolverMaps_();
  const masters = [];
  const aliases = [];

  if (maps.master.getLastRow() >= 2) {
    maps.master.getRange(
      2,
      1,
      maps.master.getLastRow() - 1,
      FAILURE_MASTER_HEADERS.length
    ).getDisplayValues().forEach(row => {
      if (!row[0]) return;

      masters.push({
        failure: row[0],
        failureKey: row[1],
        status: row[2] || 'ACTIVE',
        createdAt: row[3],
        updatedAt: row[4]
      });
    });
  }

  if (maps.alias.getLastRow() >= 2) {
    maps.alias.getRange(
      2,
      1,
      maps.alias.getLastRow() - 1,
      FAILURE_ALIAS_HEADERS.length
    ).getDisplayValues().forEach(row => {
      if (!row[0]) return;

      aliases.push({
        alias: row[0],
        aliasKey: row[1],
        canonicalFailure: row[2],
        canonicalKey: row[3],
        createdAt: row[4]
      });
    });
  }

  return { masters, aliases };
}


function addFailureAlias_(aliasValue, canonicalValue) {
  const aliasText = String(aliasValue || '')
    .replace(/\s+/g, ' ')
    .trim();

  const canonical = ensureFailureMasterEntry_(canonicalValue);

  if (!aliasText) return;

  const aliasKey = normalizeFailureKey_(aliasText);
  const canonicalKey = normalizeFailureKey_(canonical);

  if (aliasKey === canonicalKey) return;

  const maps = getFailureResolverMaps_();
  const now = Utilities.formatDate(
    new Date(),
    CONFIG.TIMEZONE,
    'dd/MM/yyyy HH:mm:ss'
  );

  if (maps.alias.getLastRow() >= 2) {
    const keys = maps.alias.getRange(
      2,
      2,
      maps.alias.getLastRow() - 1,
      1
    ).getDisplayValues().flat();

    const index = keys.findIndex(
      value => String(value || '').trim() === aliasKey
    );

    if (index >= 0) {
      maps.alias.getRange(
        index + 2,
        1,
        1,
        FAILURE_ALIAS_HEADERS.length
      ).setValues([[
        clean_(aliasText),
        clean_(aliasKey),
        clean_(canonical),
        clean_(canonicalKey),
        now
      ]]);

      return;
    }
  }

  maps.alias.appendRow([
    clean_(aliasText),
    clean_(aliasKey),
    clean_(canonical),
    clean_(canonicalKey),
    now
  ]);
}


function markFailureMasterMerged_(sourceValue, targetValue) {
  const sourceKey = normalizeFailureKey_(sourceValue);
  const maps = getFailureResolverMaps_();
  const rowNumber = maps.masterRows.get(sourceKey);

  if (!rowNumber) return;

  maps.master.getRange(rowNumber, 3).setValue('MERGED → ' + targetValue);
  maps.master.getRange(rowNumber, 5).setValue(
    Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      'dd/MM/yyyy HH:mm:ss'
    )
  );
}


function ensureFailureGuideImagesSheet_(ss) {
  return ensureSheetWithHeaders_(
    ss,
    CONFIG.FAILURE_GUIDE_IMAGES_SHEET,
    FAILURE_GUIDE_IMAGE_HEADERS,
    '#BF9000'
  );
}


function createGuideImageId_(guideId) {
  return (
    String(guideId || 'FG') +
    '-IMG-' +
    Utilities.getUuid().replace(/-/g, '').slice(0, 12)
  );
}


function getFailureGuideImagesMap_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ensureFailureGuideImagesSheet_(ss);
  const map = new Map();

  if (sh.getLastRow() < 2) return map;

  sh.getRange(
    2,
    1,
    sh.getLastRow() - 1,
    FAILURE_GUIDE_IMAGE_HEADERS.length
  ).getDisplayValues().forEach(row => {
    const guideId = String(row[1] || '').trim();
    if (!guideId) return;

    const image = {
      imageId: row[0] || '',
      guideId: guideId,
      imageFileId: row[2] || '',
      imageUrl: row[3] || '',
      imageName: row[4] || '',
      caption: row[5] || '',
      sortOrder: Number(row[6] || 0),
      addedAt: row[7] || ''
    };

    if (!map.has(guideId)) {
      map.set(guideId, []);
    }

    map.get(guideId).push(image);
  });

  map.forEach(images => {
    images.sort((a, b) => a.sortOrder - b.sortOrder);
  });

  return map;
}


function ensureLegacyGuideImageReference_(guide) {
  if (!guide || !guide.guideId || !guide.imageFileId) return;

  const map = getFailureGuideImagesMap_();

  if ((map.get(guide.guideId) || []).length) return;

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ensureFailureGuideImagesSheet_(ss);

  sh.appendRow([
    clean_(createGuideImageId_(guide.guideId)),
    clean_(guide.guideId),
    clean_(guide.imageFileId),
    clean_(guide.imageUrl),
    clean_(guide.imageName),
    'Legacy main image',
    1,
    Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      'dd/MM/yyyy HH:mm:ss'
    )
  ]);
}


function migrateLegacyGuideImages_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const guideSheet = ensureFailureGuideSheet_(ss);
  const imageSheet = ensureFailureGuideImagesSheet_(ss);

  if (guideSheet.getLastRow() < 2) return 0;

  const existingMap = getFailureGuideImagesMap_();
  const rows = guideSheet.getRange(
    2,
    1,
    guideSheet.getLastRow() - 1,
    FAILURE_GUIDE_HEADERS.length
  ).getDisplayValues();

  const appendRows = [];

  rows.forEach((row, index) => {
    const guide = guideRowToObject_(row, index + 2);

    if (
      guide.guideId &&
      guide.imageFileId &&
      !(existingMap.get(guide.guideId) || []).length
    ) {
      appendRows.push([
        clean_(createGuideImageId_(guide.guideId)),
        clean_(guide.guideId),
        clean_(guide.imageFileId),
        clean_(guide.imageUrl),
        clean_(guide.imageName),
        'Legacy main image',
        1,
        Utilities.formatDate(
          new Date(),
          CONFIG.TIMEZONE,
          'dd/MM/yyyy HH:mm:ss'
        )
      ]);
    }
  });

  if (appendRows.length) {
    imageSheet.getRange(
      imageSheet.getLastRow() + 1,
      1,
      appendRows.length,
      FAILURE_GUIDE_IMAGE_HEADERS.length
    ).setValues(appendRows);
  }

  return appendRows.length;
}

function parseImagesJson_(value) {
  const text = String(value || '').trim();
  if (!text) return [];

  let data;

  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error('imagesJson ไม่ถูกต้อง');
  }

  if (!Array.isArray(data)) {
    throw new Error('imagesJson ต้องเป็น Array');
  }

  const images = data
    .slice(0, 5)
    .map(item => ({
      name: optionalText_(item && item.name, 160),
      mimeType: optionalText_(item && item.mimeType, 100),
      base64: String((item && item.base64) || '').trim()
    }))
    .filter(item => item.base64);

  const totalBase64 = images.reduce(
    (sum, item) => sum + item.base64.length,
    0
  );

  if (totalBase64 > 4000000) {
    throw new Error('รูปหลายรูปรวมกันใหญ่เกินไป กรุณาลดจำนวน/ขนาดรูป');
  }

  return images;
}


function nextGuideImageSortOrder_(guideId) {
  const map = getFailureGuideImagesMap_();
  const images = map.get(String(guideId || '').trim()) || [];

  return images.length
    ? Math.max(...images.map(image => Number(image.sortOrder || 0))) + 1
    : 1;
}


function saveGuideImages_(guideId, images) {
  if (!images.length) return [];

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ensureFailureGuideImagesSheet_(ss);
  const startOrder = nextGuideImageSortOrder_(guideId);
  const saved = [];

  try {
    images.forEach((item, index) => {
      const image = saveImageIfProvided_(
        guideId + '-IMG-' + String(startOrder + index),
        {
          imageBase64: item.base64,
          imageMimeType: item.mimeType,
          imageName: item.name
        }
      );

      if (!image.fileId) return;

      const row = {
        imageId: createGuideImageId_(guideId),
        guideId: guideId,
        imageFileId: image.fileId,
        imageUrl: image.url,
        imageName: image.name,
        caption: '',
        sortOrder: startOrder + index,
        addedAt: Utilities.formatDate(
          new Date(),
          CONFIG.TIMEZONE,
          'dd/MM/yyyy HH:mm:ss'
        )
      };

      sh.appendRow([
        clean_(row.imageId),
        clean_(row.guideId),
        clean_(row.imageFileId),
        clean_(row.imageUrl),
        clean_(row.imageName),
        clean_(row.caption),
        row.sortOrder,
        row.addedAt
      ]);

      saved.push(row);
    });

    return saved;

  } catch (err) {
    saved.forEach(image => {
      trashRepairImageSafely_(image.imageFileId);
    });

    throw err;
  }
}


function deleteGuideImages_(guideId) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ensureFailureGuideImagesSheet_(ss);

  if (sh.getLastRow() < 2) return 0;

  const rows = sh.getRange(
    2,
    1,
    sh.getLastRow() - 1,
    FAILURE_GUIDE_IMAGE_HEADERS.length
  ).getDisplayValues();

  const matches = [];

  rows.forEach((row, index) => {
    if (String(row[1] || '').trim() === String(guideId || '').trim()) {
      matches.push({
        rowNumber: index + 2,
        fileId: row[2] || ''
      });
    }
  });

  matches
    .sort((a, b) => b.rowNumber - a.rowNumber)
    .forEach(item => {
      sh.deleteRow(item.rowNumber);

      if (item.fileId) {
        trashRepairImageSafely_(item.fileId);
      }
    });

  return matches.length;
}


function getBackupFolder_() {
  const folders = DriveApp.getFoldersByName(CONFIG.BACKUP_FOLDER_NAME);

  if (folders.hasNext()) {
    return folders.next();
  }

  return DriveApp.createFolder(CONFIG.BACKUP_FOLDER_NAME);
}


function backupSheetNames_() {
  return [
    CONFIG.REPAIR_SHEET,
    CONFIG.MODEL_SHEET,
    CONFIG.FAILURE_GUIDE_SHEET,
    CONFIG.FAILURE_GUIDE_IMAGES_SHEET,
    CONFIG.FAILURE_SUMMARY_SHEET,
    CONFIG.FAILURE_MASTER_SHEET,
    CONFIG.FAILURE_ALIAS_SHEET,
    CONFIG.AUDIT_SHEET
  ];
}


function createProductionBackup_(tagValue, actorValue) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {

      const tag = String(tagValue || 'DAILY').toUpperCase();
      const now = new Date();
      const stamp = Utilities.formatDate(
        now,
        CONFIG.TIMEZONE,
        'yyyyMMdd_HHmmss'
      );

      const name = 'ATS1_Backup_' + tag + '_' + stamp;
      const source = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const backup = SpreadsheetApp.create(name);
      const defaultSheet = backup.getSheets()[0];

      let copied = 0;

      backupSheetNames_().forEach(sheetName => {
        const sourceSheet = source.getSheetByName(sheetName);
        if (!sourceSheet) return;

        const copiedSheet = sourceSheet.copyTo(backup);
        copiedSheet.setName(String(sheetName).slice(0, 99));
        copied++;
      });

      if (copied > 0 && backup.getSheets().length > 1) {
        backup.deleteSheet(defaultSheet);
      }

      const file = DriveApp.getFileById(backup.getId());
      file.moveTo(getBackupFolder_());

      const result = {
        backupName: name,
        backupId: backup.getId(),
        backupUrl: backup.getUrl(),
        tag: tag,
        time: Utilities.formatDate(
          now,
          CONFIG.TIMEZONE,
          'dd/MM/yyyy HH:mm:ss'
        ),
        copiedSheets: copied
      };

      PropertiesService
        .getScriptProperties()
        .setProperty('LAST_BACKUP_JSON', JSON.stringify(result));

      cleanupBackupRetention_();

      appendAudit_(
        actorValue || 'SYSTEM',
        'CREATE_BACKUP',
        'BACKUP',
        backup.getId(),
        null,
        result,
        'Backup'
      );

      return result;
  } finally {
    lock.releaseLock();
  }
}

function cleanupBackupRetention_() {
  const folder = getBackupFolder_();
  const files = folder.getFiles();

  const buckets = {
    DAILY: [],
    WEEKLY: [],
    MONTHLY: [],
    MANUAL: []
  };

  while (files.hasNext()) {
    const file = files.next();
    const match = file.getName().match(
      /^ATS1_Backup_(DAILY|WEEKLY|MONTHLY|MANUAL)_/
    );

    if (match) {
      buckets[match[1]].push(file);
    }
  }

  const limits = {
    DAILY: 7,
    WEEKLY: 4,
    MONTHLY: 12,
    MANUAL: 10
  };

  Object.keys(buckets).forEach(tag => {
    buckets[tag]
      .sort(
        (a, b) =>
          b.getDateCreated().getTime() -
          a.getDateCreated().getTime()
      )
      .slice(limits[tag])
      .forEach(file => file.setTrashed(true));
  });
}


function runScheduledBackup() {
  const now = new Date();
  const day = Number(
    Utilities.formatDate(now, CONFIG.TIMEZONE, 'd')
  );
  const weekday = Number(
    Utilities.formatDate(now, CONFIG.TIMEZONE, 'u')
  );

  let tag = 'DAILY';

  if (day === 1) {
    tag = 'MONTHLY';
  } else if (weekday === 7) {
    tag = 'WEEKLY';
  }

  return createProductionBackup_(tag, 'SYSTEM');
}


function installDailyBackupTrigger_(actorValue) {
  const handler = 'runScheduledBackup';

  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === handler)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));

  ScriptApp
    .newTrigger(handler)
    .timeBased()
    .atHour(2)
    .nearMinute(0)
    .everyDays(1)
    .create();

  appendAudit_(
    actorValue || 'SYSTEM',
    'INSTALL_BACKUP_TRIGGER',
    'TRIGGER',
    handler,
    null,
    { hour: 2, frequency: 'DAILY' },
    'Backup'
  );

  return { triggerInstalled: true, hour: 2 };
}


function getBackupStatus_() {
  const props = PropertiesService.getScriptProperties();
  let lastBackup = null;
  const text = props.getProperty('LAST_BACKUP_JSON');

  if (text) {
    try {
      lastBackup = JSON.parse(text);
    } catch (err) {
      lastBackup = null;
    }
  }

  const installed = ScriptApp.getProjectTriggers()
    .some(
      trigger =>
        trigger.getHandlerFunction() === 'runScheduledBackup'
    );

  return {
    ok: true,
    lastBackup: lastBackup,
    triggerInstalled: installed
  };
}


/* =========================================================
   FAILURE SUMMARY / DETAILED GUIDE
========================================================= */

function ensureFailureGuideSheet_(ss) {
  return ensureSheetWithHeaders_(
    ss,
    CONFIG.FAILURE_GUIDE_SHEET,
    FAILURE_GUIDE_HEADERS,
    '#7F6000'
  );
}


function ensureFailureSummarySheet_(ss) {
  return ensureSheetWithHeaders_(
    ss,
    CONFIG.FAILURE_SUMMARY_SHEET,
    FAILURE_SUMMARY_HEADERS,
    '#548235'
  );
}


function buildFailureSummary_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ensureFailureSummarySheet_(ss);

  if (sh.getLastRow() < 2) {
    const repair = ss.getSheetByName(CONFIG.REPAIR_SHEET);

    if (repair && repair.getLastRow() >= 2) {
      return rebuildFailureSummary_();
    }

    return [];
  }

  return sh.getRange(
    2,
    1,
    sh.getLastRow() - 1,
    FAILURE_SUMMARY_HEADERS.length
  ).getDisplayValues()
    .map(row => ({
      failureKey: row[0] || '',
      failure: row[1] || '',
      failCount: Number(row[2] || 0),
      lastSeen: row[3] || '',
      updatedAt: row[4] || ''
    }))
    .filter(item => item.failure && item.failCount > 0)
    .sort(
      (a, b) =>
        b.failCount - a.failCount ||
        a.failure.localeCompare(b.failure)
    );
}


function repairRecordTimestamp_(record) {
  const dateText = String((record && record.date) || '').trim();
  const timeText = String((record && record.time) || '').trim();
  const match = dateText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!match) return 0;

  const time = timeText.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  const d = Number(match[1]);
  const m = Number(match[2]);
  const y = Number(match[3]);
  const hh = time ? Number(time[1]) : 0;
  const mm = time ? Number(time[2]) : 0;
  const ss = time ? Number(time[3] || 0) : 0;

  const value = new Date(y, m - 1, d, hh, mm, ss, 0);
  return Number.isNaN(value.getTime()) ? 0 : value.getTime();
}


function rebuildFailureSummary_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ensureFailureSummarySheet_(ss);
  const records = getRecords_();
  const maps = getFailureResolverMaps_();
  const map = new Map();
  const newMasters = new Map();

  records.forEach(record => {
    const raw = String(record.failure || '').replace(/\s+/g, ' ').trim();
    if (!raw) return;

    let canonical = resolveCanonicalFailureWithMaps_(raw, maps);
    const rawKey = normalizeFailureKey_(raw);

    if (
      canonical === raw &&
      !maps.masterMap.has(rawKey) &&
      !maps.aliasMap.has(rawKey)
    ) {
      newMasters.set(rawKey, raw);
    }

    const key = normalizeFailureKey_(canonical);

    if (!map.has(key)) {
      map.set(key, {
        failureKey: key,
        failure: canonical,
        failCount: 0,
        lastSeen: '',
        lastSeenTs: 0
      });
    }

    const item = map.get(key);
    item.failCount += 1;

    const timestamp = repairRecordTimestamp_(record);

    if (timestamp >= item.lastSeenTs) {
      item.lastSeenTs = timestamp;
      item.lastSeen = [record.date, record.time]
        .filter(Boolean)
        .join(' ');
    }
  });

  if (newMasters.size) {
    const now = Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      'dd/MM/yyyy HH:mm:ss'
    );

    maps.master.getRange(
      maps.master.getLastRow() + 1,
      1,
      newMasters.size,
      FAILURE_MASTER_HEADERS.length
    ).setValues(
      Array.from(newMasters.entries()).map(([key, failure]) => [
        clean_(failure),
        clean_(key),
        'ACTIVE',
        now,
        now
      ])
    );
  }

  const summary = Array.from(map.values())
    .sort(
      (a, b) =>
        b.failCount - a.failCount ||
        a.failure.localeCompare(b.failure)
    );

  const lastRow = sh.getLastRow();

  if (lastRow > 1) {
    sh.getRange(
      2,
      1,
      lastRow - 1,
      Math.max(sh.getLastColumn(), FAILURE_SUMMARY_HEADERS.length)
    ).clearContent();
  }

  if (summary.length) {
    const updatedAt = Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      'dd/MM/yyyy HH:mm:ss'
    );

    sh.getRange(
      2,
      1,
      summary.length,
      FAILURE_SUMMARY_HEADERS.length
    ).setValues(
      summary.map(item => [
        clean_(item.failureKey),
        clean_(item.failure),
        Number(item.failCount),
        clean_(item.lastSeen),
        updatedAt
      ])
    );
  }

  SpreadsheetApp.flush();

  return summary;
}


function syncFailureSummary_() {
  return rebuildFailureSummary_();
}


function findLatestFailureSeen_(failureValue) {
  const maps = getFailureResolverMaps_();
  const targetKey = normalizeFailureKey_(
    resolveCanonicalFailureWithMaps_(failureValue, maps)
  );

  const matches = getRecords_()
    .filter(item => {
      const canonical = resolveCanonicalFailureWithMaps_(item.failure, maps);
      return normalizeFailureKey_(canonical) === targetKey;
    })
    .sort(
      (a, b) =>
        repairRecordTimestamp_(b) -
        repairRecordTimestamp_(a)
    );

  const record = matches[0];

  return record
    ? [record.date, record.time].filter(Boolean).join(' ')
    : '';
}

function incrementFailureSummary_(failureValue, deltaValue, lastSeenValue) {
  const canonical = resolveCanonicalFailure_(failureValue, true);
  const key = normalizeFailureKey_(canonical);
  if (!key) return;

  const delta = Number(deltaValue || 0);
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ensureFailureSummarySheet_(ss);
  const nowText = Utilities.formatDate(
    new Date(),
    CONFIG.TIMEZONE,
    'dd/MM/yyyy HH:mm:ss'
  );

  let rowNumber = -1;

  if (sh.getLastRow() >= 2) {
    const keys = sh.getRange(
      2,
      1,
      sh.getLastRow() - 1,
      1
    ).getDisplayValues().flat();

    const index = keys.findIndex(
      value => String(value || '').trim() === key
    );

    if (index >= 0) rowNumber = index + 2;
  }

  if (rowNumber < 0) {
    if (delta <= 0) {
      // Summary may be missing/stale after a manual Sheet edit.
      rebuildFailureSummary_();
      return;
    }

    sh.appendRow([
      clean_(key),
      clean_(canonical),
      delta,
      clean_(lastSeenValue || ''),
      nowText
    ]);
    return;
  }

  const current = Number(sh.getRange(rowNumber, 3).getValue() || 0);
  const next = current + delta;

  if (next <= 0) {
    sh.deleteRow(rowNumber);
    return;
  }

  let lastSeen = String(lastSeenValue || '').trim();

  if (!lastSeen && delta < 0) {
    lastSeen = findLatestFailureSeen_(canonical);
  }

  if (!lastSeen) {
    lastSeen = sh.getRange(rowNumber, 4).getDisplayValue();
  }

  sh.getRange(
    rowNumber,
    1,
    1,
    FAILURE_SUMMARY_HEADERS.length
  ).setValues([[
    clean_(key),
    clean_(canonical),
    next,
    clean_(lastSeen),
    nowText
  ]]);
}


function safeSyncFailureSummary_() {
  try {
    const summary = rebuildFailureSummary_();
    return { ok: true, count: summary.length };
  } catch (err) {
    console.log(
      'Failure_Summary rebuild failed: ' +
      String(err.message || err)
    );
    return { ok: false, error: String(err.message || err) };
  }
}


function getFailureAnalytics_(canonicalFailure) {
  const maps = getFailureResolverMaps_();
  const targetKey = normalizeFailureKey_(canonicalFailure);

  const records = getRecords_()
    .filter(record => {
      const resolved = resolveCanonicalFailureWithMaps_(record.failure, maps);
      return normalizeFailureKey_(resolved) === targetKey;
    })
    .sort(
      (a, b) =>
        repairRecordTimestamp_(b) -
        repairRecordTimestamp_(a)
    );

  const repairTimes = records
    .map(record => Number(record.repairTime || 0))
    .filter(value => Number.isFinite(value) && value >= 0);

  const avgRepairTime = repairTimes.length
    ? repairTimes.reduce((sum, value) => sum + value, 0) / repairTimes.length
    : 0;

  const aggregate = field => {
    const map = new Map();

    records.forEach(record => {
      const value = String(record[field] || '').trim() || '(ไม่ระบุ)';
      map.set(value, (map.get(value) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          a.name.localeCompare(b.name)
      );
  };

  return {
    avgRepairTime: avgRepairTime,
    lastSeen: records.length
      ? [records[0].date, records[0].time].filter(Boolean).join(' ')
      : '',
    modelBreakdown: aggregate('model'),
    stationBreakdown: aggregate('station'),
    recent: records.slice(0, 5).map(record => ({
      repairId: record.repairId,
      date: record.date,
      time: record.time,
      model: record.model,
      station: record.station,
      repairTime: record.repairTime,
      repairBy: record.repairBy
    }))
  };
}


function getFailureDetail_(failureValue) {
  const requested = requireText_(
    failureValue,
    'Failure / Symptom',
    1500
  );

  const canonical = resolveCanonicalFailure_(requested, false);
  const key = normalizeFailureKey_(canonical);
  const summaryItem = buildFailureSummary_()
    .find(item => item.failureKey === key);

  return {
    ok: true,
    failure: summaryItem ? summaryItem.failure : canonical,
    failureKey: key,
    failCount: summaryItem ? summaryItem.failCount : 0,
    guides: getFailureGuides_(canonical),
    analytics: getFailureAnalytics_(canonical)
  };
}


function guideRowToObject_(row, sheetRow) {
  const values = row.map(
    value => String(value ?? '').trim()
  );

  return {
    sheetRow: sheetRow,
    guideId: values[0] || '',
    failureKey: values[1] || '',
    failure: values[2] || '',
    detail: values[3] || '',
    author: values[4] || '',
    date: values[5] || '',
    time: values[6] || '',
    imageFileId: values[7] || '',
    imageUrl: values[8] || '',
    imageName: values[9] || '',
    updatedDate: values[10] || '',
    updatedTime: values[11] || '',
    rootCause: values[12] || '',
    checkPoint: values[13] || '',
    expectedValue: values[14] || '',
    verification: values[15] || '',
    toolEquipment: values[16] || '',
    relatedModel: values[17] || '',
    relatedStation: values[18] || '',
    images: []
  };
}


function getFailureGuides_(failureValue) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ensureFailureGuideSheet_(ss);
  const lastRow = sh.getLastRow();

  if (lastRow < 2) return [];

  const maps = getFailureResolverMaps_();
  const requestedCanonical = failureValue
    ? resolveCanonicalFailureWithMaps_(failureValue, maps)
    : '';
  const requestedKey = normalizeFailureKey_(requestedCanonical);
  const imageMap = getFailureGuideImagesMap_();

  return sh.getRange(
    2,
    1,
    lastRow - 1,
    FAILURE_GUIDE_HEADERS.length
  ).getDisplayValues()
    .map((row, index) => guideRowToObject_(row, index + 2))
    .filter(guide => {
      if (!guide.guideId) return false;
      if (!requestedKey) return true;

      const canonical = resolveCanonicalFailureWithMaps_(guide.failure, maps);
      return normalizeFailureKey_(canonical) === requestedKey;
    })
    .map(guide => {
      const images = [...(imageMap.get(guide.guideId) || [])];

      if (!images.length && guide.imageFileId) {
        images.push({
          imageId: '',
          guideId: guide.guideId,
          imageFileId: guide.imageFileId,
          imageUrl: guide.imageUrl,
          imageName: guide.imageName,
          caption: '',
          sortOrder: 1,
          addedAt: ''
        });
      }

      guide.images = images;
      return guide;
    })
    .reverse();
}


function createFailureGuideId_(sh, now) {
  const ymd = Utilities.formatDate(
    now,
    CONFIG.TIMEZONE,
    'yyyyMMdd'
  );

  const prefix = 'FG-' + ymd + '-';
  const lastRow = sh.getLastRow();
  let maxSeq = 0;

  if (lastRow >= 2) {
    const ids = sh.getRange(
      2,
      1,
      lastRow - 1,
      1
    ).getDisplayValues().flat();

    ids.forEach(value => {
      const id = String(value || '').trim();
      if (!id.startsWith(prefix)) return;

      const n = parseInt(id.slice(prefix.length), 10);
      if (Number.isFinite(n)) {
        maxSeq = Math.max(maxSeq, n);
      }
    });
  }

  return prefix + String(maxSeq + 1).padStart(4, '0');
}


function saveFailureGuide_(p, actorEmail) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  let savedImages = [];

  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sh = ensureFailureGuideSheet_(ss);

    const failure = ensureFailureMasterEntry_(
      requireText_(p.failure, 'Failure / Symptom', 1500)
    );

    const detail = requireText_(
      p.detail,
      'วิธีแก้ไขแบบละเอียด',
      12000
    );

    const author = optionalText_(p.author, 120);
    const now = new Date();
    const guideId = createFailureGuideId_(sh, now);

    let images = parseImagesJson_(p.imagesJson);

    if (!images.length && String(p.imageBase64 || '').trim()) {
      images = [{
        name: p.imageName || '',
        mimeType: p.imageMimeType || '',
        base64: p.imageBase64 || ''
      }];
    }

    savedImages = saveGuideImages_(guideId, images);

    const mainImage = savedImages[0] || {
      imageFileId: '',
      imageUrl: '',
      imageName: ''
    };

    const dateText = Utilities.formatDate(
      now,
      CONFIG.TIMEZONE,
      'dd/MM/yyyy'
    );
    const timeText = Utilities.formatDate(
      now,
      CONFIG.TIMEZONE,
      'HH:mm:ss'
    );

    const row = [
      clean_(guideId),
      clean_(normalizeFailureKey_(failure)),
      clean_(failure),
      clean_(detail),
      clean_(author),
      dateText,
      timeText,
      clean_(mainImage.imageFileId),
      clean_(mainImage.imageUrl),
      clean_(mainImage.imageName),
      '',
      '',
      clean_(optionalText_(p.rootCause, 5000)),
      clean_(optionalText_(p.checkPoint, 5000)),
      clean_(optionalText_(p.expectedValue, 5000)),
      clean_(optionalText_(p.verification, 5000)),
      clean_(optionalText_(p.toolEquipment, 500)),
      clean_(optionalText_(p.relatedModel, 500)),
      clean_(optionalText_(p.relatedStation, 500))
    ];

    sh.appendRow(row);
    SpreadsheetApp.flush();

    appendAudit_(
      actorEmail || author || 'unknown',
      'CREATE_GUIDE',
      'FAILURE_GUIDE',
      guideId,
      null,
      {
        failure: failure,
        detail: detail,
        imageCount: savedImages.length
      },
      'User'
    );

    return {
      guideId: guideId,
      failure: failure,
      imageCount: savedImages.length,
      imageFileId: mainImage.imageFileId || ''
    };

  } catch (err) {
    savedImages.forEach(image => {
      if (image.imageFileId) {
        trashRepairImageSafely_(image.imageFileId);
      }
    });

    throw err;

  } finally {
    lock.releaseLock();
  }
}


function optionalText_(value, maxLength) {
  let text = String(value ?? '').trim();

  if (text.length > maxLength) {
    text = text.slice(0, maxLength);
  }

  return text;
}


function findFailureGuideRow_(sh, guideIdValue) {
  const guideId = String(guideIdValue || '').trim();

  if (!guideId) {
    throw new Error('ไม่พบ Guide ID');
  }

  const lastRow = sh.getLastRow();

  if (lastRow < 2) {
    throw new Error('ยังไม่มี Failure Guide');
  }

  const ids = sh.getRange(
    2,
    1,
    lastRow - 1,
    1
  ).getDisplayValues().flat();

  const matches = [];

  ids.forEach((value, index) => {
    if (String(value || '').trim() === guideId) {
      matches.push(index + 2);
    }
  });

  if (!matches.length) {
    throw new Error('ไม่พบ Guide ID: ' + guideId);
  }

  if (matches.length > 1) {
    throw new Error(
      'พบ Guide ID ซ้ำใน Failure_Guide: ' +
      guideId +
      ' กรุณาแก้ข้อมูลซ้ำก่อน'
    );
  }

  return matches[0];
}


function adminUpdateFailureGuide_(p, actorValue) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  let newlySaved = [];

  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sh = ensureFailureGuideSheet_(ss);
    const rowNumber = findFailureGuideRow_(sh, p.guideId);

    const oldRow = sh.getRange(
      rowNumber,
      1,
      1,
      FAILURE_GUIDE_HEADERS.length
    ).getDisplayValues()[0];

    const oldGuide = guideRowToObject_(oldRow, rowNumber);
    ensureLegacyGuideImageReference_(oldGuide);

    const failure = ensureFailureMasterEntry_(
      requireText_(p.failure, 'Failure / Symptom', 1500)
    );
    const detail = requireText_(
      p.detail,
      'วิธีแก้ไขแบบละเอียด',
      12000
    );
    const author = optionalText_(p.author, 120);

    let images = parseImagesJson_(p.imagesJson);

    if (!images.length && String(p.imageBase64 || '').trim()) {
      images = [{
        name: p.imageName || '',
        mimeType: p.imageMimeType || '',
        base64: p.imageBase64 || ''
      }];
    }

    if (String(p.removeImage || '') === 'true') {
      deleteGuideImages_(oldGuide.guideId);
    }

    if (images.length) {
      newlySaved = saveGuideImages_(oldGuide.guideId, images);
    }

    const currentImages = getFailureGuideImagesMap_()
      .get(oldGuide.guideId) || [];

    const mainImage = currentImages[0] || {
      imageFileId: '',
      imageUrl: '',
      imageName: ''
    };

    const updatedDate = Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      'dd/MM/yyyy'
    );
    const updatedTime = Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      'HH:mm:ss'
    );

    const newGuide = {
      ...oldGuide,
      failure: failure,
      failureKey: normalizeFailureKey_(failure),
      detail: detail,
      author: author,
      imageFileId: mainImage.imageFileId || '',
      imageUrl: mainImage.imageUrl || '',
      imageName: mainImage.imageName || '',
      updatedDate: updatedDate,
      updatedTime: updatedTime,
      rootCause: optionalText_(p.rootCause, 5000),
      checkPoint: optionalText_(p.checkPoint, 5000),
      expectedValue: optionalText_(p.expectedValue, 5000),
      verification: optionalText_(p.verification, 5000),
      toolEquipment: optionalText_(p.toolEquipment, 500),
      relatedModel: optionalText_(p.relatedModel, 500),
      relatedStation: optionalText_(p.relatedStation, 500)
    };

    sh.getRange(
      rowNumber,
      1,
      1,
      FAILURE_GUIDE_HEADERS.length
    ).setValues([[
      clean_(newGuide.guideId),
      clean_(newGuide.failureKey),
      clean_(newGuide.failure),
      clean_(newGuide.detail),
      clean_(newGuide.author),
      clean_(newGuide.date),
      clean_(newGuide.time),
      clean_(newGuide.imageFileId),
      clean_(newGuide.imageUrl),
      clean_(newGuide.imageName),
      clean_(newGuide.updatedDate),
      clean_(newGuide.updatedTime),
      clean_(newGuide.rootCause),
      clean_(newGuide.checkPoint),
      clean_(newGuide.expectedValue),
      clean_(newGuide.verification),
      clean_(newGuide.toolEquipment),
      clean_(newGuide.relatedModel),
      clean_(newGuide.relatedStation)
    ]]);

    SpreadsheetApp.flush();

    appendAudit_(
      actorValue || 'Admin',
      'UPDATE_GUIDE',
      'FAILURE_GUIDE',
      oldGuide.guideId,
      oldGuide,
      newGuide,
      'Admin'
    );

    return {
      guideId: oldGuide.guideId,
      updated: true,
      addedImages: newlySaved.length
    };

  } catch (err) {
    newlySaved.forEach(image => {
      if (image.imageFileId) {
        trashRepairImageSafely_(image.imageFileId);
      }
    });

    throw err;

  } finally {
    lock.releaseLock();
  }
}


function adminDeleteFailureGuide_(p, actorValue) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sh = ensureFailureGuideSheet_(ss);
    const rowNumber = findFailureGuideRow_(sh, p.guideId);

    const row = sh.getRange(
      rowNumber,
      1,
      1,
      FAILURE_GUIDE_HEADERS.length
    ).getDisplayValues()[0];

    const guide = guideRowToObject_(row, rowNumber);
    ensureLegacyGuideImageReference_(guide);

    sh.deleteRow(rowNumber);
    const deletedImages = deleteGuideImages_(guide.guideId);
    SpreadsheetApp.flush();

    appendAudit_(
      actorValue || 'Admin',
      'DELETE_GUIDE',
      'FAILURE_GUIDE',
      guide.guideId,
      guide,
      null,
      'Admin'
    );

    return {
      guideId: guide.guideId,
      deleted: true,
      deletedImages: deletedImages
    };

  } finally {
    lock.releaseLock();
  }
}


function adminMergeFailure_(sourceValue, targetValue, actorValue) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const source = requireText_(sourceValue, 'Source Failure', 1500);
    const target = ensureFailureMasterEntry_(
      requireText_(targetValue, 'Target Failure', 1500)
    );

    const maps = getFailureResolverMaps_();
    const sourceCanonical = resolveCanonicalFailureWithMaps_(source, maps);
    const sourceKey = normalizeFailureKey_(sourceCanonical);
    const rawSourceKey = normalizeFailureKey_(source);
    const targetKey = normalizeFailureKey_(target);

    if (sourceKey === targetKey || rawSourceKey === targetKey) {
      throw new Error('Source และ Target เป็น Failure เดียวกันอยู่แล้ว');
    }

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const repair = ss.getSheetByName(CONFIG.REPAIR_SHEET);
    let repairRows = 0;

    if (repair && repair.getLastRow() >= 2) {
      const lastCol = Math.max(
        repair.getLastColumn(),
        CANONICAL_HEADERS.length
      );

      const rows = repair.getRange(
        2,
        1,
        repair.getLastRow() - 1,
        lastCol
      ).getDisplayValues();

      rows.forEach((row, index) => {
        const record = parseRepairRow_(row, index + 2);
        const rawKey = normalizeFailureKey_(record.failure);
        const resolvedKey = normalizeFailureKey_(
          resolveCanonicalFailureWithMaps_(record.failure, maps)
        );

        if (rawKey !== rawSourceKey && resolvedKey !== sourceKey) {
          return;
        }

        record.failure = target;

        repair.getRange(index + 2, 1, 1, lastCol).clearContent();
        repair.getRange(
          index + 2,
          1,
          1,
          CANONICAL_HEADERS.length
        ).setValues([recordToCanonicalRow_(record)]);

        repairRows++;
      });
    }

    const guide = ensureFailureGuideSheet_(ss);
    let guideRows = 0;

    if (guide.getLastRow() >= 2) {
      const rows = guide.getRange(
        2,
        1,
        guide.getLastRow() - 1,
        FAILURE_GUIDE_HEADERS.length
      ).getDisplayValues();

      rows.forEach((row, index) => {
        const item = guideRowToObject_(row, index + 2);
        const rawKey = normalizeFailureKey_(item.failure);
        const resolvedKey = normalizeFailureKey_(
          resolveCanonicalFailureWithMaps_(item.failure, maps)
        );

        if (rawKey !== rawSourceKey && resolvedKey !== sourceKey) {
          return;
        }

        guide.getRange(index + 2, 2, 1, 2).setValues([[
          clean_(targetKey),
          clean_(target)
        ]]);

        guideRows++;
      });
    }

    addFailureAlias_(sourceCanonical, target);

    if (rawSourceKey !== sourceKey) {
      addFailureAlias_(source, target);
    }

    markFailureMasterMerged_(sourceCanonical, target);

    const alias = ensureFailureAliasSheet_(ss);

    if (alias.getLastRow() >= 2) {
      const rows = alias.getRange(
        2,
        1,
        alias.getLastRow() - 1,
        FAILURE_ALIAS_HEADERS.length
      ).getDisplayValues();

      rows.forEach((row, index) => {
        if (normalizeFailureKey_(row[2]) === sourceKey) {
          alias.getRange(index + 2, 3, 1, 2).setValues([[
            clean_(target),
            clean_(targetKey)
          ]]);
        }
      });
    }

    rebuildFailureSummary_();
    SpreadsheetApp.flush();

    appendAudit_(
      actorValue || 'Admin',
      'MERGE_FAILURE',
      'FAILURE_MASTER',
      sourceCanonical,
      { source: sourceCanonical },
      {
        target: target,
        repairRows: repairRows,
        guideRows: guideRows
      },
      'Admin'
    );

    return {
      source: sourceCanonical,
      target: target,
      repairRows: repairRows,
      guideRows: guideRows
    };

  } finally {
    lock.releaseLock();
  }
}


/* =========================================================
   MODEL
========================================================= */

function getModels_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  let sh = ss.getSheetByName(
    CONFIG.MODEL_SHEET
  );

  if (!sh) {
    sh = ss.insertSheet(
      CONFIG.MODEL_SHEET
    );

    sh.getRange('A1').setValue('Model');
  }

  const lastRow = sh.getLastRow();

  if (lastRow < 2) return [];

  return Array.from(
    new Set(
      sh.getRange(
        2,
        1,
        lastRow - 1,
        1
      ).getDisplayValues()
        .flat()
        .map(v => String(v || '').trim())
        .filter(Boolean)
    )
  ).sort((a, b) =>
    a.localeCompare(
      b,
      undefined,
      {
        numeric: true,
        sensitivity: 'base'
      }
    )
  );
}


function addModelIfNew_(ss, modelValue) {
  const model = String(
    modelValue || ''
  ).trim();

  if (!model) return;

  let sh = ss.getSheetByName(
    CONFIG.MODEL_SHEET
  );

  if (!sh) {
    sh = ss.insertSheet(
      CONFIG.MODEL_SHEET
    );

    sh.getRange('A1').setValue('Model');
  }

  const lastRow = sh.getLastRow();

  if (lastRow < 2) {
    sh.getRange(2, 1)
      .setValue(model);

    return;
  }

  const existing = sh.getRange(
    2,
    1,
    lastRow - 1,
    1
  ).getDisplayValues()
    .flat()
    .map(
      v =>
        String(v || '')
          .trim()
          .toLowerCase()
    );

  if (
    !existing.includes(
      model.toLowerCase()
    )
  ) {
    sh.getRange(
      lastRow + 1,
      1
    ).setValue(model);
  }
}


/* =========================================================
   IMAGE
========================================================= */

function saveImageIfProvided_(repairId, p) {
  const base64 = String(
    p.imageBase64 || ''
  ).trim();

  if (!base64) {
    return {
      fileId: '',
      url: '',
      name: ''
    };
  }

  const mimeType = String(
    p.imageMimeType || ''
  ).trim();

  const originalName = String(
    p.imageName ||
    'repair-image.jpg'
  ).trim();

  if (!mimeType.startsWith('image/')) {
    throw new Error(
      'ไฟล์แนบต้องเป็นรูปภาพ'
    );
  }

  const bytes = Utilities
    .base64Decode(base64);

  if (
    bytes.length >
    3 * 1024 * 1024
  ) {
    throw new Error(
      'รูปหลังย่อมีขนาดใหญ่เกิน 3 MB'
    );
  }

  const folder = getImageFolder_();

  const safeName = originalName
    .replace(
      /[^a-zA-Z0-9._-]+/g,
      '_'
    )
    .slice(0, 100);

  const fileName =
    repairId +
    '_' +
    (safeName || 'repair-image.jpg');

  const blob = Utilities.newBlob(
    bytes,
    mimeType,
    fileName
  );

  const file = folder.createFile(blob);

  if (CONFIG.PUBLIC_IMAGE_ACCESS) {
    try {
      file.setSharing(
        DriveApp.Access.ANYONE_WITH_LINK,
        DriveApp.Permission.VIEW
      );
    } catch (err) {
      console.log(
        'Public sharing disabled: ' +
        err.message
      );
    }
  }

  const fileId = file.getId();

  return {
    fileId: fileId,
    url: buildImageUrl_(fileId, ''),
    name: fileName
  };
}


function buildImageUrl_(fileIdValue, urlValue) {
  const fileId = String(
    fileIdValue || ''
  ).trim();

  const url = String(
    urlValue || ''
  ).trim();

  if (fileId) {
    return (
      'https://drive.google.com/thumbnail?id=' +
      encodeURIComponent(fileId) +
      '&sz=w1000'
    );
  }

  return url;
}


function getImageData_(fileIdValue) {
  const fileId = String(
    fileIdValue || ''
  ).trim();

  if (!isDriveFileId_(fileId)) {
    return {
      ok: false,
      error: 'Invalid Image File ID'
    };
  }

  const file = getRepairImageFileSafely_(fileId);

  const blob = file.getBlob();
  const mime =
    blob.getContentType() ||
    'image/jpeg';

  const bytes = blob.getBytes();

  if (
    bytes.length >
    4 * 1024 * 1024
  ) {
    return {
      ok: false,
      error: 'Image too large for web preview'
    };
  }

  return {
    ok: true,
    fileId: fileId,
    name: file.getName(),
    dataUrl:
      'data:' +
      mime +
      ';base64,' +
      Utilities.base64Encode(bytes)
  };
}


function getRepairImageFileSafely_(fileIdValue) {
  const fileId = String(
    fileIdValue || ''
  ).trim();

  if (!isDriveFileId_(fileId)) {
    throw new Error('Invalid Image File ID');
  }

  const file = DriveApp.getFileById(fileId);
  const repairFolderId = getImageFolder_().getId();
  const parents = file.getParents();

  let allowed = false;

  while (parents.hasNext()) {
    const parent = parents.next();

    if (parent.getId() === repairFolderId) {
      allowed = true;
      break;
    }
  }

  if (!allowed) {
    throw new Error(
      'Image file is outside ATS1_Repair_Images folder'
    );
  }

  return file;
}


function trashRepairImageSafely_(fileIdValue) {
  try {
    const file = getRepairImageFileSafely_(fileIdValue);
    file.setTrashed(true);
    return true;

  } catch (err) {
    console.log(
      'Cannot trash repair image: ' +
      err.message
    );

    return false;
  }
}


function getExistingImageFolderInfo_() {
  const configuredId = String(
    CONFIG.DRIVE_FOLDER_ID || ''
  ).trim();

  const savedId = configuredId ||
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'ATS1_REPAIR_IMAGE_FOLDER_ID'
      ) ||
    '';

  if (!savedId) {
    return {
      ready: false,
      id: '',
      url: ''
    };
  }

  try {
    const folder = DriveApp.getFolderById(
      savedId
    );

    return {
      ready: true,
      id: folder.getId(),
      url: folder.getUrl()
    };

  } catch (err) {
    return {
      ready: false,
      id: savedId,
      url: ''
    };
  }
}


function getImageFolder_() {
  const configuredId = String(
    CONFIG.DRIVE_FOLDER_ID || ''
  ).trim();

  if (configuredId) {
    return DriveApp
      .getFolderById(configuredId);
  }

  const props =
    PropertiesService
      .getScriptProperties();

  const savedId = props.getProperty(
    'ATS1_REPAIR_IMAGE_FOLDER_ID'
  );

  if (savedId) {
    try {
      return DriveApp
        .getFolderById(savedId);
    } catch (err) {
      props.deleteProperty(
        'ATS1_REPAIR_IMAGE_FOLDER_ID'
      );
    }
  }

  const folder = DriveApp.createFolder(
    'ATS1_Repair_Images'
  );

  props.setProperty(
    'ATS1_REPAIR_IMAGE_FOLDER_ID',
    folder.getId()
  );

  return folder;
}


/* =========================================================
   TIME / CLEAN / OUTPUT
========================================================= */

function calculateRepairMinutes_(start, finish) {
  const s = normalizeHHMM_(start);
  const f = normalizeHHMM_(finish);

  if (!s || !f) {
    throw new Error(
      'รูปแบบเวลาเริ่มซ่อมหรือซ่อมเสร็จไม่ถูกต้อง'
    );
  }

  const sp = s.split(':').map(Number);
  const fp = f.split(':').map(Number);

  const startMin =
    sp[0] * 60 + sp[1];

  let finishMin =
    fp[0] * 60 + fp[1];

  if (finishMin < startMin) {
    finishMin += 24 * 60;
  }

  return finishMin - startMin;
}


function clean_(value) {
  let s = String(value || '').trim();

  if (/^[=+\-@]/.test(s)) {
    s = "'" + s;
  }

  return s;
}


function safeCallback_(name) {
  const s = String(name || '');

  return /^[A-Za-z_$][0-9A-Za-z_$]*$/
    .test(s)
    ? s
    : '';
}


function output_(data, callback) {
  const text = JSON.stringify(data);

  if (callback) {
    return ContentService
      .createTextOutput(
        callback +
        '(' +
        text +
        ');'
      )
      .setMimeType(
        ContentService
          .MimeType
          .JAVASCRIPT
      );
  }

  return ContentService
    .createTextOutput(text)
    .setMimeType(
      ContentService
        .MimeType
        .JSON
    );
}


function json_(data) {
  return ContentService
    .createTextOutput(
      JSON.stringify(data)
    )
    .setMimeType(
      ContentService
        .MimeType
        .JSON
    );
}

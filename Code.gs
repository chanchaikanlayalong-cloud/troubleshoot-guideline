/**
 * ATS1 Repair API V20
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
  TIMEZONE: 'Asia/Bangkok',
  DRIVE_FOLDER_ID: '',
  PUBLIC_IMAGE_ACCESS: true,
  ADMIN_PASSWORD: 'adminmin'
};

const API_VERSION = 'V20';

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

    } else if (action === 'imageData') {
      data = getImageData_(p.fileId);

    } else if (action === 'adminOpStatus') {
      data = getAdminOperationStatus_(p.opId);

    } else if (action === 'health') {
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sh = ss.getSheetByName(CONFIG.REPAIR_SHEET);
      const folderInfo = getExistingImageFolderInfo_();

      data = {
        ok: true,
        apiVersion: API_VERSION,
        message: 'ATS1 Repair API ' + API_VERSION + ' is running',
        rowCount: sh ? Math.max(0, sh.getLastRow() - 1) : 0,
        imageFolderReady: folderInfo.ready,
        imageFolderId: folderInfo.id,
        imageFolderUrl: folderInfo.url
      };

    } else {
      data = { ok: false, error: 'Unknown action' };
    }

    return output_(data, callback);

  } catch (err) {
    return output_(
      { ok: false, error: String(err.message || err), apiVersion: API_VERSION },
      safeCallback_((e && e.parameter && e.parameter.callback) || '')
    );
  }
}


function doPost(e) {
  const p = (e && e.parameter) || {};
  const action = String(p.action || '');
  const opId = String(p.opId || '').trim();

  try {
    let result;

    if (action === 'save') {
      const required = [
        'model',
        'station',
        'failure',
        'repairAction',
        'startRepair',
        'finishRepair',
        'repairBy'
      ];

      for (const key of required) {
        if (!String(p[key] || '').trim()) {
          throw new Error('Missing field: ' + key);
        }
      }

      result = {
        ok: true,
        ...saveRecord_(p)
      };

      if (opId) saveAdminOperationStatus_(opId, result);
      return json_(result);
    }

    if (action === 'adminUpdate') {
      verifyAdminPassword_(p.adminPassword);

      result = {
        ok: true,
        ...adminUpdateRecord_(p)
      };

      if (opId) saveAdminOperationStatus_(opId, result);
      return json_(result);
    }

    if (action === 'adminDelete') {
      verifyAdminPassword_(p.adminPassword);

      result = {
        ok: true,
        ...adminDeleteRecord_(p)
      };

      if (opId) saveAdminOperationStatus_(opId, result);
      return json_(result);
    }

    if (action === 'adminNormalizeAll') {
      verifyAdminPassword_(p.adminPassword);

      result = {
        ok: true,
        ...adminNormalizeAll_()
      };

      if (opId) saveAdminOperationStatus_(opId, result);
      return json_(result);
    }

    throw new Error('Unknown action: ' + action);

  } catch (err) {
    const result = {
      ok: false,
      error: String(err.message || err),
      apiVersion: API_VERSION
    };

    if (
      opId &&
      ['save', 'adminUpdate', 'adminDelete', 'adminNormalizeAll'].includes(action)
    ) {
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

function saveRecord_(p) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = ss.getSheetByName(CONFIG.REPAIR_SHEET);

  if (!sh) {
    throw new Error('ไม่พบชีต ' + CONFIG.REPAIR_SHEET);
  }

  ensureCanonicalHeader_(sh);

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

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
      throw new Error(
        'เวลาเริ่มซ่อมหรือซ่อมเสร็จไม่ถูกต้อง'
      );
    }

    const model = requireText_(p.model, 'Model', 120);
    const station = requireText_(p.station, 'Station', 120);
    const failure = requireText_(p.failure, 'Failure / Symptom', 1500);
    const repairAction = requireText_(p.repairAction, 'Repair Action', 5000);
    const repairBy = requireText_(p.repairBy, 'คนทำ', 120);

    image = saveImageIfProvided_(
      repairId,
      p
    );

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
      repairTime: calculateRepairMinutes_(
        startRepair,
        finishRepair
      ),
      repairBy: repairBy,
      imageFileId: image.fileId,
      imageUrl: image.url,
      imageName: image.name
    };

    sh.appendRow(
      recordToCanonicalRow_(record)
    );

    addModelIfNew_(ss, model);
    SpreadsheetApp.flush();

    return {
      repairId: repairId,
      imageFileId: image.fileId || ''
    };

  } catch (err) {
    // ถ้า Upload รูปสำเร็จ แต่บันทึก Sheet ล้มเหลว
    // ให้ลบรูปค้างออก เพื่อไม่เกิด orphan file.
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

function verifyAdminPassword_(password) {
  if (
    String(password || '') !==
    CONFIG.ADMIN_PASSWORD
  ) {
    throw new Error(
      'Admin password ไม่ถูกต้อง'
    );
  }
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


function adminUpdateRecord_(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sh = ss.getSheetByName(CONFIG.REPAIR_SHEET);

    if (!sh) {
      throw new Error('ไม่พบชีต ' + CONFIG.REPAIR_SHEET);
    }

    ensureCanonicalHeader_(sh);

    const rowNumber = findRowByRepairId_(
      sh,
      p.repairId
    );

    const lastCol = Math.max(
      sh.getLastColumn(),
      CANONICAL_HEADERS.length
    );

    const oldRow = sh.getRange(
      rowNumber,
      1,
      1,
      lastCol
    ).getDisplayValues()[0];

    const oldRecord = parseRepairRow_(
      oldRow,
      rowNumber
    );

    const date = normalizeDateText_(p.date);
    const recordTime = normalizeHHMMSS_(p.time);

    if (!date) {
      throw new Error(
        'วันที่ต้องเป็นรูปแบบ dd/MM/yyyy และเป็นวันที่จริง'
      );
    }

    if (!recordTime) {
      throw new Error(
        'เวลาบันทึกต้องเป็นรูปแบบ HH:mm:ss'
      );
    }

    const startRepair = normalizeHHMM_(p.startRepair);
    const finishRepair = normalizeHHMM_(p.finishRepair);

    if (!startRepair || !finishRepair) {
      throw new Error(
        'เวลาเริ่มซ่อมและซ่อมเสร็จต้องเป็น HH:mm'
      );
    }

    const model = requireText_(p.model, 'Model', 120);
    const station = requireText_(p.station, 'Station', 120);
    const failure = requireText_(p.failure, 'Failure / Symptom', 1500);
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
      repairTime: calculateRepairMinutes_(
        startRepair,
        finishRepair
      ),
      repairBy: repairBy,
      imageFileId: fileId,
      imageUrl: imageUrl,
      imageName: imageName
    };

    sh.getRange(
      rowNumber,
      1,
      1,
      lastCol
    ).clearContent();

    sh.getRange(
      rowNumber,
      1,
      1,
      CANONICAL_HEADERS.length
    ).setValues([
      recordToCanonicalRow_(record)
    ]);

    addModelIfNew_(ss, record.model);
    SpreadsheetApp.flush();

    // Trash หลัง Sheet commit เท่านั้น เพื่อไม่ให้ Sheet อ้างถึงรูปที่ถูกลบ
    // ในกรณี Sheet write ล้มเหลว.
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

function adminDeleteRecord_(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sh = ss.getSheetByName(CONFIG.REPAIR_SHEET);

    if (!sh) {
      throw new Error('ไม่พบชีต ' + CONFIG.REPAIR_SHEET);
    }

    const rowNumber = findRowByRepairId_(
      sh,
      p.repairId
    );

    const lastCol = Math.max(
      sh.getLastColumn(),
      CANONICAL_HEADERS.length
    );

    const row = sh.getRange(
      rowNumber,
      1,
      1,
      lastCol
    ).getDisplayValues()[0];

    const record = parseRepairRow_(
      row,
      rowNumber
    );

    sh.deleteRow(rowNumber);
    SpreadsheetApp.flush();

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

function adminNormalizeAll_() {
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

    const parsed = rows.map(
      (row, index) =>
        parseRepairRow_(row, index + 2)
    );

    const valid = parsed.filter(
      r => String(r.repairId || '').trim()
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

    // Backup ก่อนเขียนทับข้อมูลเก่า
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
      ).setValues(
        valid.map(recordToCanonicalRow_)
      );
    }

    SpreadsheetApp.flush();

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
  return (
    'ADMIN_OP_' +
    String(opId || '').trim()
  );
}


function saveAdminOperationStatus_(opId, result) {
  const id = String(opId || '').trim();

  if (
    !/^[A-Za-z0-9_-]{8,120}$/.test(id)
  ) {
    throw new Error('Invalid operation ID');
  }

  cleanupOldOperationStatuses_();

  PropertiesService
    .getScriptProperties()
    .setProperty(
      adminOpKey_(id),
      JSON.stringify({
        ...result,
        apiVersion: API_VERSION,
        timestamp: new Date().toISOString()
      })
    );
}


function getAdminOperationStatus_(opId) {
  const id = String(opId || '').trim();

  if (
    !/^[A-Za-z0-9_-]{8,120}$/.test(id)
  ) {
    return {
      ok: false,
      pending: false,
      error: 'Invalid operation ID',
      apiVersion: API_VERSION
    };
  }

  const text = PropertiesService
    .getScriptProperties()
    .getProperty(
      adminOpKey_(id)
    );

  if (!text) {
    return {
      ok: true,
      pending: true,
      apiVersion: API_VERSION
    };
  }

  try {
    return {
      pending: false,
      ...JSON.parse(text)
    };

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
  const props = PropertiesService
    .getScriptProperties();

  const all = props.getProperties();
  const now = Date.now();
  const maxAgeMs = 10 * 60 * 1000;

  Object.keys(all).forEach(key => {
    if (!key.startsWith('ADMIN_OP_')) return;

    try {
      const data = JSON.parse(all[key]);
      const time = Date.parse(data.timestamp || '');

      if (
        !Number.isFinite(time) ||
        now - time > maxAgeMs
      ) {
        props.deleteProperty(key);
      }

    } catch (err) {
      props.deleteProperty(key);
    }
  });
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

const FRONTEND_VERSION = 'V22.6';
const REQUIRED_BACKEND_VERSION = 'V22.2';

const HISTORY_DISPLAY_ORDER = Object.freeze([
  "failure",
  "repairAction",
  "image",
  "model",
  "station",
  "startRepair",
  "finishRepair",
  "repairTime",
  "repairBy",
  "repairId"
]);

const HISTORY_RECORD_REQUIRED_FIELDS = Object.freeze([
  "failure",
  "repairAction",
  "imageFileId",
  "imageUrl",
  "imageName",
  "model",
  "station",
  "startRepair",
  "finishRepair",
  "repairTime",
  "repairBy",
  "repairId"
]);
let APP_CONFIG = null;
let GAS_URL = "";
let allRecords = [];
let selectedImage = null;
let adminLoggedIn = false;
let adminSessionUser = "";
let adminSessionPassword = "";
let adminSelectedRepairId = "";
let activeFailureName = "";
let currentFailureGuides = [];
let currentFailureCount = 0;
let selectedFailureGuideImage = null;
let allFailureGuides = [];
let adminSelectedGuideId = "";
let adminGuideNewImage = null;

const $ = (s) => document.querySelector(s);

document.addEventListener("DOMContentLoaded", async () => {
  bindRepairTime();
  bindImageUpload();
  bindImageModal();
  bindTabs();
  bindForm();
  bindHistory();
  bindDashboard();
  bindAdmin();
  bindFailureGuide();

  try {
    await loadConfig();
  } catch (err) {
    console.error(err);
    setStatus("โหลด config ไม่สำเร็จ", false);
    toast("ไม่พบหรืออ่าน config.json ไม่ได้", "error");
    fillModelFallback();
    return;
  }

  if (!isConfigured()) {
    setStatus("ยังไม่ได้ตั้งค่า API", false);
    toast("กรุณาใส่ Apps Script URL ใน config.json", "error");
    fillModelFallback();
    return;
  }

  await refreshAllData();
  initializeDashboardDefaults();
  renderDashboard();
});

async function loadConfig() {
  const res = await fetch("./config.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Config HTTP " + res.status);

  APP_CONFIG = await res.json();
  GAS_URL = String(APP_CONFIG.GAS_URL || "").trim();

  if (APP_CONFIG.APP_NAME) {
    document.title = APP_CONFIG.APP_NAME;
  }

  if (APP_CONFIG.DEFAULT_STATION && $("#station")) {
    $("#station").value = APP_CONFIG.DEFAULT_STATION;
  }
}

function isConfigured() {
  return GAS_URL &&
    GAS_URL.startsWith("https://script.google.com/") &&
    GAS_URL.includes("/exec");
}

function bindRepairTime() {
  const start = $("#startRepair");
  const finish = $("#finishRepair");

  const calc = () => {
    const minutes = calculateRepairMinutes(start.value, finish.value);
    $("#repairTime").value = minutes === null ? "" : String(minutes);
  };

  start.addEventListener("change", calc);
  start.addEventListener("input", calc);
  finish.addEventListener("change", calc);
  finish.addEventListener("input", calc);
}

function calculateRepairMinutes(start, finish) {
  const parseHHMM = value => {
    const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    const hour = Number(match[1]);
    const minute = Number(match[2]);

    if (
      !Number.isInteger(hour) ||
      !Number.isInteger(minute) ||
      hour < 0 || hour > 23 ||
      minute < 0 || minute > 59
    ) {
      return null;
    }

    return hour * 60 + minute;
  };

  const startMin = parseHHMM(start);
  let finishMin = parseHHMM(finish);

  if (startMin === null || finishMin === null) return null;

  // ถ้าเวลาสิ้นสุดน้อยกว่าเวลาเริ่ม ถือว่าซ่อมข้ามเที่ยงคืน
  if (finishMin < startMin) finishMin += 24 * 60;

  return finishMin - startMin;
}

function bindImageUpload() {
  $("#repairImage").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];

    if (!file) {
      clearSelectedImage();
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast("กรุณาเลือกไฟล์รูปภาพ", "error");
      clearSelectedImage();
      return;
    }

    try {
      toast("กำลังเตรียมรูป...", "");
      selectedImage = await compressImage(file);

      $("#imagePreview").src = selectedImage.dataUrl;
      $("#imagePreviewWrap").classList.remove("hidden");
      toast("รูปพร้อมบันทึก", "success");
    } catch (err) {
      console.error(err);
      clearSelectedImage();
      toast("อ่านหรือย่อรูปไม่สำเร็จ", "error");
    }
  });

  $("#removeImageBtn").addEventListener("click", clearSelectedImage);
}

function clearSelectedImage() {
  selectedImage = null;
  $("#repairImage").value = "";
  $("#imagePreview").removeAttribute("src");
  $("#imagePreviewWrap").classList.add("hidden");
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        const maxDimension = 1000;
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.72;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);

        // ลดคุณภาพเพิ่มถ้ารูปหลังย่อยังใหญ่ เพื่อให้ส่งผ่าน Apps Script ได้คล่อง
        while (dataUrl.length > 900_000 && quality > 0.42) {
          quality -= 0.08;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }

        if (dataUrl.length > 1_400_000) {
          reject(new Error("รูปหลังย่อยังใหญ่เกินไป"));
          return;
        }

        resolve({
          name: normalizeImageName(file.name),
          mimeType: "image/jpeg",
          dataUrl,
          base64: dataUrl.split(",")[1]
        });
      };

      img.onerror = reject;
      img.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function normalizeImageName(name) {
  const base = String(name || "repair-image")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 80);

  return (base || "repair-image") + ".jpg";
}

function bindImageModal() {
  $("#closeImageModal").addEventListener("click", closeImageModal);
  $("#imageModalBackdrop").addEventListener("click", closeImageModal);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    const modal = $("#imageModal");

    if (modal && !modal.classList.contains("hidden")) {
      // ถ้ารูปขยายเปิดอยู่ ให้ Esc ปิดเฉพาะรูปก่อน
      // และไม่ส่ง Event ต่อไปปิด Failure Detail Modal พร้อมกัน
      e.stopImmediatePropagation();
      closeImageModal();
    }
  });
}

async function openImageModal(url, name, fileId) {
  const modalImage = $("#modalImage");
  modalImage.onerror = null;

  const id = normalizeDriveFileId(fileId) || extractDriveFileId(url);
  let resolvedUrl = id ? buildDriveThumbnailUrl(id) : String(url || "").trim();

  if (!resolvedUrl && !id) {
    toast("ไม่พบ Image File ID / Image URL ของรายการนี้", "error");
    return;
  }

  $("#modalImageName").textContent = name || "";

  const driveLink = $("#openDriveImage");
  if (id) {
    driveLink.href = buildDriveViewUrl(id);
    driveLink.classList.remove("hidden");
  } else {
    driveLink.removeAttribute("href");
    driveLink.classList.add("hidden");
  }

  $("#imageModal").classList.remove("hidden");
  $("#imageModal").setAttribute("aria-hidden", "false");

  modalImage.src = resolvedUrl || "";

  if (id) {
    modalImage.onerror = async () => {
      modalImage.onerror = null;

      try {
        const dataUrl = await getDriveImageData(id);
        modalImage.src = dataUrl;
      } catch (err) {
        console.error(err);
        toast("โหลดรูปไม่ได้ กรุณาตรวจ Image File ID / Drive permission", "error");
      }
    };
  }
}

function closeImageModal() {
  $("#imageModal").classList.add("hidden");
  $("#imageModal").setAttribute("aria-hidden", "true");

  const modalImage = $("#modalImage");
  modalImage.onerror = null;
  modalImage.removeAttribute("src");
}


function normalizeDriveFileId(value) {
  const id = String(value || "").trim();

  // Google Drive file IDs normally contain letters, digits, _ and -
  if (!id || !/^[A-Za-z0-9_-]{10,}$/.test(id)) return "";

  return id;
}

function extractDriveFileId(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const patterns = [
    /\/file\/d\/([A-Za-z0-9_-]{10,})/i,
    /[?&]id=([A-Za-z0-9_-]{10,})/i,
    /\/thumbnail\?id=([A-Za-z0-9_-]{10,})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) return match[1];
  }

  return "";
}

function buildDriveThumbnailUrl(fileId) {
  const id = normalizeDriveFileId(fileId);
  return id
    ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1200`
    : "";
}

function buildDriveViewUrl(fileId) {
  const id = normalizeDriveFileId(fileId);
  return id
    ? `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`
    : "";
}

function resolveRecordImage(record) {
  const rawUrl = String(record?.imageUrl || "").trim();

  let fileId =
    normalizeDriveFileId(record?.imageFileId) ||
    extractDriveFileId(rawUrl);

  const thumbnailUrl = fileId
    ? buildDriveThumbnailUrl(fileId)
    : rawUrl;

  return {
    fileId,
    thumbnailUrl,
    driveUrl: fileId ? buildDriveViewUrl(fileId) : "",
    name: String(record?.imageName || "").trim()
  };
}


async function getDriveImageData(fileId) {
  const id = normalizeDriveFileId(fileId);
  if (!id) throw new Error("Invalid Image File ID");

  const res = await jsonp("imageData", { fileId: id });

  if (!res.ok || !res.dataUrl) {
    throw new Error(res.error || "โหลดรูปผ่าน Apps Script ไม่สำเร็จ");
  }

  return res.dataUrl;
}

async function loadHistoryImageFallback(img) {
  const id =
    normalizeDriveFileId(img.dataset.fileid) ||
    extractDriveFileId(img.dataset.url);

  if (!id) {
    img.style.display = "none";
    const span = document.createElement("span");
    span.className = "no-image";
    span.textContent = "ไม่พบ Image File ID";
    img.parentElement.appendChild(span);
    return;
  }

  try {
    const dataUrl = await getDriveImageData(id);
    img.onerror = null;
    img.src = dataUrl;
    img.dataset.url = dataUrl;
    img.style.display = "";
  } catch (err) {
    console.error(err);
    img.style.display = "none";

    const a = document.createElement("a");
    a.textContent = "เปิดรูปใน Google Drive";
    a.target = "_blank";
    a.rel = "noopener";
    a.href = buildDriveViewUrl(id);
    img.parentElement.appendChild(a);
  }
}

function bindTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
      document.querySelectorAll(".page").forEach(x => x.classList.remove("active"));

      btn.classList.add("active");
      $("#" + btn.dataset.page).classList.add("active");

      if (btn.dataset.page === "historyPage" && isConfigured()) {
        refreshAllData();
      }

      if (btn.dataset.page === "dashboardPage") {
        refreshAllData();
      }

      if (btn.dataset.page === "adminPage" && adminLoggedIn) {
        refreshAllData();
      }
    });
  });
}

function bindForm() {
  $("#cancelBtn").addEventListener("click", () => {
    if (confirm("ต้องการยกเลิกและล้างข้อมูลที่กรอกหรือไม่?")) {
      resetForm();
    }
  });

  $("#repairForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!isConfigured()) {
      toast("ยังไม่ได้ตั้งค่า Apps Script URL", "error");
      return;
    }

    if (!e.target.reportValidity()) return;

    const start = $("#startRepair").value;
    const finish = $("#finishRepair").value;
    const repairTime = calculateRepairMinutes(start, finish);

    if (repairTime === null) {
      toast("กรุณาเลือกเวลาเริ่มซ่อมและเวลาซ่อมเสร็จ", "error");
      return;
    }

    const saveBtn = $("#saveBtn");
    saveBtn.disabled = true;
    saveBtn.textContent = selectedImage ? "กำลัง Upload รูปและบันทึก..." : "กำลังบันทึก...";

    try {
      const result = await sendSaveOperation({
        model: $("#model").value.trim(),
        station: $("#station").value.trim(),
        failure: $("#failure").value.trim(),
        repairAction: $("#repairAction").value.trim(),
        startRepair: start,
        finishRepair: finish,
        repairTime: String(repairTime),
        repairBy: $("#repairBy").value.trim(),
        imageName: selectedImage ? selectedImage.name : "",
        imageMimeType: selectedImage ? selectedImage.mimeType : "",
        imageBase64: selectedImage ? selectedImage.base64 : ""
      });

      resetForm();

      await waitForRecordState(
        result.repairId,
        record => Boolean(record)
      );

      toast(
        `บันทึกเรียบร้อย ${result.repairId || ""}`.trim(),
        "success"
      );

    } catch (err) {
      console.error(err);
      toast(
        err.message || "บันทึกไม่สำเร็จ กรุณาตรวจสอบ Apps Script",
        "error"
      );
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "บันทึก";
    }
  });
}

function resetForm() {
  const model = $("#model").value;
  const station = APP_CONFIG?.DEFAULT_STATION || "";

  $("#repairForm").reset();
  $("#model").value = model;
  $("#station").value = station;
  $("#startRepair").value = "";
  $("#finishRepair").value = "";
  $("#repairTime").value = "";
  clearSelectedImage();
}

function bindHistory() {
  $("#refreshBtn").addEventListener("click", async () => {
    await refreshAllData({ showToast: true });
  });

  $("#searchBox").addEventListener("input", renderHistory);
  $("#filterModel").addEventListener("change", renderHistory);

  $("#exportHistoryExcelBtn").addEventListener(
    "click",
    exportCurrentHistoryExcel
  );

  $("#exportFailureGuideExcelBtn").addEventListener(
    "click",
    exportFailureGuidesExcel
  );
}

function jsonp(action, extra = {}) {
  return new Promise((resolve, reject) => {
    const callbackName =
      "__repair_cb_" + Date.now() + "_" + Math.floor(Math.random() * 1000000);

    const script = document.createElement("script");
    script.async = true;

    const params = new URLSearchParams({
      action,
      callback: callbackName,
      ...extra
    });

    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Request timeout: ${action}`));
    }, 15000);

    function cleanup() {
      clearTimeout(timer);

      try {
        delete window[callbackName];
      } catch (_) {
        window[callbackName] = undefined;
      }

      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }

    window[callbackName] = data => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`JSONP request failed: ${action}`));
    };

    script.src = GAS_URL + "?" + params.toString();
    document.head.appendChild(script);
  });
}

async function loadModels() {
  try {
    const res = await jsonp("models");

    if (!res.ok) throw new Error(res.error || "โหลด Model ไม่สำเร็จ");

    const models = uniqueSorted(
      (Array.isArray(res.models) ? res.models : [])
        .map(v => String(v || "").trim())
        .filter(Boolean)
    );

    $("#modelOptions").innerHTML =
      models.map(m => `<option value="${escAttr(m)}"></option>`).join("");

    const currentFilter = $("#filterModel").value;
    $("#filterModel").innerHTML =
      '<option value="">ทุก Model</option>' +
      models.map(m => `<option value="${escAttr(m)}">${esc(m)}</option>`).join("");

    if (models.includes(currentFilter)) {
      $("#filterModel").value = currentFilter;
    }

    setStatus("เชื่อมต่อ Google Sheet แล้ว", true);
    return true;

  } catch (err) {
    console.error(err);
    setStatus("เชื่อมต่อไม่ได้", false);
    fillModelFallback();
    return false;
  }
}

function fillModelFallback() {
  $("#modelOptions").innerHTML = "";
}


function validateHistoryRecordApi(records) {
  if (!Array.isArray(records)) {
    throw new Error("API records ต้องเป็น Array");
  }

  if (!records.length) {
    return true;
  }

  const sample = records[0];

  const missing = HISTORY_RECORD_REQUIRED_FIELDS.filter(
    field => !Object.prototype.hasOwnProperty.call(sample, field)
  );

  if (missing.length) {
    throw new Error(
      "Frontend/API field ไม่ตรงกัน: ขาด " +
      missing.join(", ")
    );
  }

  return true;
}


function validateHistoryDisplayContract(contract) {
  if (!Array.isArray(contract)) {
    return false;
  }

  if (contract.length !== HISTORY_DISPLAY_ORDER.length) {
    return false;
  }

  return contract.every(
    (field, index) =>
      String(field || "") === HISTORY_DISPLAY_ORDER[index]
  );
}


async function loadHistory() {
  if (!isConfigured()) return;

  const body = $("#historyBody");
  body.innerHTML =
    '<tr><td colspan="10" class="empty">กำลังโหลดข้อมูล...</td></tr>';

  try {
    const res = await jsonp("records");

    if (!res.ok) throw new Error(res.error || "โหลดข้อมูลไม่สำเร็จ");

    const records = Array.isArray(res.records) ? res.records : [];
    validateHistoryRecordApi(records);
    allRecords = records;
    syncHistoryModelFilterFromRecords();
    renderHistory();
    initializeDashboardOptions();
    renderDashboard();

    if (adminLoggedIn) {
      renderAdminTable();
    }

    updateLastRefreshTime();
    setStatus("เชื่อมต่อ Google Sheet แล้ว", true);
    return true;

  } catch (err) {
    console.error(err);
    body.innerHTML =
      '<tr><td colspan="10" class="empty">โหลดข้อมูลไม่สำเร็จ</td></tr>';
    setStatus("เชื่อมต่อไม่ได้", false);
    return false;
  }
}



function syncHistoryModelFilterFromRecords() {
  const select = $("#filterModel");
  if (!select) return;

  const current = select.value;

  const existing = Array.from(select.options)
    .map(option => String(option.value || "").trim())
    .filter(Boolean);

  const fromRecords = allRecords
    .map(record => String(record.model || "").trim())
    .filter(Boolean);

  const models = uniqueSorted([...existing, ...fromRecords]);

  select.innerHTML =
    '<option value="">ทุก Model</option>' +
    models
      .map(model => `<option value="${escAttr(model)}">${esc(model)}</option>`)
      .join("");

  if (models.includes(current)) {
    select.value = current;
  }
}

let refreshPromise = null;

async function refreshAllData(options = {}) {
  const { showToast = false } = options;

  if (!isConfigured()) {
    if (showToast) toast("ยังไม่ได้ตั้งค่า Apps Script URL", "error");
    return false;
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    setRefreshBusy(true);

    try {
      // ทำตามลำดับเพื่อลด race:
      // Master_Model ก่อน แล้วค่อย History ซึ่งจะ merge Model ที่มีจริงใน records
      const modelsOk = await loadModels();
      const historyOk = await loadHistory();

      const ok = modelsOk !== false && historyOk !== false;

      if (showToast) {
        toast(
          ok ? "รีเฟรชข้อมูลแล้ว" : "รีเฟรชข้อมูลไม่ครบ กรุณาลองอีกครั้ง",
          ok ? "success" : "error"
        );
      }

      return ok;

    } finally {
      setRefreshBusy(false);
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function setRefreshBusy(busy) {
  const buttons = [
    $("#refreshBtn"),
    $("#adminReloadBtn"),
    $("#dashboardRefreshBtn")
  ].filter(Boolean);

  buttons.forEach(btn => {
    if (busy) {
      if (!btn.dataset.originalText) {
        btn.dataset.originalText = btn.textContent;
      }

      btn.disabled = true;
      btn.textContent = "กำลังรีเฟรช...";

    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.originalText || "รีเฟรช";
    }
  });
}

function updateLastRefreshTime() {
  const el = $("#lastRefreshText");
  if (!el) return;

  const now = new Date();

  el.textContent =
    "รีเฟรชล่าสุด: " +
    now.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
}

async function waitForRecordState(repairId, predicate, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    await refreshAllData();

    const record = allRecords.find(
      r => String(r.repairId) === String(repairId)
    );

    if (predicate(record)) {
      return record || null;
    }

    await sleep(300 + i * 200);
  }

  return null;
}


function getCurrentHistoryFilteredRecords() {
  const q = $("#searchBox").value.trim().toLowerCase();
  const model = $("#filterModel").value;

  /*
   * History ไม่มี Model sort.
   * filterModel เป็น Filter เท่านั้น.
   *
   * allRecords มาจาก Backend ใหม่ -> เก่า ดังนั้นลำดับเดิม
   * ของ History คือ Record ใหม่สุดก่อน และ Export ใช้ลำดับเดียวกัน.
   */
  return allRecords.filter(r => {
    const modelOk = !model || String(r.model) === model;

    const blob = [
      r.repairId, r.date, r.time, r.model, r.station,
      r.failure, r.repairAction, r.startRepair, r.finishRepair,
      r.repairTime, r.repairBy, r.imageName
    ].join(" ").toLowerCase();

    return modelOk && (!q || blob.includes(q));
  });
}


function renderHistory() {
  const filtered = getCurrentHistoryFilteredRecords();

  const body = $("#historyBody");

  if (!filtered.length) {
    body.innerHTML =
      '<tr><td colspan="10" class="empty">ไม่พบข้อมูล</td></tr>';
  } else {
    body.innerHTML = filtered.map(r => {
      const image = resolveRecordImage(r);

      const imageCell = image.thumbnailUrl
        ? `<img class="history-thumb"
              src="${escAttr(image.thumbnailUrl)}"
              alt="${escAttr(image.name || "Repair image")}"
              loading="lazy"
              referrerpolicy="no-referrer"
              data-url="${escAttr(image.thumbnailUrl)}"
              data-name="${escAttr(image.name)}"
              data-fileid="${escAttr(image.fileId)}">`
        : '<span class="no-image">ไม่มีรูป</span>';

      return `
        <tr>
          <td data-label="Failure / Symptom" class="history-failure-cell">
            <button
              type="button"
              class="failure-detail-trigger failure-text-button"
              data-failure="${escAttr(r.failure)}"
              title="ดูจำนวนครั้งและวิธีแก้ไขแบบละเอียด"
            >${esc(r.failure)}</button>
          </td>
          <td data-label="Repair Action" class="history-action-cell">${esc(r.repairAction)}</td>
          <td data-label="รูป" class="history-image-cell">${imageCell}</td>
          <td data-label="Model">${esc(r.model)}</td>
          <td data-label="Station">${esc(r.station)}</td>
          <td data-label="เริ่มซ่อม">${esc(r.startRepair)}</td>
          <td data-label="ซ่อมเสร็จ">${esc(r.finishRepair)}</td>
          <td data-label="Repair Time (นาที)">${esc(r.repairTime)}</td>
          <td data-label="คนทำ">${esc(r.repairBy)}</td>
          <td data-label="Repair ID" class="history-id-cell"><strong>${esc(r.repairId)}</strong></td>
        </tr>
      `;
    }).join("");

    document.querySelectorAll(".history-thumb").forEach(img => {
      img.addEventListener("click", () => {
        openImageModal(img.dataset.url, img.dataset.name, img.dataset.fileid);
      });

      img.addEventListener("error", () => {
        loadHistoryImageFallback(img);
      }, { once: true });
    });
  }

  $("#recordCount").textContent = `${filtered.length} รายการ`;
}



/* =========================
   DASHBOARD
========================= */

function bindDashboard() {
  $("#dashboardPeriodType").addEventListener("change", () => {
    updateDashboardPeriodControl();
    renderDashboard();
  });

  $("#dashboardDay").addEventListener("change", renderDashboard);
  $("#dashboardWeek").addEventListener("change", renderDashboard);
  $("#dashboardMonth").addEventListener("change", renderDashboard);
  $("#dashboardYear").addEventListener("change", renderDashboard);
  $("#dashboardModel").addEventListener("change", renderDashboard);
  $("#dashboardStation").addEventListener("change", renderDashboard);
  $("#topFailureCount").addEventListener("change", renderDashboard);

  $("#exportDashboardExcelBtn").addEventListener(
    "click",
    exportDashboardExcel
  );

  $("#dashboardRefreshBtn").addEventListener("click", async () => {
    await refreshAllData({ showToast: true });
  });
}


/* =========================
   EXCEL EXPORT
   Excel 2003 XML (.xls)
   No external library required.
========================= */

function xmlExcelEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}


function sanitizeExcelSheetName(value) {
  const text = String(value || "Sheet")
    .replace(/[\\\/\?\*\[\]:]/g, " ")
    .trim();

  return (text || "Sheet").slice(0, 31);
}


function sanitizeExportFilePart(value) {
  return String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}


function exportTimestamp() {
  const now = new Date();

  const pad = value => String(value).padStart(2, "0");

  return (
    now.getFullYear() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    "_" +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}


function excelCellXml(value, options = {}) {
  const {
    type = "String",
    style = "Cell",
    href = ""
  } = options;

  const hrefAttr = href
    ? ` ss:HRef="${xmlExcelEscape(href)}"`
    : "";

  return (
    `<Cell ss:StyleID="${style}"${hrefAttr}>` +
      `<Data ss:Type="${type}">${xmlExcelEscape(value)}</Data>` +
    `</Cell>`
  );
}


function excelRowXml(cells) {
  return (
    "<Row>" +
    cells.map(cell => {
      if (
        cell &&
        typeof cell === "object" &&
        !Array.isArray(cell)
      ) {
        return excelCellXml(
          cell.value,
          cell
        );
      }

      return excelCellXml(cell);
    }).join("") +
    "</Row>"
  );
}


function buildExcelXmlWorkbook(worksheets) {
  const sheetsXml = worksheets.map(sheet => {
    const name = sanitizeExcelSheetName(sheet.name);

    const rowsXml = sheet.rows
      .map(excelRowXml)
      .join("");

    return `
      <Worksheet ss:Name="${xmlExcelEscape(name)}">
        <Table>
          ${rowsXml}
        </Table>
        <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
          <FreezePanes/>
          <FrozenNoSplit/>
          <SplitHorizontal>1</SplitHorizontal>
          <TopRowBottomPane>1</TopRowBottomPane>
          <ActivePane>2</ActivePane>
          <ProtectObjects>False</ProtectObjects>
          <ProtectScenarios>False</ProtectScenarios>
        </WorksheetOptions>
      </Worksheet>
    `;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">

  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Borders/>
      <Font ss:FontName="Arial" ss:Size="10"/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>

    <Style ss:ID="Cell">
      <Alignment ss:Vertical="Top" ss:WrapText="1"/>
    </Style>

    <Style ss:ID="Header">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
      <Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#1F4E78" ss:Pattern="Solid"/>
    </Style>

    <Style ss:ID="Number">
      <Alignment ss:Horizontal="Right" ss:Vertical="Top"/>
      <NumberFormat ss:Format="0"/>
    </Style>

    <Style ss:ID="Link">
      <Alignment ss:Vertical="Top" ss:WrapText="1"/>
      <Font ss:FontName="Arial" ss:Size="10" ss:Color="#0563C1" ss:Underline="Single"/>
    </Style>
  </Styles>

  ${sheetsXml}
</Workbook>`;
}


function downloadExcelWorkbook(filename, worksheets) {
  const xml = buildExcelXmlWorkbook(worksheets);

  const blob = new Blob(
    ["\ufeff", xml],
    {
      type:
        "application/vnd.ms-excel;charset=utf-8"
    }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(
    () => URL.revokeObjectURL(url),
    1500
  );
}


function currentHistoryExportContext() {
  return {
    search: $("#searchBox").value.trim(),
    model: $("#filterModel").value || "ALL"
  };
}


async function exportCurrentHistoryExcel() {
  const records =
    getCurrentHistoryFilteredRecords();

  if (!records.length) {
    toast(
      "ไม่มีข้อมูล History ตาม Search / Model Filter ปัจจุบัน",
      "error"
    );
    return;
  }

  const button =
    $("#exportHistoryExcelBtn");

  const originalText =
    button.textContent;

  button.disabled = true;
  button.textContent =
    "กำลังสร้าง Excel...";

  try {
    const imageRecords = [];
    const imageSlots = new Set();

    for (
      let index = 0;
      index < records.length;
      index++
    ) {
      const record = records[index];

      if (
        !record.imageFileId &&
        !record.imageUrl
      ) {
        continue;
      }

      try {
        const loaded =
          await loadRecordImageForXlsx(
            record
          );

        if (!loaded) continue;

        imageSlots.add(index);

        imageRecords.push({
          ...loaded,
          recordIndex: index,
          sheetRow: 6 + index,
          imageColumn: 2
        });

      } catch (err) {
        console.warn(
          "Skip History image in XLSX:",
          record.repairId,
          err
        );
      }
    }

    const sheetXml =
      xlsxBuildHistorySheetXml(
        records,
        imageSlots
      );

    const entries =
      xlsxBuildSingleSheetEntries({
        sheetName: "Repair History",
        sheetXml,
        imageRecords
      });

    const zipBytes =
      xlsxBuildZip(entries);

    const context =
      currentHistoryExportContext();

    const modelPart =
      sanitizeExportFilePart(
        context.model === "ALL"
          ? "ALL_MODEL"
          : context.model
      );

    const searchPart =
      context.search
        ? "_SEARCH_" +
          sanitizeExportFilePart(
            context.search
          ).slice(0, 28)
        : "";

    downloadBinaryFile(
      `Repair_History_${modelPart}${searchPart}_${exportTimestamp()}.xlsx`,
      zipBytes,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    toast(
      `Export History ${records.length} รายการ พร้อมรูปจริง ${imageRecords.length} รูปแล้ว`,
      "success"
    );

  } catch (err) {
    console.error(err);

    toast(
      err.message ||
      "Export History Excel ไม่สำเร็จ",
      "error"
    );

  } finally {
    button.disabled = false;
    button.textContent =
      originalText;
  }
}

async function exportFailureGuidesExcel() {
  const button =
    $("#exportFailureGuideExcelBtn");

  const originalText =
    button.textContent;

  button.disabled = true;
  button.textContent =
    "กำลังสร้าง Excel...";

  try {
    const res = await jsonp(
      "failureGuides"
    );

    if (!res.ok) {
      throw new Error(
        res.error ||
        "โหลด Detailed Failure Guide ไม่สำเร็จ"
      );
    }

    const guides =
      Array.isArray(res.guides)
        ? res.guides
        : [];

    if (!guides.length) {
      toast(
        "ยังไม่มีวิธีแก้ไขแบบละเอียดให้ Export",
        "error"
      );
      return;
    }

    const failCountMap = new Map();

    allRecords.forEach(record => {
      const key = normalizeFailure(
        record.failure
      ).toLocaleLowerCase();

      if (!key) return;

      failCountMap.set(
        key,
        (failCountMap.get(key) || 0) + 1
      );
    });

    const imageRecords = [];
    const imageSlots = new Set();

    for (
      let index = 0;
      index < guides.length;
      index++
    ) {
      const guide = guides[index];

      if (
        !guide.imageFileId &&
        !guide.imageUrl
      ) {
        continue;
      }

      try {
        const loaded =
          await loadGuideImageForXlsx(
            guide
          );

        if (!loaded) continue;

        imageSlots.add(index);

        imageRecords.push({
          ...loaded,
          guideIndex: index,
          sheetRow: 5 + index,
          imageColumn: 7
        });

      } catch (err) {
        console.warn(
          "Skip Guide image in XLSX:",
          guide.guideId,
          err
        );
      }
    }

    const sheetXml =
      xlsxBuildAllGuidesSheetXml(
        guides,
        failCountMap,
        imageSlots
      );

    const entries =
      xlsxBuildSingleSheetEntries({
        sheetName: "Failure Guides",
        sheetXml,
        imageRecords
      });

    const zipBytes =
      xlsxBuildZip(entries);

    downloadBinaryFile(
      `Detailed_Failure_Guide_${exportTimestamp()}.xlsx`,
      zipBytes,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    toast(
      `Export วิธีแก้ละเอียด ${guides.length} รายการ พร้อมรูปจริง ${imageRecords.length} รูปแล้ว`,
      "success"
    );

  } catch (err) {
    console.error(err);

    toast(
      err.message ||
      "Export วิธีแก้ไขแบบละเอียดไม่สำเร็จ",
      "error"
    );

  } finally {
    button.disabled = false;
    button.textContent =
      originalText;
  }
}

function initializeDashboardDefaults() {
  const now = new Date();
  $("#dashboardDay").value = toDateInputValue(now);
  $("#dashboardWeek").value = toWeekInputValue(now);
  $("#dashboardMonth").value = toMonthInputValue(now);
  initializeDashboardOptions();

  if ($("#dashboardYear").querySelector(`option[value="${now.getFullYear()}"]`)) {
    $("#dashboardYear").value = String(now.getFullYear());
  }

  updateDashboardPeriodControl();
}

function initializeDashboardOptions() {
  if (!$("#dashboardModel") || !$("#dashboardStation") || !$("#dashboardYear")) return;

  const models = uniqueSorted(
    allRecords.map(r => String(r.model || "").trim()).filter(Boolean)
  );

  const stations = uniqueSorted(
    allRecords.map(r => String(r.station || "").trim()).filter(Boolean)
  );

  const years = Array.from(new Set(
    allRecords
      .map(r => parseRepairDate(r.date))
      .filter(Boolean)
      .map(d => d.getFullYear())
  )).sort((a, b) => b - a);

  const currentModel = $("#dashboardModel").value;
  const currentStation = $("#dashboardStation").value;
  const currentYear = $("#dashboardYear").value;

  $("#dashboardModel").innerHTML =
    '<option value="">ทุก Model</option>' +
    models.map(v => `<option value="${escAttr(v)}">${esc(v)}</option>`).join("");

  $("#dashboardStation").innerHTML =
    '<option value="">ทุก Station</option>' +
    stations.map(v => `<option value="${escAttr(v)}">${esc(v)}</option>`).join("");

  $("#dashboardYear").innerHTML =
    '<option value="">เลือกปี</option>' +
    years.map(y => `<option value="${y}">${y}</option>`).join("");

  if (models.includes(currentModel)) $("#dashboardModel").value = currentModel;
  if (stations.includes(currentStation)) $("#dashboardStation").value = currentStation;

  if (years.map(String).includes(String(currentYear))) {
    $("#dashboardYear").value = String(currentYear);
  } else if (years.length) {
    $("#dashboardYear").value = String(years[0]);
  }
}

function updateDashboardPeriodControl() {
  const type = $("#dashboardPeriodType").value;

  $("#dashboardDayWrap").classList.toggle("hidden", type !== "day");
  $("#dashboardWeekWrap").classList.toggle("hidden", type !== "week");
  $("#dashboardMonthWrap").classList.toggle("hidden", type !== "month");
  $("#dashboardYearWrap").classList.toggle("hidden", type !== "year");
}

function renderDashboard() {
  if (!$("#dashboardPage")) return;

  const filtered = getDashboardFilteredRecords();

  renderDashboardKpis(filtered);
  renderTopFailures(filtered);
  renderTimeline(filtered);
}

function getDashboardFilteredRecords() {
  const type = $("#dashboardPeriodType").value;
  const selectedModel = $("#dashboardModel").value;
  const selectedStation = $("#dashboardStation").value;

  return allRecords.filter(r => {
    const date = parseRepairDate(r.date);
    if (!date) return false;

    if (selectedModel && String(r.model) !== selectedModel) return false;
    if (selectedStation && String(r.station) !== selectedStation) return false;

    if (type === "all") {
      return true;
    }

    if (type === "day") {
      const value = $("#dashboardDay").value;
      if (!value) return true;
      return toDateInputValue(date) === value;
    }

    if (type === "week") {
      const value = $("#dashboardWeek").value;
      if (!value) return true;
      return toWeekInputValue(date) === value;
    }

    if (type === "month") {
      const value = $("#dashboardMonth").value;
      if (!value) return true;
      return toMonthInputValue(date) === value;
    }

    if (type === "year") {
      const value = $("#dashboardYear").value;
      if (!value) return true;
      return String(date.getFullYear()) === String(value);
    }

    return true;
  });
}

function renderDashboardKpis(records) {
  const repairTimes = records
    .map(r => Number(r.repairTime))
    .filter(v => Number.isFinite(v) && v >= 0);

  const avg = repairTimes.length
    ? repairTimes.reduce((a, b) => a + b, 0) / repairTimes.length
    : 0;

  const models = new Set(
    records.map(r => String(r.model || "").trim()).filter(Boolean)
  );

  const stations = new Set(
    records.map(r => String(r.station || "").trim()).filter(Boolean)
  );

  $("#kpiTotalRecords").textContent = records.length;
  $("#kpiAvgRepairTime").textContent = Math.round(avg);
  $("#kpiModels").textContent = models.size;
  $("#kpiStations").textContent = stations.size;
}

function renderTopFailures(records) {
  const requestedLimit = Number($("#topFailureCount").value || 5);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(99, Math.max(0, Math.trunc(requestedLimit)))
    : 5;

  const allGroups = aggregateFailures(records)
    .sort((a, b) => b.count - a.count || a.failure.localeCompare(b.failure));

  const groups = limit === 0 ? [] : allGroups.slice(0, limit);

  const total = records.length;
  const chart = $("#topFailureChart");
  const ranking = $("#failureRankingBody");

  $("#topFailureSubtitle").textContent =
    limit === 0
      ? "เลือก 0 รายการ — ไม่แสดง Top Failure"
      : `Top ${limit} Failure จาก ${total} Repair Records`;

  if (limit === 0) {
    chart.innerHTML = '<div class="dashboard-empty">ตั้งจำนวน Top Failure เป็น 0</div>';
    ranking.innerHTML = '<tr><td colspan="5" class="empty">ตั้งจำนวน Top Failure เป็น 0</td></tr>';
    return;
  }

  if (!groups.length) {
    chart.innerHTML = '<div class="dashboard-empty">ยังไม่มีข้อมูลในช่วงที่เลือก</div>';
    ranking.innerHTML = '<tr><td colspan="5" class="empty">ยังไม่มีข้อมูล</td></tr>';
    return;
  }

  const maxCount = Math.max(...groups.map(g => g.count));

  chart.innerHTML = groups.map((g, index) => {
    const width = maxCount > 0 ? (g.count / maxCount) * 100 : 0;
    const pct = total > 0 ? (g.count / total) * 100 : 0;

    return `
      <div class="failure-bar-row">
        <div class="failure-rank">${index + 1}</div>

        <div class="failure-bar-content">
          <div class="failure-bar-head">
            <button
              type="button"
              class="failure-name failure-detail-trigger failure-text-button"
              data-failure="${escAttr(g.failure)}"
              title="ดูรายละเอียด Failure"
            >${esc(g.failure)}</button>
            <strong>${g.count}</strong>
          </div>

          <div class="failure-bar-track">
            <div class="failure-bar-fill" style="width:${width.toFixed(2)}%"></div>
          </div>

          <div class="failure-bar-meta">
            ${pct.toFixed(1)}% ของทั้งหมด · Avg. Repair ${Math.round(g.avgRepairTime)} min
          </div>
        </div>
      </div>
    `;
  }).join("");

  ranking.innerHTML = groups.map((g, index) => {
    const pct = total > 0 ? (g.count / total) * 100 : 0;

    return `
      <tr>
        <td>${index + 1}</td>
        <td>
          <button
            type="button"
            class="failure-detail-trigger failure-text-button ranking-failure-button"
            data-failure="${escAttr(g.failure)}"
            title="ดูรายละเอียด Failure"
          >${esc(g.failure)}</button>
        </td>
        <td><strong>${g.count}</strong></td>
        <td>${pct.toFixed(1)}%</td>
        <td>${Math.round(g.avgRepairTime)} min</td>
      </tr>
    `;
  }).join("");
}

function aggregateFailures(records) {
  const map = new Map();

  records.forEach(r => {
    const displayFailure = normalizeFailure(r.failure);
    if (!displayFailure) return;

    const key = displayFailure.toLocaleLowerCase();

    if (!map.has(key)) {
      map.set(key, {
        failure: displayFailure,
        count: 0,
        totalRepairTime: 0,
        repairTimeCount: 0
      });
    }

    const item = map.get(key);
    item.count += 1;

    const time = Number(r.repairTime);

    if (Number.isFinite(time) && time >= 0) {
      item.totalRepairTime += time;
      item.repairTimeCount += 1;
    }
  });

  return Array.from(map.values()).map(item => ({
    failure: item.failure,
    count: item.count,
    avgRepairTime: item.repairTimeCount
      ? item.totalRepairTime / item.repairTimeCount
      : 0
  }));
}

function normalizeFailure(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function renderTimeline(records) {
  const type = $("#dashboardPeriodType").value;
  const chart = $("#timelineChart");

  const groups = new Map();

  records.forEach(r => {
    const date = parseRepairDate(r.date);
    if (!date) return;

    let key;
    let label;

    if (type === "day") {
      const hour = parseRecordHour(r.time);
      if (hour === null) return;

      key = String(hour).padStart(2, "0");
      label = `${String(hour).padStart(2, "0")}:00`;
    } else if (type === "week") {
      key = toDateInputValue(date);
      label = formatShortDate(date);
    } else if (type === "month") {
      key = toDateInputValue(date);
      label = formatShortDate(date);
    } else if (type === "year") {
      key = toMonthInputValue(date);
      label = formatMonthLabel(date);
    } else {
      key = toMonthInputValue(date);
      label = formatMonthYearLabel(date);
    }

    groups.set(key, {
      label,
      count: (groups.get(key)?.count || 0) + 1
    });
  });

  let values = Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v]) => v);

  if (type === "day") {
    values = buildHourlyTimeline(groups);
    $("#timelineSubtitle").textContent = "จำนวน Repair Records แยกตามชั่วโมง";
  } else if (type === "week") {
    $("#timelineSubtitle").textContent = "จำนวน Repair Records แยกตามวันในสัปดาห์";
  } else if (type === "month") {
    $("#timelineSubtitle").textContent = "จำนวน Repair Records แยกตามวันในเดือน";
  } else if (type === "year") {
    values = buildYearlyMonthTimeline(groups);
    $("#timelineSubtitle").textContent = "จำนวน Repair Records แยกตามเดือนของปีที่เลือก";
  } else {
    $("#timelineSubtitle").textContent = "จำนวน Repair Records ทั้งหมด แยกตามเดือน";
  }

  if (!values.length || !values.some(v => v.count > 0)) {
    chart.innerHTML = '<div class="dashboard-empty">ยังไม่มีข้อมูลในช่วงที่เลือก</div>';
    return;
  }

  const maxCount = Math.max(...values.map(v => v.count), 1);

  chart.innerHTML = `
    <div class="timeline-bars">
      ${values.map(v => {
        const height = Math.max(4, (v.count / maxCount) * 100);
        return `
          <div class="timeline-item" title="${escAttr(v.label)} : ${v.count}">
            <div class="timeline-value">${v.count || ""}</div>
            <div class="timeline-column">
              <div class="timeline-fill" style="height:${height}%"></div>
            </div>
            <div class="timeline-label">${esc(v.label)}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}


function buildYearlyMonthTimeline(groups) {
  const year = Number($("#dashboardYear").value);
  if (!year) return [];

  const result = [];

  for (let month = 0; month < 12; month++) {
    const date = new Date(year, month, 1, 12, 0, 0);
    const key = toMonthInputValue(date);

    result.push({
      label: formatMonthLabel(date),
      count: groups.get(key)?.count || 0
    });
  }

  return result;
}

function formatMonthLabel(date) {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  return months[date.getMonth()];
}

function formatMonthYearLabel(date) {
  return `${formatMonthLabel(date)} ${date.getFullYear()}`;
}

function buildHourlyTimeline(groups) {
  const result = [];

  for (let hour = 0; hour < 24; hour++) {
    const key = String(hour).padStart(2, "0");
    result.push({
      label: `${key}:00`,
      count: groups.get(key)?.count || 0
    });
  }

  return result;
}

function parseRecordHour(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 || hour > 23 ||
    minute < 0 || minute > 59
  ) {
    return null;
  }

  return hour;
}

function parseRepairDate(value) {
  const text = String(value || "").trim();

  function buildStrictDate(year, month1Based, day) {
    const date = new Date(year, month1Based - 1, day, 12, 0, 0);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month1Based - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    return date;
  }

  // dd/MM/yyyy
  let m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);

    // รองรับ พ.ศ.
    if (year > 2400) year -= 543;

    return buildStrictDate(year, month, day);
  }

  // yyyy-MM-dd
  m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (m) {
    return buildStrictDate(
      Number(m[1]),
      Number(m[2]),
      Number(m[3])
    );
  }

  // ไม่ parse format อื่นแบบเดา เพื่อไม่ให้ Dashboard นับวันที่ผิด
  return null;
}

function toDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toMonthInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function toWeekInputValue(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayNum = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNum + 3);

  const firstThursday = new Date(d.getFullYear(), 0, 4);
  const firstDayNum = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);

  const week = 1 + Math.round(
    (d.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );

  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function formatShortDate(date) {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
}




/* =========================
   FAILURE DETAIL / KNOWLEDGE GUIDE
========================= */

function bindFailureGuide() {
  const modal = $("#failureDetailModal");
  if (!modal) return;

  $("#closeFailureDetailModal").addEventListener("click", closeFailureDetailModal);
  $("#failureDetailBackdrop").addEventListener("click", closeFailureDetailModal);

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest(".failure-detail-trigger");
    if (!trigger) return;

    const failure = String(trigger.dataset.failure || "").trim();
    if (!failure) return;

    openFailureDetailModal(failure);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeFailureDetailModal();
    }
  });

  $("#exportCurrentFailureExcelBtn").addEventListener(
    "click",
    exportCurrentFailureDetailXlsx
  );

  $("#toggleFailureGuideFormBtn").addEventListener("click", () => {
    const form = $("#failureGuideAddForm");
    form.classList.toggle("hidden");

    if (!form.classList.contains("hidden")) {
      $("#failureGuideDetailInput").focus();
    }
  });

  $("#cancelFailureGuideBtn").addEventListener("click", () => {
    resetFailureGuideForm();
    $("#failureGuideAddForm").classList.add("hidden");
  });

  $("#failureGuideImageInput").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];

    if (!file) {
      clearFailureGuideSelectedImage();
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast("กรุณาเลือกไฟล์รูปภาพ", "error");
      clearFailureGuideSelectedImage();
      return;
    }

    try {
      selectedFailureGuideImage = await compressImage(file);
      $("#failureGuideImagePreview").src = selectedFailureGuideImage.dataUrl;
      $("#failureGuideImagePreviewWrap").classList.remove("hidden");
    } catch (err) {
      console.error(err);
      clearFailureGuideSelectedImage();
      toast("เตรียมรูปไม่สำเร็จ", "error");
    }
  });

  $("#failureGuideRemoveImageBtn").addEventListener(
    "click",
    clearFailureGuideSelectedImage
  );

  $("#failureGuideAddForm").addEventListener("submit", saveFailureGuide);

  // Admin Failure Guide
  $("#adminGuideSearchBox").addEventListener("input", renderAdminFailureGuides);
  $("#adminGuideReloadBtn").addEventListener("click", loadAdminFailureGuides);
  $("#adminGuideClearEditBtn").addEventListener("click", clearAdminGuideEditor);
  $("#adminGuideEditForm").addEventListener("submit", saveAdminFailureGuideEdit);

  $("#adminGuideNewImage").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];

    if (!file) {
      clearAdminGuideNewImage();
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast("กรุณาเลือกไฟล์รูปภาพ", "error");
      clearAdminGuideNewImage();
      return;
    }

    try {
      adminGuideNewImage = await compressImage(file);
      $("#adminGuideNewImagePreview").src = adminGuideNewImage.dataUrl;
      $("#adminGuideNewImagePreviewWrap").classList.remove("hidden");
    } catch (err) {
      console.error(err);
      clearAdminGuideNewImage();
      toast("เตรียมรูปใหม่ไม่สำเร็จ", "error");
    }
  });

  $("#adminGuideClearNewImageBtn").addEventListener(
    "click",
    clearAdminGuideNewImage
  );
}


async function openFailureDetailModal(failureValue) {
  const failure = normalizeFailure(failureValue);
  if (!failure) return;

  activeFailureName = failure;
  currentFailureGuides = [];
  currentFailureCount = countFailureOccurrences(failure);

  $("#failureDetailTitle").textContent = failure;
  $("#failureGuideFormFailure").textContent = failure;

  const localCount = currentFailureCount;
  $("#failureDetailCount").textContent = `${localCount} ครั้ง`;
  $("#failureGuideCount").textContent = "กำลังโหลดวิธีแก้...";
  $("#failureGuideList").innerHTML =
    '<div class="failure-guide-empty">กำลังโหลดวิธีแก้ไขแบบละเอียด...</div>';

  resetFailureGuideForm();
  $("#failureGuideAddForm").classList.add("hidden");

  $("#failureDetailModal").classList.remove("hidden");
  $("#failureDetailModal").setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  try {
    const res = await jsonp("failureDetail", { failure });

    if (!res.ok) {
      throw new Error(res.error || "โหลด Failure Detail ไม่สำเร็จ");
    }

    if (normalizeFailure(activeFailureName).toLowerCase() !==
        normalizeFailure(failure).toLowerCase()) {
      return;
    }

    currentFailureCount = Number(res.failCount || 0);
    currentFailureGuides = Array.isArray(res.guides)
      ? res.guides
      : [];

    $("#failureDetailCount").textContent =
      `${currentFailureCount} ครั้ง`;

    renderFailureGuides(
      currentFailureGuides
    );

  } catch (err) {
    console.error(err);
    $("#failureGuideList").innerHTML =
      '<div class="failure-guide-empty error">โหลดวิธีแก้ไขไม่สำเร็จ</div>';
    $("#failureGuideCount").textContent = "โหลดไม่สำเร็จ";
  }
}


function closeFailureDetailModal() {
  const modal = $("#failureDetailModal");
  if (!modal || modal.classList.contains("hidden")) return;

  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");

  activeFailureName = "";
  currentFailureGuides = [];
  currentFailureCount = 0;
  resetFailureGuideForm();
}


function countFailureOccurrences(failureValue) {
  const key = normalizeFailure(failureValue).toLocaleLowerCase();

  return allRecords.filter(record =>
    normalizeFailure(record.failure).toLocaleLowerCase() === key
  ).length;
}


function renderFailureGuides(guides) {
  currentFailureGuides = Array.isArray(guides)
    ? guides
    : [];

  $("#failureGuideCount").textContent =
    `${currentFailureGuides.length} วิธีแก้`;

  guides = currentFailureGuides;

  const list = $("#failureGuideList");

  if (!guides.length) {
    list.innerHTML = `
      <div class="failure-guide-empty">
        <strong>ยังไม่มีวิธีแก้ไขแบบละเอียด</strong>
        <span>กด “+ เพิ่มวิธีแก้ไขแบบละเอียด” เพื่อเพิ่ม Knowledge แรก</span>
      </div>
    `;
    return;
  }

  list.innerHTML = guides.map((guide, index) => {
    const image = resolveGuideImage(guide);

    const imageHtml = image.thumbnailUrl
      ? `
        <img
          class="failure-guide-image"
          src="${escAttr(image.thumbnailUrl)}"
          alt="${escAttr(image.name || "Failure guide image")}"
          loading="lazy"
          referrerpolicy="no-referrer"
          data-url="${escAttr(image.thumbnailUrl)}"
          data-fileid="${escAttr(image.fileId)}"
          data-name="${escAttr(image.name)}"
        >
      `
      : "";

    const author = String(guide.author || "").trim();
    const created = [
      String(guide.date || "").trim(),
      String(guide.time || "").trim()
    ].filter(Boolean).join(" ");

    return `
      <article class="failure-guide-item">
        <div class="failure-guide-item-head">
          <span class="failure-guide-number">วิธีที่ ${index + 1}</span>
          <span class="failure-guide-id">${esc(guide.guideId || "")}</span>
        </div>

        <div class="failure-guide-detail-text">${esc(guide.detail || "")}</div>

        ${imageHtml}

        <div class="failure-guide-meta">
          ${author ? `<span>ผู้เพิ่ม: <strong>${esc(author)}</strong></span>` : ""}
          ${created ? `<span>บันทึก: ${esc(created)}</span>` : ""}
        </div>
      </article>
    `;
  }).join("");

  list.querySelectorAll(".failure-guide-image").forEach(img => {
    img.addEventListener("click", () => {
      openImageModal(
        img.dataset.url,
        img.dataset.name,
        img.dataset.fileid
      );
    });

    img.addEventListener("error", async () => {
      const id = normalizeDriveFileId(img.dataset.fileid);
      if (!id) return;

      try {
        img.src = await getDriveImageData(id);
      } catch (err) {
        console.error(err);
        img.style.display = "none";
      }
    }, { once: true });
  });
}


function resolveGuideImage(guide) {
  const rawUrl = String(guide?.imageUrl || "").trim();

  const fileId =
    normalizeDriveFileId(guide?.imageFileId) ||
    extractDriveFileId(rawUrl);

  return {
    fileId,
    thumbnailUrl: fileId
      ? buildDriveThumbnailUrl(fileId)
      : rawUrl,
    name: String(guide?.imageName || "").trim()
  };
}


function clearFailureGuideSelectedImage() {
  selectedFailureGuideImage = null;

  const input = $("#failureGuideImageInput");
  if (input) input.value = "";

  $("#failureGuideImagePreview").removeAttribute("src");
  $("#failureGuideImagePreviewWrap").classList.add("hidden");
}


function resetFailureGuideForm() {
  const form = $("#failureGuideAddForm");
  if (form) form.reset();

  clearFailureGuideSelectedImage();

  if ($("#failureGuideFormFailure")) {
    $("#failureGuideFormFailure").textContent = activeFailureName || "";
  }
}


async function saveFailureGuide(event) {
  event.preventDefault();

  const failure = normalizeFailure(activeFailureName);
  const detail = $("#failureGuideDetailInput").value.trim();
  const author = $("#failureGuideAuthorInput").value.trim();

  if (!failure) {
    toast("ไม่พบ Failure ที่ต้องการบันทึก", "error");
    return;
  }

  if (!detail) {
    toast("กรุณาใส่วิธีแก้ไขแบบละเอียด", "error");
    return;
  }

  const btn = $("#saveFailureGuideBtn");
  btn.disabled = true;
  btn.textContent = "กำลังบันทึก...";

  try {
    await sendFailureGuideOperation({
      failure,
      detail,
      author,
      imageName: selectedFailureGuideImage
        ? selectedFailureGuideImage.name
        : "",
      imageMimeType: selectedFailureGuideImage
        ? selectedFailureGuideImage.mimeType
        : "",
      imageBase64: selectedFailureGuideImage
        ? selectedFailureGuideImage.base64
        : ""
    });

    resetFailureGuideForm();
    $("#failureGuideAddForm").classList.add("hidden");

    toast("เพิ่มวิธีแก้ไขแบบละเอียดแล้ว", "success");
    await openFailureDetailModal(failure);

    if (adminLoggedIn) {
      await loadAdminFailureGuides();
    }

  } catch (err) {
    console.error(err);
    toast(err.message || "บันทึกวิธีแก้ไขไม่สำเร็จ", "error");

  } finally {
    btn.disabled = false;
    btn.textContent = "บันทึกวิธีแก้ไข";
  }
}


async function sendFailureGuideOperation(values) {
  const opId = createAdminOpId();

  const body = new URLSearchParams({
    action: "saveFailureGuide",
    opId,
    ...values
  });

  await fetch(GAS_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body
  });

  return pollOperationStatus(opId);
}



/* =========================
   CURRENT FAILURE XLSX EXPORT
   - Export เฉพาะ Failure ที่เปิดอยู่
   - รูปถูกฝังเป็น image binary ใน .xlsx จริง
   - ไม่ใช้ external library / CDN
========================= */

function xlsxXmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}


function xlsxColumnName(index) {
  let n = Number(index);
  let name = "";

  while (n > 0) {
    const remainder = (n - 1) % 26;
    name =
      String.fromCharCode(65 + remainder) +
      name;
    n = Math.floor((n - 1) / 26);
  }

  return name;
}


function xlsxInlineStringCell(ref, value, styleIndex = 0) {
  return (
    `<c r="${ref}" t="inlineStr" s="${styleIndex}">` +
      `<is><t xml:space="preserve">${xlsxXmlEscape(value)}</t></is>` +
    `</c>`
  );
}


function xlsxNumberCell(ref, value, styleIndex = 0) {
  const number = Number(value);

  return (
    `<c r="${ref}" t="n" s="${styleIndex}">` +
      `<v>${Number.isFinite(number) ? number : 0}</v>` +
    `</c>`
  );
}


function dataUrlToXlsxImage(dataUrl) {
  const match = String(dataUrl || "").match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
  );

  if (!match) {
    throw new Error("รูปไม่ใช่ Base64 image ที่รองรับ");
  }

  const mime = match[1].toLowerCase();
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  let extension = "jpg";

  if (mime === "image/png") {
    extension = "png";
  } else if (mime === "image/gif") {
    extension = "gif";
  } else if (
    mime === "image/jpeg" ||
    mime === "image/jpg"
  ) {
    extension = "jpg";
  } else {
    throw new Error(
      "Excel รองรับรูป Export เฉพาะ JPG / PNG / GIF"
    );
  }

  return {
    bytes,
    mime,
    extension
  };
}


async function loadGuideImageForXlsx(guide) {
  const image = resolveGuideImage(guide);

  if (image.fileId) {
    const dataUrl = await getDriveImageData(
      image.fileId
    );

    return {
      ...dataUrlToXlsxImage(dataUrl),
      name:
        image.name ||
        guide.imageName ||
        "guide-image"
    };
  }

  const rawUrl = String(
    guide.imageUrl ||
    image.thumbnailUrl ||
    ""
  ).trim();

  if (!rawUrl) return null;

  try {
    const response = await fetch(
      rawUrl,
      {
        mode: "cors",
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const blob = await response.blob();

    if (!blob.type.startsWith("image/")) {
      throw new Error("URL ไม่ใช่รูปภาพ");
    }

    const buffer = await blob.arrayBuffer();

    let extension = "jpg";

    if (blob.type === "image/png") {
      extension = "png";
    } else if (blob.type === "image/gif") {
      extension = "gif";
    }

    return {
      bytes: new Uint8Array(buffer),
      mime: blob.type,
      extension,
      name:
        image.name ||
        guide.imageName ||
        "guide-image"
    };

  } catch (err) {
    console.warn(
      "Cannot embed guide image:",
      err
    );

    return null;
  }
}



async function loadRecordImageForXlsx(record) {
  const image = resolveRecordImage(record);

  if (image.fileId) {
    const dataUrl = await getDriveImageData(
      image.fileId
    );

    return {
      ...dataUrlToXlsxImage(dataUrl),
      name:
        image.name ||
        record.imageName ||
        "repair-image"
    };
  }

  const rawUrl = String(
    record.imageUrl ||
    image.thumbnailUrl ||
    ""
  ).trim();

  if (!rawUrl) return null;

  try {
    const response = await fetch(
      rawUrl,
      {
        mode: "cors",
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const blob = await response.blob();

    if (!blob.type.startsWith("image/")) {
      throw new Error("URL ไม่ใช่รูปภาพ");
    }

    const buffer = await blob.arrayBuffer();

    let extension = "jpg";

    if (blob.type === "image/png") {
      extension = "png";
    } else if (blob.type === "image/gif") {
      extension = "gif";
    }

    return {
      bytes: new Uint8Array(buffer),
      mime: blob.type,
      extension,
      name:
        image.name ||
        record.imageName ||
        "repair-image"
    };

  } catch (err) {
    console.warn(
      "Cannot embed repair image:",
      err
    );

    return null;
  }
}


function xlsxBuildSingleSheetEntries({
  sheetName,
  sheetXml,
  imageRecords
}) {
  const hasImages =
    Array.isArray(imageRecords) &&
    imageRecords.length > 0;

  const safeSheetName = String(
    sheetName || "Sheet1"
  )
    .replace(/[\\\/\?\*\[\]:]/g, " ")
    .slice(0, 31);

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="gif" ContentType="image/gif"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${
    hasImages
      ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
      : ''
  }
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${xlsxXmlEscape(safeSheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="10"/><name val="Arial"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
    <font><b/><sz val="15"/><color rgb="FF1F4E78"/><name val="Arial"/></font>
    <font><b/><sz val="10"/><color rgb="FFB42318"/><name val="Arial"/></font>
  </fonts>

  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFCE8E6"/><bgColor indexed="64"/></patternFill></fill>
  </fills>

  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD9E2EC"/></left>
      <right style="thin"><color rgb="FFD9E2EC"/></right>
      <top style="thin"><color rgb="FFD9E2EC"/></top>
      <bottom style="thin"><color rgb="FFD9E2EC"/></bottom>
      <diagonal/>
    </border>
  </borders>

  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>

  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">
      <alignment vertical="top" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1">
      <alignment vertical="top" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
  </cellXfs>

  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;

  const entries = [
    {
      name: "[Content_Types].xml",
      data: contentTypes
    },
    {
      name: "_rels/.rels",
      data: rootRels
    },
    {
      name: "xl/workbook.xml",
      data: workbook
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: workbookRels
    },
    {
      name: "xl/styles.xml",
      data: styles
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: sheetXml
    }
  ];

  if (hasImages) {
    entries.push(
      ...xlsxBuildDrawingFiles(
        imageRecords
      )
    );

    imageRecords.forEach(
      (record, index) => {
        entries.push({
          name:
            `xl/media/image${index + 1}.${record.extension}`,
          data: record.bytes
        });
      }
    );
  }

  return entries;
}


function xlsxBuildHistorySheetXml(
  records,
  imageSlots
) {
  const rows = [];

  rows.push(
    `<row r="1" ht="28" customHeight="1">` +
      xlsxInlineStringCell(
        "A1",
        "Repair History Export",
        2
      ) +
    `</row>`
  );

  const context =
    currentHistoryExportContext();

  rows.push(
    `<row r="2">` +
      xlsxInlineStringCell(
        "A2",
        "Search",
        1
      ) +
      xlsxInlineStringCell(
        "B2",
        context.search || "(ไม่ได้ค้นหา)",
        3
      ) +
      xlsxInlineStringCell(
        "D2",
        "Model Filter",
        1
      ) +
      xlsxInlineStringCell(
        "E2",
        context.model,
        3
      ) +
    `</row>`
  );

  rows.push(
    `<row r="3">` +
      xlsxInlineStringCell(
        "A3",
        "Sort",
        1
      ) +
      xlsxInlineStringCell(
        "B3",
        "ใหม่สุดก่อน · ไม่มี Model Sort",
        3
      ) +
      xlsxInlineStringCell(
        "D3",
        "Records",
        1
      ) +
      xlsxNumberCell(
        "E3",
        records.length,
        5
      ) +
    `</row>`
  );

  const headerRow = 5;

  const headers = [
    "Failure / Symptom",
    "Repair Action",
    "รูป",
    "Model",
    "Station",
    "เริ่มซ่อม",
    "ซ่อมเสร็จ",
    "Repair Time (นาที)",
    "คนทำ",
    "Repair ID"
  ];

  rows.push(
    `<row r="${headerRow}" ht="26" customHeight="1">` +
    headers.map((header, index) =>
      xlsxInlineStringCell(
        `${xlsxColumnName(index + 1)}${headerRow}`,
        header,
        1
      )
    ).join("") +
    `</row>`
  );

  records.forEach((record, index) => {
    const rowNumber = headerRow + 1 + index;
    const hasImage = imageSlots.has(index);
    const rowHeight = hasImage ? 110 : 38;

    rows.push(
      `<row r="${rowNumber}" ht="${rowHeight}" customHeight="1">` +
        xlsxInlineStringCell(
          `A${rowNumber}`,
          record.failure || "",
          3
        ) +
        xlsxInlineStringCell(
          `B${rowNumber}`,
          record.repairAction || "",
          3
        ) +
        xlsxInlineStringCell(
          `C${rowNumber}`,
          hasImage ? "" : "ไม่มีรูป",
          5
        ) +
        xlsxInlineStringCell(
          `D${rowNumber}`,
          record.model || "",
          3
        ) +
        xlsxInlineStringCell(
          `E${rowNumber}`,
          record.station || "",
          5
        ) +
        xlsxInlineStringCell(
          `F${rowNumber}`,
          record.startRepair || "",
          5
        ) +
        xlsxInlineStringCell(
          `G${rowNumber}`,
          record.finishRepair || "",
          5
        ) +
        xlsxNumberCell(
          `H${rowNumber}`,
          Number.isFinite(
            Number(record.repairTime)
          )
            ? Number(record.repairTime)
            : 0,
          5
        ) +
        xlsxInlineStringCell(
          `I${rowNumber}`,
          record.repairBy || "",
          3
        ) +
        xlsxInlineStringCell(
          `J${rowNumber}`,
          record.repairId || "",
          3
        ) +
      `</row>`
    );
  });

  const drawingXml = imageSlots.size
    ? '<drawing r:id="rId1"/>'
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet
  xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>

  <cols>
    <col min="1" max="1" width="30" customWidth="1"/>
    <col min="2" max="2" width="38" customWidth="1"/>
    <col min="3" max="3" width="34" customWidth="1"/>
    <col min="4" max="4" width="20" customWidth="1"/>
    <col min="5" max="5" width="14" customWidth="1"/>
    <col min="6" max="7" width="14" customWidth="1"/>
    <col min="8" max="8" width="18" customWidth="1"/>
    <col min="9" max="9" width="24" customWidth="1"/>
    <col min="10" max="10" width="24" customWidth="1"/>
  </cols>

  <sheetData>
    ${rows.join("")}
  </sheetData>

  <mergeCells count="1">
    <mergeCell ref="A1:J1"/>
  </mergeCells>

  ${drawingXml}
</worksheet>`;
}


function xlsxBuildAllGuidesSheetXml(
  guides,
  failCountMap,
  imageSlots
) {
  const rows = [];

  rows.push(
    `<row r="1" ht="28" customHeight="1">` +
      xlsxInlineStringCell(
        "A1",
        "Detailed Failure Guide Export",
        2
      ) +
    `</row>`
  );

  rows.push(
    `<row r="2">` +
      xlsxInlineStringCell(
        "A2",
        "Total Guides",
        1
      ) +
      xlsxNumberCell(
        "B2",
        guides.length,
        5
      ) +
      xlsxInlineStringCell(
        "D2",
        "Exported At",
        1
      ) +
      xlsxInlineStringCell(
        "E2",
        new Date().toLocaleString("th-TH"),
        3
      ) +
    `</row>`
  );

  const headerRow = 4;

  const headers = [
    "Guide ID",
    "Failure / Symptom",
    "Fail Count",
    "วิธีแก้ไขแบบละเอียด",
    "ผู้เพิ่ม",
    "วันที่",
    "เวลา",
    "รูป",
    "Image Name",
    "Updated Date",
    "Updated Time"
  ];

  rows.push(
    `<row r="${headerRow}" ht="26" customHeight="1">` +
    headers.map((header, index) =>
      xlsxInlineStringCell(
        `${xlsxColumnName(index + 1)}${headerRow}`,
        header,
        1
      )
    ).join("") +
    `</row>`
  );

  guides.forEach((guide, index) => {
    const rowNumber = headerRow + 1 + index;
    const hasImage = imageSlots.has(index);
    const rowHeight = hasImage ? 120 : 60;

    const key = normalizeFailure(
      guide.failure
    ).toLocaleLowerCase();

    rows.push(
      `<row r="${rowNumber}" ht="${rowHeight}" customHeight="1">` +
        xlsxInlineStringCell(
          `A${rowNumber}`,
          guide.guideId || "",
          3
        ) +
        xlsxInlineStringCell(
          `B${rowNumber}`,
          guide.failure || "",
          3
        ) +
        xlsxNumberCell(
          `C${rowNumber}`,
          failCountMap.get(key) || 0,
          5
        ) +
        xlsxInlineStringCell(
          `D${rowNumber}`,
          guide.detail || "",
          6
        ) +
        xlsxInlineStringCell(
          `E${rowNumber}`,
          guide.author || "",
          3
        ) +
        xlsxInlineStringCell(
          `F${rowNumber}`,
          guide.date || "",
          5
        ) +
        xlsxInlineStringCell(
          `G${rowNumber}`,
          guide.time || "",
          5
        ) +
        xlsxInlineStringCell(
          `H${rowNumber}`,
          hasImage ? "" : "ไม่มีรูป",
          5
        ) +
        xlsxInlineStringCell(
          `I${rowNumber}`,
          guide.imageName || "",
          3
        ) +
        xlsxInlineStringCell(
          `J${rowNumber}`,
          guide.updatedDate || "",
          5
        ) +
        xlsxInlineStringCell(
          `K${rowNumber}`,
          guide.updatedTime || "",
          5
        ) +
      `</row>`
    );
  });

  const drawingXml = imageSlots.size
    ? '<drawing r:id="rId1"/>'
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet
  xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>

  <cols>
    <col min="1" max="1" width="22" customWidth="1"/>
    <col min="2" max="2" width="30" customWidth="1"/>
    <col min="3" max="3" width="12" customWidth="1"/>
    <col min="4" max="4" width="70" customWidth="1"/>
    <col min="5" max="5" width="18" customWidth="1"/>
    <col min="6" max="7" width="14" customWidth="1"/>
    <col min="8" max="8" width="36" customWidth="1"/>
    <col min="9" max="9" width="28" customWidth="1"/>
    <col min="10" max="11" width="16" customWidth="1"/>
  </cols>

  <sheetData>
    ${rows.join("")}
  </sheetData>

  <mergeCells count="1">
    <mergeCell ref="A1:K1"/>
  </mergeCells>

  ${drawingXml}
</worksheet>`;
}


function xlsxCrc32(bytes) {
  if (!xlsxCrc32.table) {
    const table = new Uint32Array(256);

    for (let n = 0; n < 256; n++) {
      let c = n;

      for (let k = 0; k < 8; k++) {
        c = (c & 1)
          ? 0xEDB88320 ^ (c >>> 1)
          : c >>> 1;
      }

      table[n] = c >>> 0;
    }

    xlsxCrc32.table = table;
  }

  let crc = 0xFFFFFFFF;

  for (let i = 0; i < bytes.length; i++) {
    crc =
      xlsxCrc32.table[
        (crc ^ bytes[i]) & 0xFF
      ] ^
      (crc >>> 8);
  }

  return (crc ^ 0xFFFFFFFF) >>> 0;
}


function xlsxDosDateTime(date = new Date()) {
  const year = Math.max(
    1980,
    date.getFullYear()
  );

  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);

  const dosDate =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();

  return {
    time: dosTime & 0xFFFF,
    date: dosDate & 0xFFFF
  };
}


function xlsxConcatUint8(parts) {
  const total = parts.reduce(
    (sum, part) => sum + part.length,
    0
  );

  const output = new Uint8Array(total);
  let offset = 0;

  parts.forEach(part => {
    output.set(part, offset);
    offset += part.length;
  });

  return output;
}


function xlsxU16(value) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(
    0,
    value & 0xFFFF,
    true
  );
  return bytes;
}


function xlsxU32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(
    0,
    value >>> 0,
    true
  );
  return bytes;
}


function xlsxTextBytes(text) {
  return new TextEncoder().encode(
    String(text)
  );
}


/*
 * Minimal ZIP writer using STORE method (no compression).
 * XLSX accepts standard ZIP entries without compression.
 */
function xlsxBuildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  const stamp = xlsxDosDateTime();

  entries.forEach(entry => {
    const nameBytes = xlsxTextBytes(
      entry.name
    );

    const dataBytes =
      entry.data instanceof Uint8Array
        ? entry.data
        : xlsxTextBytes(entry.data);

    const crc = xlsxCrc32(dataBytes);

    const localHeader = xlsxConcatUint8([
      xlsxU32(0x04034B50),
      xlsxU16(20),
      xlsxU16(0x0800),
      xlsxU16(0),
      xlsxU16(stamp.time),
      xlsxU16(stamp.date),
      xlsxU32(crc),
      xlsxU32(dataBytes.length),
      xlsxU32(dataBytes.length),
      xlsxU16(nameBytes.length),
      xlsxU16(0),
      nameBytes
    ]);

    localParts.push(
      localHeader,
      dataBytes
    );

    const centralHeader = xlsxConcatUint8([
      xlsxU32(0x02014B50),
      xlsxU16(20),
      xlsxU16(20),
      xlsxU16(0x0800),
      xlsxU16(0),
      xlsxU16(stamp.time),
      xlsxU16(stamp.date),
      xlsxU32(crc),
      xlsxU32(dataBytes.length),
      xlsxU32(dataBytes.length),
      xlsxU16(nameBytes.length),
      xlsxU16(0),
      xlsxU16(0),
      xlsxU16(0),
      xlsxU16(0),
      xlsxU32(0),
      xlsxU32(localOffset),
      nameBytes
    ]);

    centralParts.push(
      centralHeader
    );

    localOffset +=
      localHeader.length +
      dataBytes.length;
  });

  const localData = xlsxConcatUint8(
    localParts
  );

  const centralData = xlsxConcatUint8(
    centralParts
  );

  const end = xlsxConcatUint8([
    xlsxU32(0x06054B50),
    xlsxU16(0),
    xlsxU16(0),
    xlsxU16(entries.length),
    xlsxU16(entries.length),
    xlsxU32(centralData.length),
    xlsxU32(localData.length),
    xlsxU16(0)
  ]);

  return xlsxConcatUint8([
    localData,
    centralData,
    end
  ]);
}


function xlsxWorkbookBaseEntries(hasImages) {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="gif" ContentType="image/gif"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${
    hasImages
      ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
      : ''
  }
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Failure Detail" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="10"/><name val="Arial"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
    <font><b/><sz val="16"/><color rgb="FF1F4E78"/><name val="Arial"/></font>
    <font><b/><sz val="10"/><color rgb="FFB42318"/><name val="Arial"/></font>
  </fonts>

  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFCE8E6"/><bgColor indexed="64"/></patternFill></fill>
  </fills>

  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD9E2EC"/></left>
      <right style="thin"><color rgb="FFD9E2EC"/></right>
      <top style="thin"><color rgb="FFD9E2EC"/></top>
      <bottom style="thin"><color rgb="FFD9E2EC"/></bottom>
      <diagonal/>
    </border>
  </borders>

  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>

  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">
      <alignment vertical="top" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1">
      <alignment vertical="top" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
  </cellXfs>

  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;

  return [
    {
      name: "[Content_Types].xml",
      data: contentTypes
    },
    {
      name: "_rels/.rels",
      data: rootRels
    },
    {
      name: "xl/workbook.xml",
      data: workbook
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: workbookRels
    },
    {
      name: "xl/styles.xml",
      data: styles
    }
  ];
}


function xlsxBuildFailureSheetXml(
  failure,
  failCount,
  guides,
  imageSlots
) {
  const rows = [];

  rows.push(
    `<row r="1" ht="28" customHeight="1">` +
      xlsxInlineStringCell(
        "A1",
        "Failure Knowledge / Detailed Troubleshooting Guide",
        2
      ) +
    `</row>`
  );

  rows.push(
    `<row r="2">` +
      xlsxInlineStringCell(
        "A2",
        "Failure / Symptom",
        1
      ) +
      xlsxInlineStringCell(
        "B2",
        failure,
        3
      ) +
    `</row>`
  );

  rows.push(
    `<row r="3">` +
      xlsxInlineStringCell(
        "A3",
        "Fail Count",
        1
      ) +
      xlsxNumberCell(
        "B3",
        failCount,
        4
      ) +
    `</row>`
  );

  rows.push(
    `<row r="4">` +
      xlsxInlineStringCell(
        "A4",
        "Exported At",
        1
      ) +
      xlsxInlineStringCell(
        "B4",
        new Date().toLocaleString("th-TH"),
        3
      ) +
    `</row>`
  );

  const headerRow = 6;

  const headers = [
    "Guide ID",
    "Failure / Symptom",
    "Fail Count",
    "วิธีแก้ไขแบบละเอียด",
    "ผู้เพิ่ม",
    "วันที่",
    "เวลา",
    "รูป",
    "Image Name",
    "Updated Date",
    "Updated Time"
  ];

  rows.push(
    `<row r="${headerRow}" ht="26" customHeight="1">` +
    headers.map((header, index) =>
      xlsxInlineStringCell(
        `${xlsxColumnName(index + 1)}${headerRow}`,
        header,
        1
      )
    ).join("") +
    `</row>`
  );

  guides.forEach((guide, index) => {
    const rowNumber =
      headerRow + 1 + index;

    const hasImage =
      imageSlots.has(index);

    const rowHeight =
      hasImage ? 130 : 64;

    rows.push(
      `<row r="${rowNumber}" ht="${rowHeight}" customHeight="1">` +
        xlsxInlineStringCell(
          `A${rowNumber}`,
          guide.guideId || "",
          3
        ) +
        xlsxInlineStringCell(
          `B${rowNumber}`,
          guide.failure || failure,
          3
        ) +
        xlsxNumberCell(
          `C${rowNumber}`,
          failCount,
          5
        ) +
        xlsxInlineStringCell(
          `D${rowNumber}`,
          guide.detail || "",
          6
        ) +
        xlsxInlineStringCell(
          `E${rowNumber}`,
          guide.author || "",
          3
        ) +
        xlsxInlineStringCell(
          `F${rowNumber}`,
          guide.date || "",
          5
        ) +
        xlsxInlineStringCell(
          `G${rowNumber}`,
          guide.time || "",
          5
        ) +
        xlsxInlineStringCell(
          `H${rowNumber}`,
          hasImage ? "" : "ไม่มีรูป",
          5
        ) +
        xlsxInlineStringCell(
          `I${rowNumber}`,
          guide.imageName || "",
          3
        ) +
        xlsxInlineStringCell(
          `J${rowNumber}`,
          guide.updatedDate || "",
          5
        ) +
        xlsxInlineStringCell(
          `K${rowNumber}`,
          guide.updatedTime || "",
          5
        ) +
      `</row>`
    );
  });

  if (!guides.length) {
    rows.push(
      `<row r="7" ht="36" customHeight="1">` +
        xlsxInlineStringCell(
          "A7",
          "ยังไม่มีวิธีแก้ไขแบบละเอียดที่บันทึกไว้",
          3
        ) +
      `</row>`
    );
  }

  const drawingXml = imageSlots.size
    ? '<drawing r:id="rId1"/>'
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet
  xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>

  <cols>
    <col min="1" max="1" width="20" customWidth="1"/>
    <col min="2" max="2" width="28" customWidth="1"/>
    <col min="3" max="3" width="12" customWidth="1"/>
    <col min="4" max="4" width="70" customWidth="1"/>
    <col min="5" max="5" width="18" customWidth="1"/>
    <col min="6" max="7" width="14" customWidth="1"/>
    <col min="8" max="8" width="38" customWidth="1"/>
    <col min="9" max="9" width="30" customWidth="1"/>
    <col min="10" max="11" width="16" customWidth="1"/>
  </cols>

  <sheetData>
    ${rows.join("")}
  </sheetData>

  <mergeCells count="1">
    <mergeCell ref="A1:K1"/>
  </mergeCells>

  ${drawingXml}
</worksheet>`;
}


function xlsxBuildDrawingFiles(
  imageRecords
) {
  if (!imageRecords.length) {
    return [];
  }

  const anchors = [];
  const rels = [];

  imageRecords.forEach(
    (record, index) => {
      const relId = `rId${index + 1}`;
      const picId = index + 1;

      anchors.push(`
        <xdr:oneCellAnchor>
          <xdr:from>
            <xdr:col>${Number.isInteger(record.imageColumn) ? record.imageColumn : 7}</xdr:col>
            <xdr:colOff>50000</xdr:colOff>
            <xdr:row>${record.sheetRow - 1}</xdr:row>
            <xdr:rowOff>50000</xdr:rowOff>
          </xdr:from>

          <xdr:ext
            cx="${Number.isFinite(record.cx) ? record.cx : 3048000}"
            cy="${Number.isFinite(record.cy) ? record.cy : 1524000}"
          />

          <xdr:pic>
            <xdr:nvPicPr>
              <xdr:cNvPr
                id="${picId}"
                name="${xlsxXmlEscape(record.name || `Image ${picId}`)}"
              />
              <xdr:cNvPicPr/>
            </xdr:nvPicPr>

            <xdr:blipFill>
              <a:blip r:embed="${relId}"/>
              <a:stretch><a:fillRect/></a:stretch>
            </xdr:blipFill>

            <xdr:spPr>
              <a:xfrm>
                <a:off x="0" y="0"/>
                <a:ext
                  cx="${Number.isFinite(record.cx) ? record.cx : 3048000}"
                  cy="${Number.isFinite(record.cy) ? record.cy : 1524000}"
                />
              </a:xfrm>
              <a:prstGeom prst="rect">
                <a:avLst/>
              </a:prstGeom>
            </xdr:spPr>
          </xdr:pic>

          <xdr:clientData/>
        </xdr:oneCellAnchor>
      `);

      rels.push(
        `<Relationship
          Id="${relId}"
          Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
          Target="../media/image${picId}.${record.extension}"
        />`
      );
    }
  );

  const drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr
  xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  ${anchors.join("")}
</xdr:wsDr>`;

  const drawingRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rels.join("")}
</Relationships>`;

  const sheetRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship
    Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing"
    Target="../drawings/drawing1.xml"
  />
</Relationships>`;

  return [
    {
      name: "xl/drawings/drawing1.xml",
      data: drawingXml
    },
    {
      name: "xl/drawings/_rels/drawing1.xml.rels",
      data: drawingRels
    },
    {
      name: "xl/worksheets/_rels/sheet1.xml.rels",
      data: sheetRels
    }
  ];
}


function downloadBinaryFile(
  filename,
  bytes,
  mimeType
) {
  const blob = new Blob(
    [bytes],
    {
      type: mimeType
    }
  );

  const url = URL.createObjectURL(
    blob
  );

  const link = document.createElement(
    "a"
  );

  link.href = url;
  link.download = filename;

  document.body.appendChild(
    link
  );

  link.click();
  link.remove();

  window.setTimeout(
    () => URL.revokeObjectURL(url),
    2000
  );
}


async function exportCurrentFailureDetailXlsx() {
  const failure = normalizeFailure(
    activeFailureName
  );

  if (!failure) {
    toast(
      "กรุณาเปิด Failure ที่ต้องการ Export ก่อน",
      "error"
    );
    return;
  }

  const button =
    $("#exportCurrentFailureExcelBtn");

  const originalText =
    button.textContent;

  button.disabled = true;
  button.textContent =
    "กำลังสร้าง Excel...";

  try {
    const guides = Array.isArray(
      currentFailureGuides
    )
      ? currentFailureGuides
      : [];

    const failCount =
      Number(currentFailureCount) ||
      countFailureOccurrences(failure);

    const imageRecords = [];
    const imageSlots = new Set();

    for (
      let index = 0;
      index < guides.length;
      index++
    ) {
      const guide = guides[index];

      if (
        !guide.imageFileId &&
        !guide.imageUrl
      ) {
        continue;
      }

      try {
        const loaded =
          await loadGuideImageForXlsx(
            guide
          );

        if (!loaded) continue;

        imageSlots.add(index);

        imageRecords.push({
          ...loaded,
          guideIndex: index,
          sheetRow: 7 + index
        });

      } catch (err) {
        console.warn(
          "Skip image in XLSX:",
          guide.guideId,
          err
        );
      }
    }

    const entries =
      xlsxWorkbookBaseEntries(
        imageRecords.length > 0
      );

    entries.push({
      name:
        "xl/worksheets/sheet1.xml",
      data:
        xlsxBuildFailureSheetXml(
          failure,
          failCount,
          guides,
          imageSlots
        )
    });

    entries.push(
      ...xlsxBuildDrawingFiles(
        imageRecords
      )
    );

    imageRecords.forEach(
      (record, index) => {
        entries.push({
          name:
            `xl/media/image${index + 1}.${record.extension}`,
          data:
            record.bytes
        });
      }
    );

    const zipBytes =
      xlsxBuildZip(entries);

    const failurePart =
      sanitizeExportFilePart(
        failure
      ) || "Failure";

    downloadBinaryFile(
      `${failurePart}_Detailed_Guide_${exportTimestamp()}.xlsx`,
      zipBytes,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    const embeddedCount =
      imageRecords.length;

    toast(
      embeddedCount
        ? `Export ${failure} พร้อมรูปจริง ${embeddedCount} รูปแล้ว`
        : `Export ${failure} แล้ว (ไม่มีรูปที่ฝังได้)`,
      "success"
    );

  } catch (err) {
    console.error(err);

    toast(
      err.message ||
      "สร้าง Excel Failure Detail ไม่สำเร็จ",
      "error"
    );

  } finally {
    button.disabled = false;
    button.textContent =
      originalText;
  }
}



/* ---------- Admin Failure Guide ---------- */

async function loadAdminFailureGuides() {
  if (!adminLoggedIn) return false;

  try {
    const res = await jsonp("failureGuides");

    if (!res.ok) {
      throw new Error(res.error || "โหลด Failure Guide ไม่สำเร็จ");
    }

    allFailureGuides = Array.isArray(res.guides)
      ? res.guides
      : [];

    renderAdminFailureGuides();
    return true;

  } catch (err) {
    console.error(err);
    $("#adminGuideTableBody").innerHTML =
      '<tr><td colspan="6" class="empty">โหลด Failure Guide ไม่สำเร็จ</td></tr>';
    return false;
  }
}


function renderAdminFailureGuides() {
  if (!adminLoggedIn) return;

  const q = $("#adminGuideSearchBox").value.trim().toLowerCase();

  const guides = allFailureGuides.filter(guide => {
    const blob = [
      guide.guideId,
      guide.failure,
      guide.detail,
      guide.author,
      guide.date,
      guide.time
    ].join(" ").toLowerCase();

    return !q || blob.includes(q);
  });

  $("#adminGuideCount").textContent = `${guides.length} รายการ`;

  const body = $("#adminGuideTableBody");

  if (!guides.length) {
    body.innerHTML =
      '<tr><td colspan="6" class="empty">ไม่พบ Failure Guide</td></tr>';
    return;
  }

  body.innerHTML = guides.map(guide => `
    <tr>
      <td><strong>${esc(guide.guideId || "")}</strong></td>
      <td>${esc(guide.failure || "")}</td>
      <td class="admin-guide-detail-cell">${esc(guide.detail || "")}</td>
      <td>${esc(guide.author || "-")}</td>
      <td>${esc(guide.date || "")}</td>
      <td class="admin-actions-cell">
        <button
          type="button"
          class="admin-guide-edit-btn"
          data-id="${escAttr(guide.guideId || "")}"
        >แก้ไข</button>
        <button
          type="button"
          class="admin-guide-delete-btn"
          data-id="${escAttr(guide.guideId || "")}"
        >ลบ</button>
      </td>
    </tr>
  `).join("");

  body.querySelectorAll(".admin-guide-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const guide = allFailureGuides.find(
        item => String(item.guideId) === String(btn.dataset.id)
      );

      if (guide) selectAdminFailureGuide(guide);
    });
  });

  body.querySelectorAll(".admin-guide-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      deleteAdminFailureGuide(btn.dataset.id);
    });
  });
}


function selectAdminFailureGuide(guide) {
  adminSelectedGuideId = String(guide.guideId || "");

  $("#adminGuideEditId").value = guide.guideId || "";
  $("#adminGuideEditFailure").value = guide.failure || "";
  $("#adminGuideEditDetail").value = guide.detail || "";
  $("#adminGuideEditAuthor").value = guide.author || "";
  $("#adminGuideRemoveImage").checked = false;

  clearAdminGuideNewImage();

  const image = resolveGuideImage(guide);

  if (image.fileId || image.thumbnailUrl) {
    const currentImage = $("#adminGuideCurrentImage");

    $("#adminGuideCurrentImageWrap").classList.remove("hidden");
    currentImage.style.display = "";
    currentImage.onerror = null;
    currentImage.dataset.fileid = image.fileId || "";
    currentImage.src = image.thumbnailUrl || "";

    currentImage.onerror = async () => {
      const id = normalizeDriveFileId(
        currentImage.dataset.fileid
      );

      if (!id) {
        currentImage.style.display = "none";
        return;
      }

      try {
        currentImage.onerror = null;
        currentImage.src = await getDriveImageData(id);
      } catch (err) {
        console.error(err);
        currentImage.style.display = "none";
      }
    };

  } else {
    const currentImage = $("#adminGuideCurrentImage");

    $("#adminGuideCurrentImageWrap").classList.add("hidden");
    currentImage.onerror = null;
    currentImage.style.display = "";
    currentImage.dataset.fileid = "";
    currentImage.removeAttribute("src");
  }

  $("#adminGuideSaveEditBtn").disabled = false;

  if (window.innerWidth < 900) {
    $("#adminGuideEditForm").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}


function clearAdminGuideNewImage() {
  adminGuideNewImage = null;

  const input = $("#adminGuideNewImage");
  if (input) input.value = "";

  $("#adminGuideNewImagePreview").removeAttribute("src");
  $("#adminGuideNewImagePreviewWrap").classList.add("hidden");
}


function clearAdminGuideEditor() {
  adminSelectedGuideId = "";

  const form = $("#adminGuideEditForm");
  if (form) form.reset();

  if ($("#adminGuideEditId")) {
    $("#adminGuideEditId").value = "";
  }

  if ($("#adminGuideCurrentImageWrap")) {
    $("#adminGuideCurrentImageWrap").classList.add("hidden");
  }

  if ($("#adminGuideCurrentImage")) {
    const currentImage = $("#adminGuideCurrentImage");
    currentImage.onerror = null;
    currentImage.style.display = "";
    currentImage.dataset.fileid = "";
    currentImage.removeAttribute("src");
  }

  clearAdminGuideNewImage();

  if ($("#adminGuideSaveEditBtn")) {
    $("#adminGuideSaveEditBtn").disabled = true;
  }
}


async function saveAdminFailureGuideEdit(event) {
  event.preventDefault();

  if (!adminLoggedIn || !adminSelectedGuideId) {
    toast("กรุณาเลือก Failure Guide ที่ต้องการแก้ไข", "error");
    return;
  }

  const failure = normalizeFailure($("#adminGuideEditFailure").value);
  const detail = $("#adminGuideEditDetail").value.trim();
  const author = $("#adminGuideEditAuthor").value.trim();

  if (!failure || !detail) {
    toast("Failure และวิธีแก้ไขแบบละเอียดห้ามว่าง", "error");
    return;
  }

  const btn = $("#adminGuideSaveEditBtn");
  btn.disabled = true;
  btn.textContent = "กำลังบันทึก...";

  try {
    await sendAdminOperation("adminGuideUpdate", {
      guideId: adminSelectedGuideId,
      failure,
      detail,
      author,
      removeImage: $("#adminGuideRemoveImage").checked ? "true" : "false",
      imageName: adminGuideNewImage ? adminGuideNewImage.name : "",
      imageMimeType: adminGuideNewImage ? adminGuideNewImage.mimeType : "",
      imageBase64: adminGuideNewImage ? adminGuideNewImage.base64 : ""
    });

    toast("แก้ไข Failure Guide แล้ว", "success");

    await loadAdminFailureGuides();

    const updated = allFailureGuides.find(
      item => String(item.guideId) === String(adminSelectedGuideId)
    );

    if (updated) {
      selectAdminFailureGuide(updated);
    }

    if (
      activeFailureName &&
      normalizeFailure(activeFailureName).toLowerCase() ===
      normalizeFailure(failure).toLowerCase()
    ) {
      await openFailureDetailModal(failure);
    }

  } catch (err) {
    console.error(err);
    toast(err.message || "แก้ไข Failure Guide ไม่สำเร็จ", "error");

  } finally {
    btn.disabled = false;
    btn.textContent = "บันทึก Guide";
  }
}


async function deleteAdminFailureGuide(guideId) {
  if (!adminLoggedIn) return;

  const guide = allFailureGuides.find(
    item => String(item.guideId) === String(guideId)
  );

  const label = guide
    ? `${guide.failure}\n${guide.detail}`
    : guideId;

  if (!confirm(`ลบ Failure Guide นี้หรือไม่?\n\n${label}`)) {
    return;
  }

  try {
    await sendAdminOperation("adminGuideDelete", { guideId });

    if (adminSelectedGuideId === String(guideId)) {
      clearAdminGuideEditor();
    }

    await loadAdminFailureGuides();
    toast("ลบ Failure Guide แล้ว", "success");

    if (activeFailureName) {
      await openFailureDetailModal(activeFailureName);
    }

  } catch (err) {
    console.error(err);
    toast(err.message || "ลบ Failure Guide ไม่สำเร็จ", "error");
  }
}




/* =========================
   DASHBOARD EXCEL EXPORT
   V22.6
   - Uses current Dashboard filters
   - Embeds Top Failure + Timeline as real PNG charts in XLSX
   - KPI + Failure Ranking are exported in the same worksheet
========================= */

function getDashboardExportContext() {
  const type = $("#dashboardPeriodType").value;
  const model = $("#dashboardModel").value || "ALL";
  const station = $("#dashboardStation").value || "ALL";

  let periodValue = "ALL";
  let periodLabel = "ทั้งหมด";

  if (type === "day") {
    periodValue = $("#dashboardDay").value || "ALL";
    periodLabel = periodValue;
  } else if (type === "week") {
    periodValue = $("#dashboardWeek").value || "ALL";
    periodLabel = periodValue;
  } else if (type === "month") {
    periodValue = $("#dashboardMonth").value || "ALL";
    periodLabel = periodValue;
  } else if (type === "year") {
    periodValue = $("#dashboardYear").value || "ALL";
    periodLabel = periodValue;
  }

  const typeLabels = {
    all: "ALL",
    day: "รายวัน",
    week: "รายสัปดาห์",
    month: "รายเดือน",
    year: "1 ปี"
  };

  return {
    type,
    typeLabel: typeLabels[type] || type,
    periodValue,
    periodLabel,
    model,
    station,
    topFailureCount:
      Number($("#topFailureCount").value || 5)
  };
}


function getDashboardKpiData(records) {
  const repairTimes = records
    .map(record => Number(record.repairTime))
    .filter(value =>
      Number.isFinite(value) &&
      value >= 0
    );

  const average = repairTimes.length
    ? repairTimes.reduce(
        (sum, value) => sum + value,
        0
      ) / repairTimes.length
    : 0;

  const models = new Set(
    records
      .map(record =>
        String(record.model || "").trim()
      )
      .filter(Boolean)
  );

  const stations = new Set(
    records
      .map(record =>
        String(record.station || "").trim()
      )
      .filter(Boolean)
  );

  return {
    totalRecords: records.length,
    averageRepairTime: Math.round(average),
    modelCount: models.size,
    stationCount: stations.size
  };
}


function getDashboardTopFailureData(records) {
  const requestedLimit =
    Number($("#topFailureCount").value || 5);

  const limit = Number.isFinite(
    requestedLimit
  )
    ? Math.min(
        99,
        Math.max(
          0,
          Math.trunc(requestedLimit)
        )
      )
    : 5;

  const allGroups = aggregateFailures(
    records
  ).sort(
    (a, b) =>
      b.count - a.count ||
      a.failure.localeCompare(
        b.failure
      )
  );

  const groups =
    limit === 0
      ? []
      : allGroups.slice(0, limit);

  return {
    limit,
    total: records.length,
    groups
  };
}


function getDashboardTimelineData(records) {
  const type =
    $("#dashboardPeriodType").value;

  const groups = new Map();

  records.forEach(record => {
    const date =
      parseRepairDate(record.date);

    if (!date) return;

    let key;
    let label;

    if (type === "day") {
      const hour =
        parseRecordHour(record.time);

      if (hour === null) return;

      key = String(hour).padStart(
        2,
        "0"
      );

      label =
        `${String(hour).padStart(2, "0")}:00`;

    } else if (type === "week") {
      key = toDateInputValue(date);
      label = formatShortDate(date);

    } else if (type === "month") {
      key = toDateInputValue(date);
      label = formatShortDate(date);

    } else if (type === "year") {
      key = toMonthInputValue(date);
      label = formatMonthLabel(date);

    } else {
      key = toMonthInputValue(date);
      label = formatMonthYearLabel(date);
    }

    groups.set(
      key,
      {
        label,
        count:
          (groups.get(key)?.count || 0) +
          1
      }
    );
  });

  let values = Array.from(
    groups.entries()
  )
    .sort(
      (a, b) =>
        a[0].localeCompare(b[0])
    )
    .map(([, value]) => value);

  let subtitle =
    "จำนวน Repair Records ตามช่วงเวลา";

  if (type === "day") {
    values = buildHourlyTimeline(groups);
    subtitle =
      "จำนวน Repair Records แยกตามชั่วโมง";

  } else if (type === "week") {
    subtitle =
      "จำนวน Repair Records แยกตามวันในสัปดาห์";

  } else if (type === "month") {
    subtitle =
      "จำนวน Repair Records แยกตามวันในเดือน";

  } else if (type === "year") {
    values =
      buildYearlyMonthTimeline(groups);

    subtitle =
      "จำนวน Repair Records แยกตามเดือนของปีที่เลือก";

  } else {
    subtitle =
      "จำนวน Repair Records ทั้งหมด แยกตามเดือน";
  }

  return {
    type,
    subtitle,
    values
  };
}


function dashboardCanvasColors() {
  const root =
    getComputedStyle(
      document.documentElement
    );

  const read = (name, fallback) => {
    const value =
      root.getPropertyValue(name).trim();

    return value || fallback;
  };

  return {
    primary: read(
      "--primary",
      "#155eef"
    ),
    primaryDark: read(
      "--primary-dark",
      "#004eeb"
    ),
    text: read(
      "--text",
      "#182230"
    ),
    muted: read(
      "--muted",
      "#667085"
    ),
    line: read(
      "--line",
      "#d8e1ec"
    ),
    soft: read(
      "--soft",
      "#eef4ff"
    ),
    background: "#ffffff"
  };
}


function canvasRoundRect(
  ctx,
  x,
  y,
  width,
  height,
  radius
) {
  const r = Math.min(
    radius,
    width / 2,
    height / 2
  );

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(
    x + width,
    y,
    x + width,
    y + r
  );
  ctx.lineTo(
    x + width,
    y + height - r
  );
  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - r,
    y + height
  );
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(
    x,
    y + height,
    x,
    y + height - r
  );
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(
    x,
    y,
    x + r,
    y
  );
  ctx.closePath();
}


function canvasFitText(
  ctx,
  text,
  maxWidth
) {
  const source =
    String(text || "");

  if (
    ctx.measureText(source).width <=
    maxWidth
  ) {
    return source;
  }

  let output = source;

  while (
    output.length > 1 &&
    ctx.measureText(
      output + "…"
    ).width > maxWidth
  ) {
    output = output.slice(0, -1);
  }

  return output + "…";
}


function createTopFailureChartPng(
  groups,
  total,
  limit
) {
  const colors =
    dashboardCanvasColors();

  const width = 820;
  const rowHeight = 72;
  const height = Math.max(
    360,
    116 +
      Math.max(
        groups.length,
        1
      ) *
      rowHeight
  );

  const canvas =
    document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const ctx =
    canvas.getContext("2d");

  ctx.fillStyle =
    colors.background;

  ctx.fillRect(
    0,
    0,
    width,
    height
  );

  ctx.fillStyle = colors.text;
  ctx.font =
    "700 25px Arial, sans-serif";

  ctx.fillText(
    "Top Failure",
    28,
    38
  );

  ctx.fillStyle = colors.muted;
  ctx.font =
    "14px Arial, sans-serif";

  ctx.fillText(
    limit === 0
      ? "เลือก 0 รายการ — ไม่แสดง Top Failure"
      : `Top ${limit} Failure จาก ${total} Repair Records`,
    28,
    65
  );

  if (!groups.length) {
    ctx.fillStyle = colors.muted;
    ctx.font =
      "16px Arial, sans-serif";

    ctx.fillText(
      "ยังไม่มีข้อมูลในช่วงที่เลือก",
      28,
      120
    );

    return dataUrlToXlsxImage(
      canvas.toDataURL("image/png")
    );
  }

  const maxCount = Math.max(
    ...groups.map(
      group => group.count
    ),
    1
  );

  groups.forEach(
    (group, index) => {
      const top =
        92 +
        index * rowHeight;

      const pct = total > 0
        ? (group.count / total) * 100
        : 0;

      const barWidth =
        (group.count / maxCount) *
        470;

      ctx.fillStyle =
        colors.primary;

      ctx.font =
        "700 14px Arial, sans-serif";

      ctx.fillText(
        String(index + 1),
        28,
        top + 17
      );

      ctx.fillStyle =
        colors.text;

      ctx.font =
        "700 15px Arial, sans-serif";

      const label =
        canvasFitText(
          ctx,
          group.failure,
          520
        );

      ctx.fillText(
        label,
        58,
        top + 17
      );

      ctx.textAlign = "right";
      ctx.fillText(
        String(group.count),
        width - 30,
        top + 17
      );
      ctx.textAlign = "left";

      ctx.fillStyle =
        colors.soft;

      canvasRoundRect(
        ctx,
        58,
        top + 29,
        650,
        13,
        7
      );

      ctx.fill();

      ctx.fillStyle =
        colors.primary;

      canvasRoundRect(
        ctx,
        58,
        top + 29,
        Math.max(
          8,
          barWidth
        ),
        13,
        7
      );

      ctx.fill();

      ctx.fillStyle =
        colors.muted;

      ctx.font =
        "12px Arial, sans-serif";

      ctx.fillText(
        `${pct.toFixed(1)}% ของทั้งหมด · Avg. Repair ${Math.round(group.avgRepairTime)} min`,
        58,
        top + 61
      );
    }
  );

  return dataUrlToXlsxImage(
    canvas.toDataURL("image/png")
  );
}


function createTimelineChartPng(
  timeline
) {
  const colors =
    dashboardCanvasColors();

  const values =
    Array.isArray(timeline.values)
      ? timeline.values
      : [];

  const minWidth = 820;

  const width = Math.max(
    minWidth,
    90 +
      Math.max(
        values.length,
        1
      ) *
      58
  );

  const height = 500;

  const canvas =
    document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const ctx =
    canvas.getContext("2d");

  ctx.fillStyle =
    colors.background;

  ctx.fillRect(
    0,
    0,
    width,
    height
  );

  ctx.fillStyle = colors.text;
  ctx.font =
    "700 25px Arial, sans-serif";

  ctx.fillText(
    "Timeline",
    28,
    38
  );

  ctx.fillStyle = colors.muted;
  ctx.font =
    "14px Arial, sans-serif";

  ctx.fillText(
    timeline.subtitle,
    28,
    65
  );

  if (
    !values.length ||
    !values.some(
      value => value.count > 0
    )
  ) {
    ctx.fillStyle = colors.muted;
    ctx.font =
      "16px Arial, sans-serif";

    ctx.fillText(
      "ยังไม่มีข้อมูลในช่วงที่เลือก",
      28,
      120
    );

    return dataUrlToXlsxImage(
      canvas.toDataURL("image/png")
    );
  }

  const chartLeft = 48;
  const chartRight = 28;
  const chartTop = 105;
  const chartBottom = 72;

  const chartWidth =
    width -
    chartLeft -
    chartRight;

  const chartHeight =
    height -
    chartTop -
    chartBottom;

  const maxCount = Math.max(
    ...values.map(
      value => value.count
    ),
    1
  );

  ctx.strokeStyle =
    colors.line;

  ctx.lineWidth = 1;

  for (
    let grid = 0;
    grid <= 4;
    grid++
  ) {
    const y =
      chartTop +
      (chartHeight / 4) *
      grid;

    ctx.beginPath();
    ctx.moveTo(
      chartLeft,
      y
    );
    ctx.lineTo(
      width - chartRight,
      y
    );
    ctx.stroke();
  }

  const slot =
    chartWidth /
    Math.max(
      values.length,
      1
    );

  const barWidth =
    Math.max(
      12,
      Math.min(
        34,
        slot * 0.55
      )
    );

  values.forEach(
    (value, index) => {
      const barHeight =
        value.count > 0
          ? Math.max(
              5,
              (value.count / maxCount) *
              chartHeight
            )
          : 0;

      const x =
        chartLeft +
        slot * index +
        (slot - barWidth) / 2;

      const y =
        chartTop +
        chartHeight -
        barHeight;

      ctx.fillStyle =
        colors.primary;

      if (barHeight > 0) {
        canvasRoundRect(
          ctx,
          x,
          y,
          barWidth,
          barHeight,
          5
        );

        ctx.fill();
      }

      if (value.count > 0) {
        ctx.fillStyle =
          colors.text;

        ctx.font =
          "700 11px Arial, sans-serif";

        ctx.textAlign = "center";

        ctx.fillText(
          String(value.count),
          x + barWidth / 2,
          y - 7
        );
      }

      ctx.fillStyle =
        colors.muted;

      ctx.font =
        "10px Arial, sans-serif";

      ctx.textAlign = "center";

      ctx.save();

      ctx.translate(
        x + barWidth / 2,
        chartTop +
          chartHeight +
          19
      );

      if (
        values.length > 14
      ) {
        ctx.rotate(
          -Math.PI / 4
        );
      }

      ctx.fillText(
        String(value.label || ""),
        0,
        0
      );

      ctx.restore();
    }
  );

  ctx.textAlign = "left";

  return dataUrlToXlsxImage(
    canvas.toDataURL("image/png")
  );
}


function xlsxBuildDashboardSheetXml({
  context,
  kpis,
  topFailure,
  timeline,
  rankingStartRow,
  hasTopChart,
  hasTimelineChart
}) {
  const rows = [];

  rows.push(
    `<row r="1" ht="30" customHeight="1">` +
      xlsxInlineStringCell(
        "A1",
        "Failure Dashboard Export",
        2
      ) +
    `</row>`
  );

  rows.push(
    `<row r="2">` +
      xlsxInlineStringCell(
        "A2",
        "มุมมองเวลา",
        1
      ) +
      xlsxInlineStringCell(
        "B2",
        context.typeLabel,
        3
      ) +
      xlsxInlineStringCell(
        "D2",
        "ช่วงที่เลือก",
        1
      ) +
      xlsxInlineStringCell(
        "E2",
        context.periodLabel,
        3
      ) +
      xlsxInlineStringCell(
        "G2",
        "Model",
        1
      ) +
      xlsxInlineStringCell(
        "H2",
        context.model,
        3
      ) +
      xlsxInlineStringCell(
        "J2",
        "Station",
        1
      ) +
      xlsxInlineStringCell(
        "K2",
        context.station,
        3
      ) +
    `</row>`
  );

  rows.push(
    `<row r="3">` +
      xlsxInlineStringCell(
        "A3",
        "จำนวน Top Failure",
        1
      ) +
      xlsxNumberCell(
        "B3",
        context.topFailureCount,
        5
      ) +
      xlsxInlineStringCell(
        "D3",
        "Exported At",
        1
      ) +
      xlsxInlineStringCell(
        "E3",
        new Date().toLocaleString("th-TH"),
        3
      ) +
    `</row>`
  );

  rows.push(
    `<row r="5" ht="24" customHeight="1">` +
      xlsxInlineStringCell(
        "A5",
        "Repair Records",
        1
      ) +
      xlsxInlineStringCell(
        "D5",
        "Avg. Repair Time",
        1
      ) +
      xlsxInlineStringCell(
        "G5",
        "Models",
        1
      ) +
      xlsxInlineStringCell(
        "J5",
        "Stations",
        1
      ) +
    `</row>`
  );

  rows.push(
    `<row r="6" ht="34" customHeight="1">` +
      xlsxNumberCell(
        "A6",
        kpis.totalRecords,
        4
      ) +
      xlsxNumberCell(
        "D6",
        kpis.averageRepairTime,
        4
      ) +
      xlsxNumberCell(
        "G6",
        kpis.modelCount,
        4
      ) +
      xlsxNumberCell(
        "J6",
        kpis.stationCount,
        4
      ) +
    `</row>`
  );

  const topLabelRow = 8;

  rows.push(
    `<row r="${topLabelRow}" ht="24" customHeight="1">` +
      xlsxInlineStringCell(
        `A${topLabelRow}`,
        hasTopChart
          ? "Top Failure"
          : "Top Failure — ไม่มีข้อมูล",
        1
      ) +
      xlsxInlineStringCell(
        `G${topLabelRow}`,
        hasTimelineChart
          ? "Timeline"
          : "Timeline — ไม่มีข้อมูล",
        1
      ) +
    `</row>`
  );

  const headerRow =
    rankingStartRow;

  rows.push(
    `<row r="${headerRow}" ht="26" customHeight="1">` +
      xlsxInlineStringCell(
        `A${headerRow}`,
        "อันดับ",
        1
      ) +
      xlsxInlineStringCell(
        `B${headerRow}`,
        "Failure / Symptom",
        1
      ) +
      xlsxInlineStringCell(
        `G${headerRow}`,
        "จำนวน",
        1
      ) +
      xlsxInlineStringCell(
        `H${headerRow}`,
        "% ของทั้งหมด",
        1
      ) +
      xlsxInlineStringCell(
        `J${headerRow}`,
        "Avg. Repair Time",
        1
      ) +
    `</row>`
  );

  topFailure.groups.forEach(
    (group, index) => {
      const row =
        headerRow + 1 + index;

      const pct =
        topFailure.total > 0
          ? (
              group.count /
              topFailure.total
            ) *
            100
          : 0;

      rows.push(
        `<row r="${row}" ht="30" customHeight="1">` +
          xlsxNumberCell(
            `A${row}`,
            index + 1,
            5
          ) +
          xlsxInlineStringCell(
            `B${row}`,
            group.failure,
            3
          ) +
          xlsxNumberCell(
            `G${row}`,
            group.count,
            5
          ) +
          xlsxInlineStringCell(
            `H${row}`,
            `${pct.toFixed(1)}%`,
            5
          ) +
          xlsxInlineStringCell(
            `J${row}`,
            `${Math.round(group.avgRepairTime)} min`,
            5
          ) +
        `</row>`
      );
    }
  );

  if (!topFailure.groups.length) {
    rows.push(
      `<row r="${headerRow + 1}">` +
        xlsxInlineStringCell(
          `A${headerRow + 1}`,
          "ยังไม่มีข้อมูล Failure Ranking",
          3
        ) +
      `</row>`
    );
  }

  const drawingXml =
    hasTopChart ||
    hasTimelineChart
      ? '<drawing r:id="rId1"/>'
      : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet
  xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">

  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>

  <cols>
    <col min="1" max="1" width="12" customWidth="1"/>
    <col min="2" max="6" width="18" customWidth="1"/>
    <col min="7" max="7" width="12" customWidth="1"/>
    <col min="8" max="9" width="17" customWidth="1"/>
    <col min="10" max="12" width="18" customWidth="1"/>
  </cols>

  <sheetData>
    ${rows.join("")}
  </sheetData>

  <mergeCells count="9">
    <mergeCell ref="A1:L1"/>
    <mergeCell ref="A5:C5"/>
    <mergeCell ref="D5:F5"/>
    <mergeCell ref="G5:I5"/>
    <mergeCell ref="J5:L5"/>
    <mergeCell ref="A6:C6"/>
    <mergeCell ref="D6:F6"/>
    <mergeCell ref="G6:I6"/>
    <mergeCell ref="J6:L6"/>
  </mergeCells>

  ${drawingXml}
</worksheet>`;
}


async function exportDashboardExcel() {
  const button =
    $("#exportDashboardExcelBtn");

  const originalText =
    button.textContent;

  button.disabled = true;
  button.textContent =
    "กำลังสร้าง Excel...";

  try {
    const records =
      getDashboardFilteredRecords();

    const context =
      getDashboardExportContext();

    const kpis =
      getDashboardKpiData(records);

    const topFailure =
      getDashboardTopFailureData(
        records
      );

    const timeline =
      getDashboardTimelineData(
        records
      );

    const imageRecords = [];

    let topImage = null;
    let timelineImage = null;

    try {
      topImage =
        createTopFailureChartPng(
          topFailure.groups,
          topFailure.total,
          topFailure.limit
        );

      const topDisplayWidth =
        720;

      const topDisplayHeight =
        Math.min(
          1000,
          Math.max(
            360,
            topImage.bytes.length
              ? 116 +
                Math.max(
                  topFailure.groups.length,
                  1
                ) *
                72
              : 360
          )
        );

      imageRecords.push({
        ...topImage,
        name: "Top Failure",
        sheetRow: 9,
        imageColumn: 0,
        cx:
          topDisplayWidth *
          9525,
        cy:
          topDisplayHeight *
          9525
      });

    } catch (err) {
      console.warn(
        "Top Failure chart export failed:",
        err
      );
    }

    try {
      timelineImage =
        createTimelineChartPng(
          timeline
        );

      const timelineWidth =
        Math.min(
          1200,
          Math.max(
            720,
            100 +
              Math.max(
                timeline.values.length,
                1
              ) *
              55
          )
        );

      imageRecords.push({
        ...timelineImage,
        name: "Timeline",
        sheetRow: 9,
        imageColumn: 6,
        cx:
          timelineWidth *
          9525,
        cy:
          500 *
          9525
      });

    } catch (err) {
      console.warn(
        "Timeline chart export failed:",
        err
      );
    }

    const topRowsNeeded =
      topFailure.groups.length
        ? Math.ceil(
            Math.min(
              1000,
              116 +
              topFailure.groups.length *
              72
            ) / 20
          )
        : 18;

    const timelineRowsNeeded =
      Math.ceil(
        500 / 20
      );

    const rankingStartRow =
      10 +
      Math.max(
        topRowsNeeded,
        timelineRowsNeeded
      ) +
      2;

    const sheetXml =
      xlsxBuildDashboardSheetXml({
        context,
        kpis,
        topFailure,
        timeline,
        rankingStartRow,
        hasTopChart:
          Boolean(topImage),
        hasTimelineChart:
          Boolean(timelineImage)
      });

    const entries =
      xlsxBuildSingleSheetEntries({
        sheetName:
          "Failure Dashboard",
        sheetXml,
        imageRecords
      });

    const zipBytes =
      xlsxBuildZip(entries);

    const periodPart =
      sanitizeExportFilePart(
        context.periodValue
      ) || "ALL";

    const modelPart =
      sanitizeExportFilePart(
        context.model
      ) || "ALL_MODEL";

    const stationPart =
      sanitizeExportFilePart(
        context.station
      ) || "ALL_STATION";

    downloadBinaryFile(
      `Failure_Dashboard_${periodPart}_${modelPart}_${stationPart}_${exportTimestamp()}.xlsx`,
      zipBytes,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    toast(
      `Export Dashboard ${records.length} Records พร้อมกราฟแล้ว`,
      "success"
    );

  } catch (err) {
    console.error(err);

    toast(
      err.message ||
      "Export Dashboard Excel ไม่สำเร็จ",
      "error"
    );

  } finally {
    button.disabled = false;
    button.textContent =
      originalText;
  }
}



/* =========================
   ADMIN
========================= */

function bindAdmin() {
  $("#adminLoginForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = $("#adminUsername").value.trim();
    const password = $("#adminPassword").value;

    if (!username) {
      toast("กรุณาใส่ User", "error");
      return;
    }

    const hash = await sha256(password);

    // SHA-256 of password: adminmin
    if (hash !== "74da6b097821eee22b14dff779bf7ed422b1bac41e98e356a176e1f50f36a3a4") {
      toast("Password ไม่ถูกต้อง", "error");
      return;
    }

    const backend = await checkAdminBackendVersion();

    if (!backend.ok) {
      toast(backend.error, "error");
      return;
    }

    adminLoggedIn = true;
    adminSessionUser = username;
    adminSessionPassword = password;

    $("#adminLoginCard").classList.add("hidden");
    $("#adminWorkspace").classList.remove("hidden");
    $("#adminSessionUser").textContent = `User: ${username}`;
    $("#adminBackendStatus").textContent = `Backend: ${backend.version}`;
    $("#adminBackendStatus").classList.add("ok");

    renderAdminTable();
    await loadAdminFailureGuides();
    toast("เข้าสู่ Admin แล้ว", "success");
  });

  $("#adminLogoutBtn").addEventListener("click", logoutAdmin);
  $("#adminReloadBtn").addEventListener("click", async () => {
    await refreshAllData({ showToast: true });
    await loadAdminFailureGuides();
  });

  $("#adminNormalizeBtn").addEventListener("click", normalizeAllAdminRecords);

  $("#adminSearchBox").addEventListener("input", renderAdminTable);
  $("#adminClearEditBtn").addEventListener("click", clearAdminEditor);

  $("#adminEditStartRepair").addEventListener("input", updateAdminRepairTimeHint);
  $("#adminEditFinishRepair").addEventListener("input", updateAdminRepairTimeHint);

  $("#adminEditForm").addEventListener("submit", saveAdminEdit);
}

async function sha256(text) {
  const data = new TextEncoder().encode(String(text || ""));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function checkAdminBackendVersion() {
  try {
    const res = await jsonp("health");

    const version = String(
      res.apiVersion ||
      String(res.message || "").match(/V\d+/)?.[0] ||
      ""
    );

    if (!res.ok) {
      return {
        ok: false,
        error: res.error || "Backend health check ไม่สำเร็จ"
      };
    }

    if (version !== REQUIRED_BACKEND_VERSION) {
      return {
        ok: false,
        error:
          `Frontend V22.3 ต้องใช้ Apps Script ${REQUIRED_BACKEND_VERSION} แต่ Backend ตอนนี้เป็น ${version || "เวอร์ชันเก่า"} ` +
          `กรุณา Deploy → Manage deployments → Edit → New version → Deploy`
      };
    }

    if (!validateHistoryDisplayContract(res.historyDisplayOrder)) {
      return {
        ok: false,
        error:
          "Frontend/API History order ไม่ตรงกัน กรุณาใช้ Frontend และ Code.gs จาก V22.2 ชุดเดียวกัน"
      };
    }

    return {
      ok: true,
      version
    };

  } catch (err) {
    return {
      ok: false,
      error: "ตรวจสอบ Apps Script Backend ไม่สำเร็จ"
    };
  }
}


function createAdminOpId() {
  return (
    "op_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 12)
  );
}



async function pollOperationStatus(opId) {
  // V22.1: เพิ่มเวลารอ เพราะ Save รูป + Failure Summary อาจใช้เวลามากกว่าเดิม
  for (let attempt = 0; attempt < 40; attempt++) {
    await sleep(attempt === 0 ? 300 : 450);

    let status;

    try {
      status = await jsonp("adminOpStatus", { opId });
    } catch (err) {
      continue;
    }

    if (status && status.error && /Unknown action/i.test(status.error)) {
      throw new Error(
        "Apps Script ต้องเป็น V22.2 สำหรับ Frontend V22.3 นี้ กรุณาตรวจ Deployment"
      );
    }

    if (status && status.pending === true) {
      continue;
    }

    if (status && status.pending === false) {
      if (!status.ok) {
        throw new Error(status.error || "Operation failed");
      }

      return status;
    }
  }

  throw new Error(
    "ไม่ได้รับผลตอบกลับจาก Apps Script ภายในเวลาที่กำหนด " +
    "กรุณาตรวจ config.json และ Deployment"
  );
}

async function sendSaveOperation(values) {
  const opId = createAdminOpId();

  const body = new URLSearchParams({
    action: "save",
    opId,
    ...values
  });

  await fetch(GAS_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body
  });

  return pollOperationStatus(opId);
}


async function sendAdminOperation(action, values) {
  const opId = createAdminOpId();

  const body = new URLSearchParams({
    action,
    opId,
    adminPassword: adminSessionPassword,
    ...values
  });

  await fetch(GAS_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body
  });

  return pollOperationStatus(opId);
}

function logoutAdmin() {
  adminLoggedIn = false;
  adminSessionUser = "";
  adminSessionPassword = "";
  adminSelectedRepairId = "";
  adminSelectedGuideId = "";
  allFailureGuides = [];
  clearAdminGuideEditor();

  $("#adminPassword").value = "";
  $("#adminWorkspace").classList.add("hidden");
  $("#adminLoginCard").classList.remove("hidden");
  clearAdminEditor();
}

function renderAdminTable() {
  if (!adminLoggedIn) return;

  const q = $("#adminSearchBox").value.trim().toLowerCase();

  const records = allRecords.filter(r => {
    const blob = [
      r.repairId, r.model, r.station, r.failure,
      r.repairAction, r.repairBy
    ].join(" ").toLowerCase();

    return !q || blob.includes(q);
  });

  $("#adminRecordCount").textContent = `${records.length} รายการ`;

  const body = $("#adminTableBody");

  if (!records.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty">ไม่พบข้อมูล</td></tr>';
    return;
  }

  body.innerHTML = records.map(r => `
    <tr>
      <td><strong>${esc(r.repairId)}</strong></td>
      <td>${esc(r.model)}</td>
      <td>${esc(r.station)}</td>
      <td>${esc(r.failure)}</td>
      <td>${esc(r.repairBy)}</td>
      <td class="admin-actions-cell">
        <button type="button"
          class="admin-edit-btn"
          data-id="${escAttr(r.repairId)}">แก้ไข</button>
        <button type="button"
          class="admin-delete-btn"
          data-id="${escAttr(r.repairId)}">ลบ</button>
      </td>
    </tr>
  `).join("");

  document.querySelectorAll(".admin-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const record = allRecords.find(r => String(r.repairId) === btn.dataset.id);
      if (record) selectAdminRecord(record);
    });
  });

  document.querySelectorAll(".admin-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteAdminRecord(btn.dataset.id));
  });
}

function selectAdminRecord(record) {
  adminSelectedRepairId = String(record.repairId || "");

  $("#adminEditRepairId").value = record.repairId || "";
  $("#adminEditDate").value = record.date || "";
  $("#adminEditTime").value = record.time || "";
  $("#adminEditModel").value = record.model || "";
  $("#adminEditStation").value = record.station || "";
  $("#adminEditFailure").value = record.failure || "";
  $("#adminEditRepairAction").value = record.repairAction || "";
  $("#adminEditStartRepair").value = normalizeTimeForInput(record.startRepair);
  $("#adminEditFinishRepair").value = normalizeTimeForInput(record.finishRepair);
  $("#adminEditRepairBy").value = record.repairBy || "";
  $("#adminRemoveImage").checked = false;

  const image = resolveRecordImage(record);

  if (image.fileId || image.thumbnailUrl) {
    $("#adminCurrentImageWrap").classList.remove("hidden");
    $("#adminCurrentImage").dataset.fileid = image.fileId || "";
    $("#adminCurrentImage").src = image.thumbnailUrl || "";

    $("#adminCurrentImage").onerror = async () => {
      const id = normalizeDriveFileId($("#adminCurrentImage").dataset.fileid);

      if (!id) {
        $("#adminCurrentImage").style.display = "none";
        return;
      }

      try {
        $("#adminCurrentImage").onerror = null;
        $("#adminCurrentImage").src = await getDriveImageData(id);
      } catch (err) {
        console.error(err);
        $("#adminCurrentImage").style.display = "none";
      }
    };
  } else {
    $("#adminCurrentImageWrap").classList.add("hidden");
    $("#adminCurrentImage").removeAttribute("src");
  }

  $("#adminSaveEditBtn").disabled = false;
  updateAdminRepairTimeHint();

  if (window.innerWidth < 900) {
    $("#adminEditForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function normalizeTimeForInput(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);

  if (!match) return "";

  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function updateAdminRepairTimeHint() {
  const start = $("#adminEditStartRepair").value;
  const finish = $("#adminEditFinishRepair").value;

  if (!start || !finish) {
    $("#adminSaveEditBtn").title = "Repair Time จะว่างถ้าไม่ได้กรอกเวลาเริ่ม/เสร็จครบ";
    return;
  }

  const minutes = calculateRepairMinutes(start, finish);
  $("#adminSaveEditBtn").title =
    minutes === null ? "" : `Repair Time หลังบันทึก = ${minutes} นาที`;
}

function clearAdminEditor() {
  adminSelectedRepairId = "";
  $("#adminEditForm").reset();
  $("#adminEditRepairId").value = "";
  $("#adminCurrentImageWrap").classList.add("hidden");
  $("#adminCurrentImage").removeAttribute("src");
  $("#adminSaveEditBtn").disabled = true;
}


function normalizeComparableText(value) {
  return String(value ?? "").trim();
}

function recordMatchesExpected(record, expected) {
  if (!record) return false;

  return Object.entries(expected).every(([key, value]) =>
    normalizeComparableText(record[key]) === normalizeComparableText(value)
  );
}

async function saveAdminEdit(e) {
  e.preventDefault();

  if (!adminLoggedIn || !adminSelectedRepairId) {
    toast("กรุณาเลือก Record ที่ต้องการแก้ไข", "error");
    return;
  }

  const start = $("#adminEditStartRepair").value;
  const finish = $("#adminEditFinishRepair").value;

  if ((start && !finish) || (!start && finish)) {
    toast("ถ้ากรอกเวลา ต้องกรอกทั้งเริ่มซ่อมและซ่อมเสร็จ", "error");
    return;
  }

  const btn = $("#adminSaveEditBtn");
  btn.disabled = true;
  btn.textContent = "กำลังบันทึก...";

  try {
    const expected = {
      date: $("#adminEditDate").value.trim(),
      time: $("#adminEditTime").value.trim(),
      model: $("#adminEditModel").value.trim(),
      station: $("#adminEditStation").value.trim(),
      failure: $("#adminEditFailure").value.trim(),
      repairAction: $("#adminEditRepairAction").value.trim(),
      startRepair: start,
      finishRepair: finish,
      repairBy: $("#adminEditRepairBy").value.trim()
    };

    await sendAdminOperation("adminUpdate", {
      repairId: adminSelectedRepairId,
      ...expected,
      removeImage: $("#adminRemoveImage").checked ? "true" : "false"
    });

    const updated = await waitForRecordState(
      adminSelectedRepairId,
      record => recordMatchesExpected(record, expected),
      7
    );

    if (updated) {
      selectAdminRecord(updated);
      renderAdminTable();
      toast("แก้ไขข้อมูลเรียบร้อย และรีเฟรชแล้ว", "success");
    } else {
      toast("แก้ไขสำเร็จ แต่รีเฟรชข้อมูลไม่ทัน กรุณากดรีเฟรช", "error");
    }

  } catch (err) {
    console.error(err);
    toast(err.message || "แก้ไขข้อมูลไม่สำเร็จ", "error");

  } finally {
    btn.disabled = false;
    btn.textContent = "บันทึกการแก้ไข";
  }
}

async function normalizeAllAdminRecords() {
  if (!adminLoggedIn) return;

  const confirmed = confirm(
    "จัดข้อมูลเก่าทั้งหมดให้ตรงช่อง A:N หรือไม่?\n\n" +
    "ระบบจะอ่านแต่ละแถวก่อน แล้วเขียนกลับเป็น:\n" +
    "Repair ID / วันที่ / เวลา / Model / Station / Failure / Repair Action / " +
    "เริ่มซ่อม / ซ่อมเสร็จ / Repair Time / คนทำ / Image File ID / Image URL / Image Name\n\n" +
    "แนะนำให้ทำครั้งเดียวหลังอัปเดต V20"
  );

  if (!confirmed) return;

  const btn = $("#adminNormalizeBtn");
  btn.disabled = true;
  btn.textContent = "กำลังจัดข้อมูล...";

  try {
    const status = await sendAdminOperation(
      "adminNormalizeAll",
      {}
    );

    await refreshAllData();
    clearAdminEditor();

    const backupText = status.backupSheet
      ? ` · Backup: ${status.backupSheet}`
      : "";

    toast(
      `จัดข้อมูลเรียบร้อย ${status.normalizedRows || 0} รายการ${backupText}`,
      "success"
    );

  } catch (err) {
    console.error(err);
    toast(
      err.message || "จัดข้อมูลไม่สำเร็จ",
      "error"
    );

  } finally {
    btn.disabled = false;
    btn.textContent = "จัดข้อมูลเก่าให้ตรงช่อง";
  }
}


async function deleteAdminRecord(repairId) {
  if (!adminLoggedIn) return;

  const record = allRecords.find(r => String(r.repairId) === String(repairId));
  const label = record
    ? `${record.repairId}\n${record.model} / ${record.station}`
    : repairId;

  if (!confirm(`ต้องการลบ Record นี้หรือไม่?\n\n${label}\n\nการลบจะลบแถวจาก Google Sheet`)) {
    return;
  }

  try {
    await sendAdminOperation("adminDelete", {
      repairId: String(repairId)
    });

    await waitForRecordState(
      repairId,
      record => !record
    );

    const stillExists = allRecords.some(
      r => String(r.repairId) === String(repairId)
    );

    if (!stillExists) {
      if (adminSelectedRepairId === String(repairId)) {
        clearAdminEditor();
      }

      renderAdminTable();
      toast("ลบ Record เรียบร้อย และรีเฟรชแล้ว", "success");
    } else {
      toast("ลบสำเร็จแต่หน้าเว็บยังเห็น Record อยู่ กรุณากดรีเฟรช", "error");
    }

  } catch (err) {
    console.error(err);
    toast(err.message || "ลบข้อมูลไม่สำเร็จ", "error");
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setStatus(text, ok) {
  const el = $("#apiStatus");
  el.textContent = text;
  el.style.background =
    ok ? "rgba(6,118,71,.28)" : "rgba(217,45,32,.28)";
}

function toast(text, type = "") {
  const el = $("#toast");
  el.textContent = text;
  el.className = `toast show ${type}`;

  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    el.className = "toast";
  }, 3300);
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escAttr(value) {
  return esc(value);
}

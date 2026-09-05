const FRONTEND_VERSION = 'V22.3';
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


function exportCurrentHistoryExcel() {
  const records = getCurrentHistoryFilteredRecords();

  if (!records.length) {
    toast(
      "ไม่มีข้อมูล History ตาม Search / Model Filter ปัจจุบัน",
      "error"
    );
    return;
  }

  const context = currentHistoryExportContext();

  const rows = [
    [
      { value: "Failure / Symptom", style: "Header" },
      { value: "Repair Action", style: "Header" },
      { value: "รูป", style: "Header" },
      { value: "Model", style: "Header" },
      { value: "Station", style: "Header" },
      { value: "เริ่มซ่อม", style: "Header" },
      { value: "ซ่อมเสร็จ", style: "Header" },
      { value: "Repair Time (นาที)", style: "Header" },
      { value: "คนทำ", style: "Header" },
      { value: "Repair ID", style: "Header" }
    ],

    ...records.map(record => {
      const image = resolveRecordImage(record);
      const imageUrl = String(
        image.thumbnailUrl ||
        record.imageUrl ||
        ""
      ).trim();

      return [
        record.failure || "",
        record.repairAction || "",
        imageUrl
          ? {
              value: imageUrl,
              style: "Link",
              href: imageUrl
            }
          : "",
        record.model || "",
        record.station || "",
        record.startRepair || "",
        record.finishRepair || "",
        {
          value:
            Number.isFinite(Number(record.repairTime))
              ? Number(record.repairTime)
              : 0,
          type: "Number",
          style: "Number"
        },
        record.repairBy || "",
        record.repairId || ""
      ];
    })
  ];

  const modelPart = sanitizeExportFilePart(
    context.model === "ALL"
      ? "ALL_MODEL"
      : context.model
  );

  const searchPart = context.search
    ? "_SEARCH_" +
      sanitizeExportFilePart(context.search).slice(0, 28)
    : "";

  const filename =
    `Repair_History_${modelPart}${searchPart}_${exportTimestamp()}.xls`;

  downloadExcelWorkbook(
    filename,
    [
      {
        name: "Repair History",
        rows
      },
      {
        name: "Export Filter",
        rows: [
          [
            { value: "Filter", style: "Header" },
            { value: "Current Value", style: "Header" }
          ],
          ["Search", context.search || "(ไม่ได้ค้นหา)"],
          ["Model Filter", context.model],
          ["Sort", "ไม่มี Model Sort · ใหม่สุดก่อน"],
          [
            "Exported Records",
            {
              value: records.length,
              type: "Number",
              style: "Number"
            }
          ],
          [
            "Export Time",
            new Date().toLocaleString("th-TH")
          ]
        ]
      }
    ]
  );

  toast(
    `Export History ${records.length} รายการแล้ว`,
    "success"
  );
}


async function exportFailureGuidesExcel() {
  const btn = $("#exportFailureGuideExcelBtn");

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "กำลัง Export...";

  try {
    const res = await jsonp("failureGuides");

    if (!res.ok) {
      throw new Error(
        res.error ||
        "โหลด Detailed Failure Guide ไม่สำเร็จ"
      );
    }

    const guides = Array.isArray(res.guides)
      ? res.guides
      : [];

    if (!guides.length) {
      toast(
        "ยังไม่มีวิธีแก้ไขแบบละเอียดให้ Export",
        "error"
      );
      return;
    }

    /*
     * Fail Count ใช้ Repair History ทั้งหมด ไม่ใช้ History Filter
     * เพื่อให้จำนวนครั้งของ Failure เป็น Total จริง.
     */
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

    const rows = [
      [
        { value: "Guide ID", style: "Header" },
        { value: "Failure / Symptom", style: "Header" },
        { value: "Fail Count", style: "Header" },
        { value: "วิธีแก้ไขแบบละเอียด", style: "Header" },
        { value: "ผู้เพิ่ม", style: "Header" },
        { value: "วันที่", style: "Header" },
        { value: "เวลา", style: "Header" },
        { value: "รูป", style: "Header" },
        { value: "Image Name", style: "Header" },
        { value: "Updated Date", style: "Header" },
        { value: "Updated Time", style: "Header" }
      ],

      ...guides.map(guide => {
        const image = resolveGuideImage(guide);

        const imageUrl = String(
          image.thumbnailUrl ||
          guide.imageUrl ||
          ""
        ).trim();

        const key = normalizeFailure(
          guide.failure
        ).toLocaleLowerCase();

        return [
          guide.guideId || "",
          guide.failure || "",
          {
            value: failCountMap.get(key) || 0,
            type: "Number",
            style: "Number"
          },
          guide.detail || "",
          guide.author || "",
          guide.date || "",
          guide.time || "",
          imageUrl
            ? {
                value: imageUrl,
                style: "Link",
                href: imageUrl
              }
            : "",
          guide.imageName || "",
          guide.updatedDate || "",
          guide.updatedTime || ""
        ];
      })
    ];

    downloadExcelWorkbook(
      `Detailed_Failure_Guide_${exportTimestamp()}.xls`,
      [
        {
          name: "Failure Guides",
          rows
        }
      ]
    );

    toast(
      `Export วิธีแก้ละเอียด ${guides.length} รายการแล้ว`,
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
    btn.disabled = false;
    btn.textContent = originalText;
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

  $("#failureDetailTitle").textContent = failure;
  $("#failureGuideFormFailure").textContent = failure;

  const localCount = countFailureOccurrences(failure);
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

    $("#failureDetailCount").textContent =
      `${Number(res.failCount || 0)} ครั้ง`;

    renderFailureGuides(
      Array.isArray(res.guides) ? res.guides : []
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
  resetFailureGuideForm();
}


function countFailureOccurrences(failureValue) {
  const key = normalizeFailure(failureValue).toLocaleLowerCase();

  return allRecords.filter(record =>
    normalizeFailure(record.failure).toLocaleLowerCase() === key
  ).length;
}


function renderFailureGuides(guides) {
  $("#failureGuideCount").textContent = `${guides.length} วิธีแก้`;

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

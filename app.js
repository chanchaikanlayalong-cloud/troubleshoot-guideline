let APP_CONFIG = null;
let GAS_URL = "";
let allRecords = [];
let selectedImage = null;

const $ = (s) => document.querySelector(s);

document.addEventListener("DOMContentLoaded", async () => {
  bindRepairTime();
  bindImageUpload();
  bindImageModal();
  bindTabs();
  bindForm();
  bindHistory();
  bindDashboard();

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

  await loadModels();
  await loadHistory();
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
  if (!start || !finish) return null;

  const [sh, sm] = start.split(":").map(Number);
  const [fh, fm] = finish.split(":").map(Number);

  if ([sh, sm, fh, fm].some(Number.isNaN)) return null;

  const startMin = sh * 60 + sm;
  let finishMin = fh * 60 + fm;

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
        const maxDimension = 1400;
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.78;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);

        // ลดคุณภาพเพิ่มถ้ารูปหลังย่อยังใหญ่ เพื่อให้ส่งผ่าน Apps Script ได้คล่อง
        while (dataUrl.length > 1_600_000 && quality > 0.48) {
          quality -= 0.08;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }

        if (dataUrl.length > 2_400_000) {
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
    if (e.key === "Escape") closeImageModal();
  });
}

function openImageModal(url, name, fileId) {
  const id = normalizeDriveFileId(fileId) || extractDriveFileId(url);
  const resolvedUrl = id ? buildDriveThumbnailUrl(id) : String(url || "").trim();

  if (!resolvedUrl) {
    toast("ไม่พบ Image File ID / Image URL ของรายการนี้", "error");
    return;
  }

  $("#modalImage").src = resolvedUrl;
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
}

function closeImageModal() {
  $("#imageModal").classList.add("hidden");
  $("#imageModal").setAttribute("aria-hidden", "true");
  $("#modalImage").removeAttribute("src");
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
  let fileId = normalizeDriveFileId(record?.imageFileId);
  const rawUrl = String(record?.imageUrl || "").trim();

  if (!fileId) {
    fileId = extractDriveFileId(rawUrl);
  }

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

function bindTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
      document.querySelectorAll(".page").forEach(x => x.classList.remove("active"));

      btn.classList.add("active");
      $("#" + btn.dataset.page).classList.add("active");

      if (btn.dataset.page === "historyPage" && isConfigured()) {
        loadHistory();
      }

      if (btn.dataset.page === "dashboardPage") {
        initializeDashboardOptions();
        renderDashboard();
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
      const body = new URLSearchParams({
        action: "save",
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

      await fetch(GAS_URL, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body
      });

      toast("ส่งข้อมูลไปยัง Google Sheet แล้ว", "success");
      resetForm();

      setTimeout(() => {
        loadModels();
        loadHistory();
      }, 1500);

    } catch (err) {
      console.error(err);
      toast("ส่งข้อมูลไม่สำเร็จ กรุณาตรวจสอบ Apps Script", "error");
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
  $("#refreshBtn").addEventListener("click", () => {
    loadModels();
    loadHistory();
  });
  $("#searchBox").addEventListener("input", renderHistory);
  $("#filterModel").addEventListener("change", renderHistory);
}

function jsonp(action, extra = {}) {
  return new Promise((resolve, reject) => {
    const callbackName =
      "__repair_cb_" + Date.now() + "_" + Math.floor(Math.random() * 10000);

    const script = document.createElement("script");
    const params = new URLSearchParams({
      action,
      callback: callbackName,
      ...extra
    });

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Request timeout"));
    }, 15000);

    function cleanup() {
      clearTimeout(timer);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP request failed"));
    };

    script.src = GAS_URL + "?" + params.toString();
    document.body.appendChild(script);
  });
}

async function loadModels() {
  try {
    const res = await jsonp("models");

    if (!res.ok) throw new Error(res.error || "โหลด Model ไม่สำเร็จ");

    const models = Array.isArray(res.models) ? res.models : [];

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

  } catch (err) {
    console.error(err);
    setStatus("เชื่อมต่อไม่ได้", false);
    fillModelFallback();
  }
}

function fillModelFallback() {
  $("#modelOptions").innerHTML = "";
}

async function loadHistory() {
  if (!isConfigured()) return;

  const body = $("#historyBody");
  body.innerHTML =
    '<tr><td colspan="12" class="empty">กำลังโหลดข้อมูล...</td></tr>';

  try {
    const res = await jsonp("records");

    if (!res.ok) throw new Error(res.error || "โหลดข้อมูลไม่สำเร็จ");

    allRecords = Array.isArray(res.records) ? res.records : [];
    renderHistory();
    initializeDashboardOptions();
    renderDashboard();
    setStatus("เชื่อมต่อ Google Sheet แล้ว", true);

  } catch (err) {
    console.error(err);
    body.innerHTML =
      '<tr><td colspan="12" class="empty">โหลดข้อมูลไม่สำเร็จ</td></tr>';
    setStatus("เชื่อมต่อไม่ได้", false);
  }
}

function renderHistory() {
  const q = $("#searchBox").value.trim().toLowerCase();
  const model = $("#filterModel").value;

  const filtered = allRecords.filter(r => {
    const modelOk = !model || String(r.model) === model;

    const blob = [
      r.repairId, r.date, r.time, r.model, r.station,
      r.failure, r.repairAction, r.startRepair, r.finishRepair,
      r.repairTime, r.repairBy, r.imageName
    ].join(" ").toLowerCase();

    return modelOk && (!q || blob.includes(q));
  });

  const body = $("#historyBody");

  if (!filtered.length) {
    body.innerHTML =
      '<tr><td colspan="12" class="empty">ไม่พบข้อมูล</td></tr>';
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
          <td data-label="Repair ID"><strong>${esc(r.repairId)}</strong></td>
          <td data-label="วันที่">${esc(r.date)}</td>
          <td data-label="เวลา">${esc(r.time)}</td>
          <td data-label="Model">${esc(r.model)}</td>
          <td data-label="Station">${esc(r.station)}</td>
          <td data-label="Failure / Symptom">${esc(r.failure)}</td>
          <td data-label="Repair Action">${esc(r.repairAction)}</td>
          <td data-label="เริ่มซ่อม">${esc(r.startRepair)}</td>
          <td data-label="ซ่อมเสร็จ">${esc(r.finishRepair)}</td>
          <td data-label="Repair Time (นาที)">${esc(r.repairTime)}</td>
          <td data-label="คนทำ">${esc(r.repairBy)}</td>
          <td data-label="รูป">${imageCell}</td>
        </tr>
      `;
    }).join("");

    document.querySelectorAll(".history-thumb").forEach(img => {
      img.addEventListener("click", () => {
        openImageModal(img.dataset.url, img.dataset.name, img.dataset.fileid);
      });

      img.addEventListener("error", () => {
        img.style.display = "none";

        const fileId =
          normalizeDriveFileId(img.dataset.fileid) ||
          extractDriveFileId(img.dataset.url);

        if (fileId) {
          const a = document.createElement("a");
          a.textContent = "เปิดรูปใน Google Drive";
          a.target = "_blank";
          a.rel = "noopener";
          a.href = buildDriveViewUrl(fileId);
          img.parentElement.appendChild(a);
        } else {
          const span = document.createElement("span");
          span.className = "no-image";
          span.textContent = "ไม่พบ Image File ID";
          img.parentElement.appendChild(span);
        }
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
    await loadHistory();
    initializeDashboardOptions();
    renderDashboard();
  });
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
  const limit = Number($("#topFailureCount").value || 5);

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
            <span class="failure-name">${esc(g.failure)}</span>
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
        <td>${esc(g.failure)}</td>
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
    const failure = normalizeFailure(r.failure);
    if (!failure) return;

    if (!map.has(failure)) {
      map.set(failure, {
        failure,
        count: 0,
        totalRepairTime: 0,
        repairTimeCount: 0
      });
    }

    const item = map.get(failure);
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
  const match = String(value || "").match(/^(\d{1,2}):/);
  if (!match) return 0;

  const hour = Number(match[1]);
  return Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : 0;
}

function parseRepairDate(value) {
  const text = String(value || "").trim();

  // dd/MM/yyyy
  let m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    let year = Number(m[3]);

    // รองรับ พ.ศ. ถ้ามีข้อมูลเก่าในรูปแบบไทย
    if (year > 2400) year -= 543;

    return new Date(year, month, day, 12, 0, 0);
  }

  // yyyy-MM-dd
  m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

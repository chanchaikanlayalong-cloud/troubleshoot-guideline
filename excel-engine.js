/**
 * ExcelEngineV23 - local/offline helper for XLSX exports.
 */
(function (global) {
  "use strict";

  function sanitizeXmlText(value) {
    return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  }

  function downloadBinaryFile(filename, bytes, mimeType) {
    const blob = new Blob([bytes], { type: mimeType || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  global.ExcelEngineV23 = Object.freeze({
    version: "23.0",
    sanitizeXmlText,
    downloadBinaryFile
  });
})(window);

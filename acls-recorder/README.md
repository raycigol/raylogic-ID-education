# ACLS 急救事件紀錄器

離線可用的 ACLS／CPR 急救事件即時記錄器，含 2 分鐘循環提示、Epinephrine 給藥計時、CPR 分段紀錄，以及事件時間軸的 CSV／PDF 匯出。

整支 App 為**自給自足的單一 HTML 檔**（CSS／JS 全部 inline 於 `index.html`），可直接以瀏覽器開啟，無需伺服器或建置工具。

## 檔案結構

| 檔案 | 說明 |
|------|------|
| `index.html` | 主程式（含全部 UI、邏輯、樣式）|
| `manifest.json` | PWA 應用程式資訊清單 |
| `sw.js` | Service Worker（離線快取與版本更新）|
| `icon-192.png` / `icon-512.png` | PWA 圖示（含 maskable）|
| `apple-touch-icon.png` | iOS 加入主畫面圖示 |
| `script.js` / `style.css` | 目前未使用（邏輯與樣式皆內嵌於 `index.html`）|

## 匯出功能

- **匯出 CSV**：輸出所有事件（床位、病歷號、事件、日期時間、相對時間、內容），以 UTF-8 BOM 編碼，Excel 可正確顯示中文。
- **時間軸 PDF**：開啟列印視窗，內容含摘要（床位／病歷號／急救開始／ROSC／累積 CPR 時間）、CPR 分段紀錄表與完整事件時間軸，版面為 A4，透過瀏覽器列印另存為 PDF。

## 更新紀錄

### v2.9 — 加入離線 PWA 支援

- 新增 `manifest.json`、`sw.js` 與應用程式圖示，讓本工具可「加入主畫面」並**離線啟動**（急救現場網路不穩時仍可秒開使用）。
- Service Worker 採 **cache-first** 策略：離線可冷啟動，同時在背景檢查新版。
- **手動更新機制**：偵測到新版時顯示「有新版本可用」提示列，需使用者點「立即更新」才套用（刻意不自動 `skipWaiting`，避免急救途中畫面被重整）。
- 跨網域請求（例如 Google 表單回饋連結）不攔截，直接放行。

> 發佈新版時，請將 `sw.js` 中的 `CACHE_VERSION` 遞增（例如 `acls-2.9.0` → `acls-2.9.1`），瀏覽器才會安裝新快取並清除舊版。

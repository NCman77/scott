# 智能背誦遮罩工具 v4.0

## 📋 專案概述

這是一個現代化的試卷標註與背誦工具，採用 **ES6 模組化架構**，包含 AI 手寫偵測、多頁面管理、筆刷繪製等功能。

### 主要特色

- ✅ **模組化架構**: 使用 ES6 Class 分離關注點
- 🔐 **安全加密**: Web Crypto API 加密儲存 API Key
- 🤖 **AI 偵測**: Gemini 1.5 Flash 自動偵測手寫文字
- 🖌️ **彈出式筆刷調整**: 電腦 Hover + iPad 雙擊顯示滑桿
- 📱 **觸控優化**: 雙指縮放、滑動換頁、長按退出
- 💾 **專案管理**: 完整的匯入/匯出功能

---

## 🏗️ 專案結構

```
smart-mask-tool/
├── index.html      # 主HTML檔案（語意化標籤 + ARIA）
├── styles.css      # 樣式表（CSS Variables + Flexbox）
└── app.js          # 主程式（ES6 Class 模組化）
    ├── SmartMaskApp        # 主應用類別
    ├── APIManager          # API 管理（加密、驗證、AI請求）
    ├── PageManager         # 頁面管理（匯入、儲存、切換）
    ├── DrawingManager      # 繪圖管理（工具、遮罩、事件）
    ├── UIManager           # UI 管理（Toast、Loading、縮放）
    ├── CryptoUtils         # 加密工具（AES-GCM）
    ├── ValidationUtils     # 驗證工具（輸入檢查）
    └── ImageUtils          # 圖片工具（壓縮、載入）
```

---

## 🚀 快速開始

### 1. 部署方式

**方式 A: 本地開啟**
```bash
# 將三個檔案放在同一資料夾
# 直接用瀏覽器開啟 index.html
```

**方式 B: 本地伺服器（推薦）**
```bash
# Python 3
python -m http.server 8000

# Node.js
npx http-server

# 瀏覽器開啟: http://localhost:8000
```

**方式 C: 部署到 Vercel/Netlify**
```bash
# 直接拖曳資料夾到 Vercel/Netlify
# 或使用 CLI
vercel --prod
```

### 2. 取得 API Key

前往 [Google AI Studio](https://aistudio.google.com/app/apikey) 取得免費的 Gemini API Key（格式：`AIza...`，39字元）。

### 3. 使用流程

1. **輸入 API Key**: 貼上後點擊右側儲存按鈕（會加密儲存）
2. **匯入試卷**: 點擊「匯入」按鈕，支援多選圖片
3. **AI 偵測**: 點擊「偵測」自動標註手寫區域
4. **手動標註**: 使用筆刷/方框工具補充標註
5. **背誦模式**: 開啟 Quiz 模式隱藏答案
6. **儲存專案**: 點擊「儲存」匯出 JSON 檔案

---

## 🎨 功能詳解

### 筆刷大小調整（新功能）

#### 電腦版
- 滑鼠移到筆刷按鈕上，**右側自動浮現滑桿**
- 垂直拖曳調整大小（5-80px）
- 即時預覽圓形大小

#### iPad/平板
1. 點擊選取筆刷工具
2. **雙擊筆刷按鈕**喚出滑桿
3. 垂直拖曳調整大小
4. 點擊外部區域關閉

### 鍵盤快捷鍵

| 按鍵 | 功能 |
|------|------|
| `V` | 切換到瀏覽模式 |
| `R` | 切換到方框工具 |
| `B` | 切換到筆刷工具 |
| `E` | 切換到擦除工具 |
| `←` | 上一頁 |
| `→` | 下一頁 |
| `Esc` | 退出全螢幕 |

### 觸控手勢

- **雙指捏合**: 縮放畫布
- **左右滑動**: 全螢幕模式下換頁
- **長按 0.8s**: 全螢幕模式下退出

---

## 🔧 技術細節

### 架構設計

採用 **關注點分離** 原則，將功能模組化：

```javascript
// 主應用類別
class SmartMaskApp {
    constructor() {
        this.apiManager = new APIManager(this);
        this.pageManager = new PageManager(this);
        this.drawingManager = new DrawingManager(this);
        this.uiManager = new UIManager(this);
    }
}

// 各模組互不干擾，透過主類別溝通
```

### API Key 加密流程

```javascript
// 儲存時加密
const encrypted = await CryptoUtils.encrypt(apiKey);
localStorage.setItem('smart_mask_api_key', encrypted);

// 讀取時解密
const decrypted = await CryptoUtils.decrypt(encrypted);

// 使用 AES-GCM + PBKDF2
// - 100,000 次迭代
// - SHA-256 雜湊
// - 隨機 IV
```

### 圖片壓縮策略

```javascript
// 自動壓縮到 1024px（較長邊）
// JPEG 品質 0.8
// 減少 API 請求大小與記憶體使用
```

### Gemini API 呼叫

```javascript
// 只使用 gemini-1.5-flash（修復錯誤）
// 請求 JSON 格式回應
// 返回 [ymin, xmin, ymax, xmax] 座標（0-1000 scale）
```

---

## 🐛 常見問題

### Q1: API 錯誤 "models/gemini-pro is not found"

**已修復！** v4.0 已移除 `gemini-pro` fallback，只使用 `gemini-1.5-flash`。

### Q2: API Key 格式錯誤

確認格式：
- 以 `AIza` 開頭
- 總長度 39 字元
- 只包含英數字、`_`、`-`

### Q3: 圖片無法匯入

支援格式：JPEG, PNG, WebP  
建議大小：< 10MB

### Q4: 筆刷滑桿無法顯示（iPad）

請**雙擊**筆刷按鈕（非單擊），第一次點擊是選取工具，第二次點擊顯示滑桿。

### Q5: 縮放後繪圖位置偏移

已修正座標轉換邏輯：
```javascript
const scaleX = canvas.width / rect.width;
const realX = (e.clientX - rect.left) * scaleX;
```

---

## 📈 效能優化

### 已實作

- ✅ 圖片壓縮（1024px + 0.8 quality）
- ✅ Canvas 座標快取
- ✅ 事件委派（Event Delegation）
- ✅ CSS Transform 硬體加速

### 未來計劃

- [ ] IndexedDB 儲存大專案
- [ ] Virtual Scrolling 頁面列表
- [ ] Web Worker 處理圖片
- [ ] Service Worker 離線支援

---

## 🔒 安全性

### 已實作

- ✅ API Key 加密儲存（AES-GCM）
- ✅ 輸入驗證（API Key、檔案類型、JSON）
- ✅ 檔名清理（防止路徑穿越）
- ✅ CSP 友好（無 inline script）

### 建議

- 不要在公開場合分享專案 JSON（可能包含敏感資料）
- 定期更新 API Key
- 使用 HTTPS 部署

---

## 🚧 下一步開發建議

### 短期（已完成 ✅）

- ✅ 分離 CSS/JS 檔案
- ✅ API Key 加密
- ✅ 圖片壓縮
- ✅ 輸入驗證
- ✅ 彈出式筆刷調整

### 中期（建議）

- [ ] Undo/Redo 功能（Command Pattern）
- [ ] 多選遮罩批次操作
- [ ] 匯出標註圖片（PNG/PDF）
- [ ] 自訂顏色選擇器
- [ ] 遮罩透明度調整

### 長期（進階）

- [ ] 使用 Vue.js/React 重構
- [ ] TypeScript 型別安全
- [ ] 單元測試（Jest）
- [ ] 協作功能（WebSocket）
- [ ] PWA 離線支援

---

## 📝 授權

MIT License - 自由使用、修改、分發

---

## 🙋 支援

如有問題或建議，請：
1. 檢查本 README 的常見問題
2. 查看瀏覽器 Console 錯誤訊息
3. 確認 API Key 有效且有額度

---

**版本**: 4.0.0  
**最後更新**: 2026-01-18  
**相容性**: Chrome 90+, Safari 14+, Firefox 88+, Edge 90+

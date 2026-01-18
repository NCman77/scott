// ===========================
// 智能背誦遮罩工具 v4.2 - 教學版
// 修復：Gemini API、圖片適應、IndexedDB整合、筆刷單擊
// ===========================

// ========== 常數定義 ==========
const CONFIG = {
    MAX_IMAGE_SIZE: 1024,
    IMAGE_QUALITY: 0.6,  // 降低品質以壓縮 JSON 檔案大小
    BRUSH_SIZE_MIN: 5,
    BRUSH_SIZE_MAX: 80,
    BRUSH_SIZE_DEFAULT: 20,
    ZOOM_MIN: 0.1,
    ZOOM_MAX: 5.0,
    ZOOM_STEP: 0.1,
    STORAGE_KEY_PREFIX: 'smart_mask_',
    ENCRYPTION_SALT: 'smart_mask_v3_salt_2026',
    MAX_HISTORY: 50  // Undo/Redo 最大歷史記錄
};

const TOOL_MODES = {
    VIEW: 'view',
    RECT: 'rect',
    BRUSH: 'brush',
    ERASER: 'eraser'
};

// ========== Command Pattern for Undo/Redo ==========
class Command {
    execute() { }
    undo() { }
}

class AddMaskCommand extends Command {
    constructor(page, mask) {
        super();
        this.page = page;
        this.mask = mask;
    }

    execute() {
        this.page.masks.push(this.mask);
    }

    undo() {
        const index = this.page.masks.indexOf(this.mask);
        if (index > -1) {
            this.page.masks.splice(index, 1);
        }
    }
}

class ClearMasksCommand extends Command {
    constructor(page) {
        super();
        this.page = page;
        this.previousMasks = [...page.masks];
    }

    execute() {
        this.page.masks = [];
    }

    undo() {
        this.page.masks = [...this.previousMasks];
    }
}

class CommandManager {
    constructor(maxHistory = CONFIG.MAX_HISTORY) {
        this.history = [];
        this.currentIndex = -1;
        this.maxHistory = maxHistory;
    }

    execute(command) {
        command.execute();
        this.history = this.history.slice(0, this.currentIndex + 1);
        this.history.push(command);

        if (this.history.length > this.maxHistory) {
            this.history.shift();
        } else {
            this.currentIndex++;
        }
    }

    undo() {
        if (!this.canUndo()) return false;
        const command = this.history[this.currentIndex];
        command.undo();
        this.currentIndex--;
        return true;
    }

    redo() {
        if (!this.canRedo()) return false;
        this.currentIndex++;
        const command = this.history[this.currentIndex];
        command.execute();
        return true;
    }

    canUndo() {
        return this.currentIndex >= 0;
    }

    canRedo() {
        return this.currentIndex < this.history.length - 1;
    }

    clear() {
        this.history = [];
        this.currentIndex = -1;
    }
}

// ========== 工具函式模組 ==========
class CryptoUtils {
    static async encrypt(text) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(text);

            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                encoder.encode(CONFIG.ENCRYPTION_SALT),
                'PBKDF2',
                false,
                ['deriveBits', 'deriveKey']
            );

            const key = await crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: encoder.encode('additional_salt'),
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt']
            );

            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                key,
                data
            );

            const combined = new Uint8Array(iv.length + encrypted.byteLength);
            combined.set(iv, 0);
            combined.set(new Uint8Array(encrypted), iv.length);

            return btoa(String.fromCharCode(...combined));
        } catch (error) {
            console.error('Encryption error:', error);
            return btoa(text);
        }
    }

    static async decrypt(encryptedText) {
        try {
            const encoder = new TextEncoder();
            const decoder = new TextDecoder();

            const combined = Uint8Array.from(atob(encryptedText), c => c.charCodeAt(0));
            const iv = combined.slice(0, 12);
            const encrypted = combined.slice(12);

            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                encoder.encode(CONFIG.ENCRYPTION_SALT),
                'PBKDF2',
                false,
                ['deriveBits', 'deriveKey']
            );

            const key = await crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: encoder.encode('additional_salt'),
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['decrypt']
            );

            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                key,
                encrypted
            );

            return decoder.decode(decrypted);
        } catch (error) {
            console.error('Decryption error:', error);
            try {
                return atob(encryptedText);
            } catch {
                return '';
            }
        }
    }
}

class ValidationUtils {
    static validateApiKey(key) {
        if (!key || typeof key !== 'string') return false;
        return /^AIza[0-9A-Za-z_-]{35}$/.test(key.trim());
    }

    static validateImageFile(file) {
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        return file && validTypes.includes(file.type);
    }

    static validateProjectData(data) {
        if (!data || typeof data !== 'object') return false;
        return (data.pages && Array.isArray(data.pages)) || data.imageSrc;
    }

    static sanitizeFileName(filename) {
        return filename.replace(/[^a-z0-9_-]/gi, '_').substring(0, 50);
    }
}

class ImageUtils {
    static getResizedBase64(img, maxSize = CONFIG.MAX_IMAGE_SIZE) {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
            if (width > maxSize) {
                height = Math.round((height * maxSize) / width);
                width = maxSize;
            }
        } else {
            if (height > maxSize) {
                width = Math.round((width * maxSize) / height);
                height = maxSize;
            }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        return canvas.toDataURL('image/jpeg', CONFIG.IMAGE_QUALITY).split(',')[1];
    }

    static loadImageFromSrc(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    /**
     * 下載 Canvas 為圖片
     */
    static downloadCanvasAsImage(canvas, filename) {
        canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 'image/png');
    }
}

// ========== 核心應用程式類別 ==========
class SmartMaskApp {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvasWrapper = document.getElementById('canvas-wrapper');

        this.pages = [];
        this.currentPageIndex = -1;
        this.mode = TOOL_MODES.VIEW;
        this.isDrawing = false;
        this.brushColor = '#44403c';
        this.brushSize = CONFIG.BRUSH_SIZE_DEFAULT;
        this.isQuizMode = false;
        this.currentZoom = 1.0;

        this.startX = 0;
        this.startY = 0;
        this.currentPath = [];

        this.touchStartX = 0;
        this.touchStartY = 0;
        this.longPressTimer = null;
        this.initialPinchDistance = null;
        this.initialScale = 1.0;

        // 新增 Command Manager
        this.commandManager = new CommandManager();

        this.apiManager = new APIManager(this);
        this.pageManager = new PageManager(this);
        this.drawingManager = new DrawingManager(this);
        this.uiManager = new UIManager(this);

        this.init();
    }

    async init() {
        this.initEventListeners();
        await this.apiManager.loadSavedApiKey();
        this.initKeyboardShortcuts();
        console.log('✅ Smart Mask Tool v4.1 初始化完成');
    }

    initEventListeners() {
        // Header 按鈕
        document.getElementById('save-api-key-btn').addEventListener('click', () =>
            this.apiManager.saveApiKey()
        );
        document.getElementById('ai-detect-btn').addEventListener('click', () =>
            this.apiManager.runAiDetection()
        );
        document.getElementById('import-btn').addEventListener('click', () =>
            document.getElementById('imageLoader').click()
        );
        document.getElementById('save-project-btn').addEventListener('click', () =>
            this.pageManager.saveProject()
        );
        document.getElementById('load-project-btn').addEventListener('click', () =>
            document.getElementById('projectLoader').click()
        );
        document.getElementById('toggle-sidebar-btn').addEventListener('click', () =>
            this.uiManager.toggleSidebar()
        );
        document.getElementById('close-sidebar-btn').addEventListener('click', () =>
            this.uiManager.toggleSidebar()
        );
        document.getElementById('fullscreen-btn').addEventListener('click', () =>
            this.uiManager.toggleFullScreen()
        );
        document.getElementById('exit-fullscreen-btn').addEventListener('click', () =>
            this.uiManager.toggleFullScreen()
        );

        // 檔案輸入
        document.getElementById('imageLoader').addEventListener('change', (e) =>
            this.pageManager.handleImageImport(e)
        );
        document.getElementById('projectLoader').addEventListener('change', (e) =>
            this.pageManager.handleProjectLoad(e)
        );

        // 工具按鈕
        document.querySelectorAll('.tool-btn[data-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                if (mode) this.drawingManager.setMode(mode);
            });
        });

        // Undo/Redo 按鈕
        document.getElementById('btn-undo').addEventListener('click', () =>
            this.executeUndo()
        );
        document.getElementById('btn-redo').addEventListener('click', () =>
            this.executeRedo()
        );

        // 顏色選擇
        document.querySelectorAll('.color-swatch:not(.custom-color)').forEach(swatch => {
            swatch.addEventListener('click', () => this.drawingManager.selectColor(swatch));
        });

        // 自訂顏色選擇器
        const customColorSwatch = document.getElementById('custom-color-swatch');
        const customColorPicker = document.getElementById('custom-color-picker');

        customColorSwatch.addEventListener('click', () => {
            customColorPicker.click();
        });

        customColorPicker.addEventListener('change', (e) => {
            const color = e.target.value;
            this.brushColor = color;

            // 更新所有顏色選擇器的 active 狀態
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            customColorSwatch.classList.add('active');

            // 更新筆刷預覽顏色
            const preview = document.getElementById('brush-preview-circle');
            if (preview) {
                preview.style.backgroundColor = color;
            }

            this.uiManager.showToast(`已選擇自訂顏色 ${color}`);
        });

        // 筆刷大小控制
        this.initBrushSizeControl();

        // 縮放控制
        document.getElementById('zoom-in-btn').addEventListener('click', () =>
            this.uiManager.adjustZoom(CONFIG.ZOOM_STEP)
        );
        document.getElementById('zoom-out-btn').addEventListener('click', () =>
            this.uiManager.adjustZoom(-CONFIG.ZOOM_STEP)
        );
        document.getElementById('zoom-fit-btn').addEventListener('click', () =>
            this.uiManager.fitToScreen()
        );

        // 頁面導航
        document.getElementById('prev-page-btn').addEventListener('click', () =>
            this.pageManager.changePage(-1)
        );
        document.getElementById('next-page-btn').addEventListener('click', () =>
            this.pageManager.changePage(1)
        );

        // 背誦模式
        document.getElementById('toggle-quiz').addEventListener('change', (e) =>
            this.drawingManager.toggleQuizMode(e.target.checked)
        );
        document.getElementById('toggle-masks-btn').addEventListener('click', () =>
            this.drawingManager.toggleAllMasks()
        );
        document.getElementById('clear-masks-btn').addEventListener('click', () =>
            this.drawingManager.clearCurrentPageMasks()
        );

        // Canvas 繪圖事件
        this.canvas.addEventListener('mousedown', (e) => this.drawingManager.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.drawingManager.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.drawingManager.handleMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.drawingManager.handleMouseUp(e));

        this.canvas.addEventListener('touchstart', (e) => this.drawingManager.handleTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.drawingManager.handleTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.drawingManager.handleTouchEnd(e));

        this.canvas.addEventListener('touchstart', (e) => this.handleFullscreenSwipe(e, 'start'), { passive: true });
        this.canvas.addEventListener('touchend', (e) => this.handleFullscreenSwipe(e, 'end'), { passive: true });
    }

    initBrushSizeControl() {
        const brushBtn = document.getElementById('btn-brush');
        const popup = document.getElementById('brush-size-popup');
        const slider = document.getElementById('brush-size-slider');
        const valueDisplay = document.getElementById('brush-size-value');
        const preview = document.getElementById('brush-preview-circle');

        const updatePreview = (size) => {
            this.brushSize = size;
            valueDisplay.textContent = size;
            const previewSize = Math.min(size, 40);
            preview.style.width = previewSize + 'px';
            preview.style.height = previewSize + 'px';
            preview.style.backgroundColor = this.brushColor;
        };

        slider.addEventListener('input', (e) => {
            updatePreview(parseInt(e.target.value));
        });

        // 所有設備：單擊筆刷按鈕彈出滑桿
        brushBtn.addEventListener('click', (e) => {
            // 延遲處理，避免與工具切換衝突
            setTimeout(() => {
                if (this.mode === TOOL_MODES.BRUSH) {
                    popup.classList.toggle('show');
                }
            }, 100);
            e.stopPropagation();
        });

        // 點擊其他地方關閉彈窗
        document.addEventListener('click', (e) => {
            if (!popup.contains(e.target) && !brushBtn.contains(e.target)) {
                popup.classList.remove('show');
            }
        });

        updatePreview(CONFIG.BRUSH_SIZE_DEFAULT);
    }

    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' && e.target.type !== 'color') return;

            // Undo/Redo
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.executeRedo();
                } else {
                    this.executeUndo();
                }
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                this.executeRedo();
                return;
            }

            switch (e.key.toLowerCase()) {
                case 'v':
                    this.drawingManager.setMode(TOOL_MODES.VIEW);
                    break;
                case 'r':
                    this.drawingManager.setMode(TOOL_MODES.RECT);
                    break;
                case 'b':
                    this.drawingManager.setMode(TOOL_MODES.BRUSH);
                    break;
                case 'e':
                    this.drawingManager.setMode(TOOL_MODES.ERASER);
                    break;
                case 'escape':
                    if (document.body.classList.contains('presentation-mode')) {
                        this.uiManager.toggleFullScreen();
                    }
                    break;
                case 'arrowleft':
                    this.pageManager.changePage(-1);
                    break;
                case 'arrowright':
                    this.pageManager.changePage(1);
                    break;
            }
        });
    }

    executeUndo() {
        if (this.commandManager.undo()) {
            this.drawingManager.draw();
            this.updateUndoRedoButtons();
            this.uiManager.showToast('已復原');
        }
    }

    executeRedo() {
        if (this.commandManager.redo()) {
            this.drawingManager.draw();
            this.updateUndoRedoButtons();
            this.uiManager.showToast('已重做');
        }
    }

    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('btn-undo');
        const redoBtn = document.getElementById('btn-redo');

        undoBtn.disabled = !this.commandManager.canUndo();
        redoBtn.disabled = !this.commandManager.canRedo();
    }

    handleFullscreenSwipe(e, phase) {
        if (!document.body.classList.contains('presentation-mode')) return;

        if (phase === 'start') {
            this.touchStartX = e.touches[0].clientX;

            this.longPressTimer = setTimeout(() => {
                this.uiManager.toggleFullScreen();
            }, 800);
        } else if (phase === 'end') {
            clearTimeout(this.longPressTimer);

            const touchEndX = e.changedTouches[0].clientX;
            const diff = touchEndX - this.touchStartX;

            if (Math.abs(diff) > 100) {
                if (diff > 0) {
                    this.pageManager.changePage(-1);
                } else {
                    this.pageManager.changePage(1);
                }
            }
        }
    }
}

// ========== API 管理模組 ==========
class APIManager {
    constructor(app) {
        this.app = app;
        this.apiKeyInput = document.getElementById('header-api-key');
    }

    async loadSavedApiKey() {
        const encrypted = localStorage.getItem(CONFIG.STORAGE_KEY_PREFIX + 'api_key');
        if (encrypted) {
            try {
                const decrypted = await CryptoUtils.decrypt(encrypted);
                this.apiKeyInput.value = decrypted;
            } catch (error) {
                console.error('Failed to load API key:', error);
            }
        }
    }

    async saveApiKey() {
        const key = this.apiKeyInput.value.trim();

        if (!key) {
            this.app.uiManager.showToast('請輸入 API Key');
            return;
        }

        if (!ValidationUtils.validateApiKey(key)) {
            this.app.uiManager.showToast('API Key 格式錯誤（應為 AIza 開頭，39字元）');
            return;
        }

        try {
            const encrypted = await CryptoUtils.encrypt(key);
            localStorage.setItem(CONFIG.STORAGE_KEY_PREFIX + 'api_key', encrypted);
            this.app.uiManager.showToast('✅ API Key 已加密儲存');
        } catch (error) {
            console.error('Failed to save API key:', error);
            this.app.uiManager.showToast('❌ 儲存失敗');
        }
    }

    async runAiDetection() {
        if (this.app.currentPageIndex === -1) {
            this.app.uiManager.showToast('請先選擇頁面');
            return;
        }

        const apiKey = this.apiKeyInput.value.trim();
        if (!apiKey) {
            alert('請先輸入 API Key');
            return;
        }

        if (!ValidationUtils.validateApiKey(apiKey)) {
            alert('API Key 格式錯誤');
            return;
        }

        this.app.uiManager.showLoading(true, 'AI 分析中...');

        try {
            const page = this.app.pages[this.app.currentPageIndex];
            const base64 = ImageUtils.getResizedBase64(page.imageObj);

            const masksData = await this.callGemini(apiKey, base64);

            if (masksData && masksData.length > 0) {
                const w = this.app.canvas.width;
                const h = this.app.canvas.height;

                masksData.forEach(box => {
                    const newMask = {
                        id: Date.now() + Math.random(),
                        type: 'rect',
                        x: (box[1] / 1000) * w,
                        y: (box[0] / 1000) * h,
                        w: ((box[3] - box[1]) / 1000) * w,
                        h: ((box[2] - box[0]) / 1000) * h,
                        visible: true,
                        color: this.app.brushColor
                    };

                    // 使用 Command Pattern
                    const command = new AddMaskCommand(page, newMask);
                    this.app.commandManager.execute(command);
                });

                this.app.drawingManager.draw();
                this.app.updateUndoRedoButtons();
                this.app.uiManager.showToast(`✅ 新增 ${masksData.length} 個遮罩`);
            } else {
                this.app.uiManager.showToast('未偵測到手寫文字');
            }
        } catch (error) {
            console.error('AI Detection Error:', error);
            alert(`AI 偵測錯誤：${error.message}`);
        } finally {
            this.app.uiManager.showLoading(false);
        }
    }

    async callGemini(apiKey, base64Image) {
        // 使用最新 Gemini 3 Flash Preview（2025/12 最新，手寫/Vision 超強）
        // 如果出錯，會自動降級到 gemini-2.5-flash
        let model = 'gemini-3-flash-preview';  // 最推薦：vision/multimodal 接近人類水平
        let url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        // 專業 Prompt：針對英文試卷優化（word bank、箭頭、圈選、垂直布局）
        const prompt = `你是專業的考試試卷分析AI，專門偵測印刷題目 + 各種手寫答案（成人工整連筆/下劃線/箭頭，或兒童歪扭塗鴉/圈選/簡單圖畫）。

圖片是英文試卷，可能包含：
- 印刷題幹、題號、word bank（單字框）、選項、填空線、圖片（如動物）
- 手寫答案：填詞、圈選數字/選項/圖畫、下劃線、箭頭指向正確答案、塗改

任務：為每個獨立題目（從題號開始到下一個題號前）產生精準矩形框，必須包含相關手寫答案（箭頭、圈選、下劃線、填空）。

輸出嚴格 JSON（無任何多餘文字）：
{
  "boxes": [
    [ymin, xmin, ymax, xmax],
    [ymin, xmin, ymax, xmax]
  ]
}

座標範圍：0-1000（整數）

規則（很重要）：
- 框緊貼題目內容 + 手寫答案，不要太大或合併多題
- 箭頭/下劃線/圈選必須包含進框（視為答案一部分）
- word bank 如果被箭頭指向，包含相關部分
- 垂直排列題目要分開偵測
- 忽略標頭/簽名/頁碼/分數等非題目區
- 支援中英文手寫、數字、符號
- 如果無手寫，也框印刷題目
- 如果圖片空白，回傳 {"boxes": []}

範例：{"boxes": [[100, 50, 200, 300], [250, 50, 350, 300]]}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        {
                            inline_data: {
                                mime_type: "image/jpeg",
                                data: base64Image
                            }
                        }
                    ]
                }]
                // v1beta API 不支援 response_mime_type，改用文字解析
            })
        });

        // 如果 gemini-3-flash-preview 出錯（API Key 不支援），自動降級到 gemini-2.5-flash
        if (!response.ok) {
            const errorText = await response.text();
            if (errorText.includes('not found') || errorText.includes('not supported')) {
                console.warn('gemini-3-flash-preview 不支援，降級到 gemini-2.5-flash');
                model = 'gemini-2.5-flash';
                url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

                const retryResponse = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: prompt },
                                {
                                    inline_data: {
                                        mime_type: "image/jpeg",
                                        data: base64Image
                                    }
                                }
                            ]
                        }]
                    })
                });

                if (!retryResponse.ok) {
                    const retryError = await retryResponse.json();
                    throw new Error(retryError.error?.message || 'API 請求失敗');
                }

                const retryData = await retryResponse.json();
                const textContent = retryData.candidates?.[0]?.content?.parts?.[0]?.text;
                return this.parseGeminiResponse(textContent);
            } else {
                const errorData = JSON.parse(errorText);
                throw new Error(errorData.error?.message || 'API 請求失敗');
            }
        }

        const data = await response.json();
        const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
        return this.parseGeminiResponse(textContent);
    }

    parseGeminiResponse(textContent) {
        if (textContent) {
            try {
                // 嘗試解析 JSON（可能包含在 markdown 程式碼區塊中）
                let jsonText = textContent.trim();

                // 移除可能的 markdown 程式碼區塊標記
                if (jsonText.startsWith('```')) {
                    jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
                }

                const parsed = JSON.parse(jsonText);
                return parsed.boxes || [];
            } catch (parseError) {
                console.error('JSON 解析錯誤:', parseError, '\n原始文字:', textContent);
                return [];
            }
        }

        return [];
    }
}

// ========== 頁面管理模組 ==========
class PageManager {
    constructor(app) {
        this.app = app;
    }

    async handleImageImport(event) {
        const files = event.target.files;
        if (!files.length) return;

        this.app.uiManager.showLoading(true, '匯入圖片中...');

        try {
            const validFiles = Array.from(files).filter(file =>
                ValidationUtils.validateImageFile(file)
            );

            if (validFiles.length === 0) {
                throw new Error('沒有有效的圖片檔案');
            }

            validFiles.sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
            );

            const newPages = [];
            for (const file of validFiles) {
                try {
                    const pageData = await this.readFileAsPage(file);
                    newPages.push(pageData);
                } catch (error) {
                    console.error(`Failed to load ${file.name}:`, error);
                }
            }

            if (newPages.length > 0) {
                this.app.pages = this.app.pages.concat(newPages);
                if (this.app.currentPageIndex === -1) {
                    this.app.currentPageIndex = 0;
                }

                document.getElementById('welcome-msg').style.display = 'none';
                this.renderPageList();
                this.loadCurrentPage();
                this.app.uiManager.showToast(`✅ 匯入 ${newPages.length} 頁`);
            }
        } catch (error) {
            alert(`匯入錯誤：${error.message}`);
        } finally {
            event.target.value = '';
            this.app.uiManager.showLoading(false);
        }
    }

    readFileAsPage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    resolve({
                        id: Date.now() + Math.random().toString(36),
                        name: file.name,
                        imageObj: img,
                        masks: []
                    });
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async handleProjectLoad(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.app.uiManager.showLoading(true, '讀取專案中...');

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);

                if (!ValidationUtils.validateProjectData(data)) {
                    throw new Error('專案檔案格式錯誤');
                }

                this.app.pages = [];
                this.app.commandManager.clear();  // 清空歷史記錄

                if (data.pages && Array.isArray(data.pages)) {
                    for (const p of data.pages) {
                        const img = await ImageUtils.loadImageFromSrc(p.imageSrc);
                        this.app.pages.push({
                            id: p.id || Date.now(),
                            name: p.name || 'Page',
                            imageObj: img,
                            masks: p.masks || []
                        });
                    }
                } else if (data.imageSrc) {
                    const img = await ImageUtils.loadImageFromSrc(data.imageSrc);
                    this.app.pages.push({
                        id: Date.now(),
                        name: 'Project',
                        imageObj: img,
                        masks: data.masks || []
                    });
                }

                if (this.app.pages.length > 0) {
                    this.app.currentPageIndex = 0;
                    document.getElementById('welcome-msg').style.display = 'none';
                    this.renderPageList();
                    this.loadCurrentPage();
                    this.app.updateUndoRedoButtons();
                    this.app.uiManager.showToast('✅ 讀取成功');
                }
            } catch (error) {
                alert(`讀取錯誤：${error.message}`);
            } finally {
                event.target.value = '';
                this.app.uiManager.showLoading(false);
            }
        };

        reader.onerror = () => {
            alert('檔案讀取失敗');
            this.app.uiManager.showLoading(false);
        };

        reader.readAsText(file);
    }

    saveProject() {
        if (this.app.pages.length === 0) {
            this.app.uiManager.showToast('無內容可儲存');
            return;
        }

        let fileName = prompt("輸入檔名:", "exam_data");
        if (fileName === null) return;
        if (!fileName) fileName = "exam_data";

        fileName = ValidationUtils.sanitizeFileName(fileName);

        this.app.uiManager.showLoading(true, '儲存中...');

        try {
            const serializablePages = this.app.pages.map(p => ({
                id: p.id,
                name: p.name,
                imageSrc: p.imageObj.src,
                masks: p.masks
            }));

            const data = {
                version: "4.1",
                timestamp: new Date().toISOString(),
                pages: serializablePages
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: "application/json"
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            a.href = url;
            a.download = `${fileName}_${dateStr}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.app.uiManager.showToast('✅ 儲存成功');
        } catch (error) {
            alert(`儲存錯誤：${error.message}`);
        } finally {
            this.app.uiManager.showLoading(false);
        }
    }

    /**
     * 匯出當前頁面為圖片
     */
    exportCurrentImage() {
        if (this.app.currentPageIndex === -1) {
            this.app.uiManager.showToast('請先選擇頁面');
            return;
        }

        const page = this.app.pages[this.app.currentPageIndex];
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const filename = `${page.name.replace(/\.(jpg|jpeg|png|webp)$/i, '')}_annotated_${dateStr}.png`;

        // 建立臨時 canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.app.canvas.width;
        tempCanvas.height = this.app.canvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        // 繪製圖片
        tempCtx.drawImage(page.imageObj, 0, 0);

        // 繪製遮罩
        page.masks.forEach(mask => {
            if (!mask.visible) return;

            tempCtx.fillStyle = mask.color;
            tempCtx.globalAlpha = 1.0;

            if (mask.type === 'rect') {
                tempCtx.fillRect(mask.x, mask.y, mask.w, mask.h);
            } else if (mask.type === 'brush' && mask.path && mask.path.length > 0) {
                tempCtx.beginPath();
                tempCtx.moveTo(mask.path[0].x, mask.path[0].y);
                for (let i = 1; i < mask.path.length; i++) {
                    tempCtx.lineTo(mask.path[i].x, mask.path[i].y);
                }
                tempCtx.lineWidth = this.app.brushSize;
                tempCtx.lineCap = 'round';
                tempCtx.lineJoin = 'round';
                tempCtx.stroke();
            }
        });

        tempCtx.globalAlpha = 1.0;

        // 下載圖片
        ImageUtils.downloadCanvasAsImage(tempCanvas, filename);
        this.app.uiManager.showToast('✅ 圖片已匯出');
    }

    renderPageList() {
        const pageListEl = document.getElementById('page-list');
        pageListEl.innerHTML = '';

        if (this.app.pages.length === 0) return;

        document.getElementById('page-nav').style.opacity = '1';

        this.app.pages.forEach((page, index) => {
            const div = document.createElement('div');
            div.className = `page-item ${index === this.app.currentPageIndex ? 'active' : ''}`;

            div.innerHTML = `
                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${index + 1}. ${page.name}
                </span>
                <div class="page-actions">
                    ${index > 0 ? '<button class="icon-btn move-up" data-index="' + index + '">▲</button>' : ''}
                    ${index < this.app.pages.length - 1 ? '<button class="icon-btn move-down" data-index="' + index + '">▼</button>' : ''}
                    <button class="icon-btn delete" data-index="' + index + '">✖</button>
                </div>
            `;

            div.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    this.switchPage(index);
                }
            });

            div.querySelectorAll('.move-up').forEach(btn => {
                btn.addEventListener('click', () => this.movePage(index, -1));
            });
            div.querySelectorAll('.move-down').forEach(btn => {
                btn.addEventListener('click', () => this.movePage(index, 1));
            });
            div.querySelectorAll('.delete').forEach(btn => {
                btn.addEventListener('click', () => this.deletePage(index));
            });

            pageListEl.appendChild(div);
        });

        document.getElementById('page-indicator').textContent =
            `${this.app.currentPageIndex + 1} / ${this.app.pages.length}`;
    }

    switchPage(index) {
        if (index < 0 || index >= this.app.pages.length) return;
        this.app.currentPageIndex = index;
        this.app.commandManager.clear();  // 切換頁面時清空歷史
        this.renderPageList();
        this.loadCurrentPage();
        this.app.updateUndoRedoButtons();
    }

    changePage(offset) {
        if (this.app.pages.length === 0) return;

        const newIndex = this.app.currentPageIndex + offset;
        if (newIndex >= 0 && newIndex < this.app.pages.length) {
            this.switchPage(newIndex);
        } else {
            if (newIndex < 0) {
                this.app.uiManager.showToast('已經是第一頁');
            } else {
                this.app.uiManager.showToast('已經是最後一頁');
            }
        }
    }

    movePage(index, direction) {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= this.app.pages.length) return;

        [this.app.pages[index], this.app.pages[newIndex]] =
            [this.app.pages[newIndex], this.app.pages[index]];

        if (this.app.currentPageIndex === index) {
            this.app.currentPageIndex = newIndex;
        } else if (this.app.currentPageIndex === newIndex) {
            this.app.currentPageIndex = index;
        }

        this.renderPageList();
        this.loadCurrentPage();
    }

    deletePage(index) {
        if (!confirm('確定要刪除此頁？')) return;

        this.app.pages.splice(index, 1);

        if (this.app.pages.length === 0) {
            this.app.currentPageIndex = -1;
            this.app.commandManager.clear();
            document.getElementById('welcome-msg').style.display = 'block';
            document.getElementById('page-nav').style.opacity = '0';
            this.app.ctx.clearRect(0, 0, this.app.canvas.width, this.app.canvas.height);
        } else if (this.app.currentPageIndex >= this.app.pages.length) {
            this.app.currentPageIndex = this.app.pages.length - 1;
        }

        this.renderPageList();
        this.loadCurrentPage();
        this.app.updateUndoRedoButtons();
    }

    loadCurrentPage() {
        if (this.app.currentPageIndex === -1) return;

        const page = this.app.pages[this.app.currentPageIndex];

        this.app.canvas.width = page.imageObj.width;
        this.app.canvas.height = page.imageObj.height;

        this.app.drawingManager.draw();

        // 修正：確保圖片完整顯示（使用 setTimeout 確保渲染完成）
        setTimeout(() => {
            this.app.uiManager.fitToScreen();
        }, 100);
    }
}

// ========== 繪圖管理模組 ==========
class DrawingManager {
    constructor(app) {
        this.app = app;
    }

    setMode(mode) {
        this.app.mode = mode;

        document.querySelectorAll('.tool-btn[data-mode]').forEach(btn => {
            btn.classList.remove('active');
        });

        const activeBtn = document.querySelector(`[data-mode="${mode}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        if (mode === TOOL_MODES.VIEW) {
            this.app.canvas.style.cursor = 'default';
        } else {
            this.app.canvas.style.cursor = 'crosshair';
        }
    }

    selectColor(swatch) {
        this.app.brushColor = swatch.dataset.color;

        document.querySelectorAll('.color-swatch').forEach(s => {
            s.classList.remove('active');
        });
        swatch.classList.add('active');

        const preview = document.getElementById('brush-preview-circle');
        if (preview) {
            preview.style.backgroundColor = this.app.brushColor;
        }
    }

    /**
     * 處理點擊遮罩切換顯示（教學模式）
     */
    handleMaskClick(e) {
        if (this.app.currentPageIndex === -1) return;

        const rect = this.app.canvas.getBoundingClientRect();
        const scaleX = this.app.canvas.width / rect.width;
        const scaleY = this.app.canvas.height / rect.height;

        const clickX = (e.clientX - rect.left) * scaleX;
        const clickY = (e.clientY - rect.top) * scaleY;

        const page = this.app.pages[this.app.currentPageIndex];
        let clicked = false;

        // 從後往前檢查（最上層的遮罩優先）
        for (let i = page.masks.length - 1; i >= 0; i--) {
            const mask = page.masks[i];

            if (mask.type === 'rect') {
                const insideRect = (
                    clickX >= mask.x && clickX <= mask.x + mask.w &&
                    clickY >= mask.y && clickY <= mask.y + mask.h
                );

                if (insideRect) {
                    // 切換遮罩的顯示狀態
                    mask.visible = !mask.visible;
                    clicked = true;
                    break;  // 只處理最上層的遮罩
                }
            } else if (mask.type === 'brush' && mask.path && mask.path.length > 0) {
                // 檢查點擊是否在筆刷路徑附近
                const nearPath = mask.path.some(point => {
                    const dist = Math.hypot(clickX - point.x, clickY - point.y);
                    return dist < this.app.brushSize;
                });

                if (nearPath) {
                    mask.visible = !mask.visible;
                    clicked = true;
                    break;
                }
            }
        }

        if (clicked) {
            this.draw();
            // 可選：顯示提示
            // this.app.uiManager.showToast('遮罩已' + (mask.visible ? '顯示' : '隱藏'));
        }
    }

    draw() {
        if (this.app.currentPageIndex === -1) return;

        const page = this.app.pages[this.app.currentPageIndex];
        const ctx = this.app.ctx;

        ctx.clearRect(0, 0, this.app.canvas.width, this.app.canvas.height);

        ctx.drawImage(page.imageObj, 0, 0);

        page.masks.forEach(mask => {
            if (!mask.visible) return;

            ctx.fillStyle = mask.color;
            ctx.globalAlpha = 1.0;

            if (mask.type === 'rect') {
                ctx.fillRect(mask.x, mask.y, mask.w, mask.h);
            } else if (mask.type === 'brush' && mask.path && mask.path.length > 0) {
                ctx.beginPath();
                ctx.strokeStyle = mask.color;
                ctx.lineWidth = this.app.brushSize;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.moveTo(mask.path[0].x, mask.path[0].y);

                for (let i = 1; i < mask.path.length; i++) {
                    ctx.lineTo(mask.path[i].x, mask.path[i].y);
                }

                ctx.stroke();
            }
        });

        ctx.globalAlpha = 1.0;
    }

    handleMouseDown(e) {
        // 在 VIEW 模式下，允許點擊遮罩切換顯示
        if (this.app.mode === TOOL_MODES.VIEW) {
            this.handleMaskClick(e);
            return;
        }
        if (this.app.currentPageIndex === -1) return;

        this.app.isDrawing = true;
        const rect = this.app.canvas.getBoundingClientRect();
        const scaleX = this.app.canvas.width / rect.width;
        const scaleY = this.app.canvas.height / rect.height;

        this.app.startX = (e.clientX - rect.left) * scaleX;
        this.app.startY = (e.clientY - rect.top) * scaleY;

        if (this.app.mode === TOOL_MODES.BRUSH) {
            this.app.currentPath = [{ x: this.app.startX, y: this.app.startY }];
        } else if (this.app.mode === TOOL_MODES.ERASER) {
            this.eraseMaskAt(this.app.startX, this.app.startY);
        }
    }

    handleMouseMove(e) {
        if (!this.app.isDrawing) return;
        if (this.app.mode === TOOL_MODES.VIEW) return;

        const rect = this.app.canvas.getBoundingClientRect();
        const scaleX = this.app.canvas.width / rect.width;
        const scaleY = this.app.canvas.height / rect.height;

        const currentX = (e.clientX - rect.left) * scaleX;
        const currentY = (e.clientY - rect.top) * scaleY;

        if (this.app.mode === TOOL_MODES.BRUSH) {
            this.app.currentPath.push({ x: currentX, y: currentY });
            this.drawTempPath();
        } else if (this.app.mode === TOOL_MODES.RECT) {
            this.drawTempRect(currentX, currentY);
        } else if (this.app.mode === TOOL_MODES.ERASER) {
            this.eraseMaskAt(currentX, currentY);
        }
    }

    handleMouseUp(e) {
        if (!this.app.isDrawing) return;
        this.app.isDrawing = false;

        if (this.app.mode === TOOL_MODES.RECT) {
            const rect = this.app.canvas.getBoundingClientRect();
            const scaleX = this.app.canvas.width / rect.width;
            const scaleY = this.app.canvas.height / rect.height;

            const endX = (e.clientX - rect.left) * scaleX;
            const endY = (e.clientY - rect.top) * scaleY;

            const x = Math.min(this.app.startX, endX);
            const y = Math.min(this.app.startY, endY);
            const w = Math.abs(endX - this.app.startX);
            const h = Math.abs(endY - this.app.startY);

            if (w > 5 && h > 5) {
                const page = this.app.pages[this.app.currentPageIndex];
                const newMask = {
                    id: Date.now() + Math.random(),
                    type: 'rect',
                    x, y, w, h,
                    visible: true,
                    color: this.app.brushColor
                };

                // 使用 Command Pattern
                const command = new AddMaskCommand(page, newMask);
                this.app.commandManager.execute(command);
                this.app.updateUndoRedoButtons();
            }
        } else if (this.app.mode === TOOL_MODES.BRUSH && this.app.currentPath.length > 1) {
            const page = this.app.pages[this.app.currentPageIndex];
            const newMask = {
                id: Date.now() + Math.random(),
                type: 'brush',
                path: [...this.app.currentPath],
                visible: true,
                color: this.app.brushColor
            };

            // 使用 Command Pattern
            const command = new AddMaskCommand(page, newMask);
            this.app.commandManager.execute(command);
            this.app.updateUndoRedoButtons();
            this.app.currentPath = [];
        }

        this.draw();
    }

    handleTouchStart(e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            this.app.initialPinchDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
            this.app.initialScale = this.app.currentZoom;
            return;
        }

        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.handleMouseDown(mouseEvent);
        }
    }

    handleTouchMove(e) {
        e.preventDefault();

        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.handleMouseMove(mouseEvent);
        } else if (e.touches.length === 2 && this.app.initialPinchDistance) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const currentDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );

            const scale = (currentDistance / this.app.initialPinchDistance) * this.app.initialScale;
            this.app.uiManager.setZoom(Math.max(CONFIG.ZOOM_MIN, Math.min(CONFIG.ZOOM_MAX, scale)));
        }
    }

    handleTouchEnd(e) {
        if (e.changedTouches.length === 1) {
            const touch = e.changedTouches[0];
            const mouseEvent = new MouseEvent('mouseup', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.handleMouseUp(mouseEvent);
        }

        this.app.initialPinchDistance = null;
    }

    eraseMaskAt(x, y) {
        if (this.app.currentPageIndex === -1) return;

        const page = this.app.pages[this.app.currentPageIndex];
        const eraseRadius = this.app.brushSize;

        page.masks = page.masks.filter(mask => {
            if (mask.type === 'rect') {
                const insideRect = (
                    x >= mask.x && x <= mask.x + mask.w &&
                    y >= mask.y && y <= mask.y + mask.h
                );
                return !insideRect;
            } else if (mask.type === 'brush' && mask.path) {
                const nearPath = mask.path.some(point => {
                    const dist = Math.hypot(x - point.x, y - point.y);
                    return dist < eraseRadius;
                });
                return !nearPath;
            }
            return true;
        });

        this.draw();
    }

    drawTempPath() {
        this.draw();
        const ctx = this.app.ctx;

        if (this.app.currentPath.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = this.app.brushColor;
            ctx.lineWidth = this.app.brushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.moveTo(this.app.currentPath[0].x, this.app.currentPath[0].y);

            for (let i = 1; i < this.app.currentPath.length; i++) {
                ctx.lineTo(this.app.currentPath[i].x, this.app.currentPath[i].y);
            }

            ctx.stroke();
        }
    }

    drawTempRect(currentX, currentY) {
        this.draw();
        const ctx = this.app.ctx;

        const x = Math.min(this.app.startX, currentX);
        const y = Math.min(this.app.startY, currentY);
        const w = Math.abs(currentX - this.app.startX);
        const h = Math.abs(currentY - this.app.startY);

        ctx.fillStyle = this.app.brushColor;
        ctx.globalAlpha = 0.7;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1.0;
    }

    toggleQuizMode(enabled) {
        this.app.isQuizMode = enabled;

        if (this.app.currentPageIndex === -1) return;

        const page = this.app.pages[this.app.currentPageIndex];
        page.masks.forEach(mask => {
            mask.visible = !enabled;
        });

        this.draw();
    }

    toggleAllMasks() {
        if (this.app.currentPageIndex === -1) return;

        const page = this.app.pages[this.app.currentPageIndex];
        const allHidden = page.masks.every(m => !m.visible);

        page.masks.forEach(m => {
            m.visible = !allHidden;
        });

        this.draw();

        document.getElementById('toggle-text').textContent =
            allHidden ? '隱藏 | Hide' : '顯示 | Show';
    }

    clearCurrentPageMasks() {
        if (this.app.currentPageIndex === -1) return;

        if (!confirm('確定要清除此頁所有遮罩？')) return;

        const page = this.app.pages[this.app.currentPageIndex];

        // 使用 Command Pattern
        const command = new ClearMasksCommand(page);
        this.app.commandManager.execute(command);
        this.app.updateUndoRedoButtons();

        this.draw();
        this.app.uiManager.showToast('✅ 已清除遮罩');
    }
}

// ========== UI 管理模組 ==========
class UIManager {
    constructor(app) {
        this.app = app;
    }

    showToast(message, duration = 2000) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.style.transform = 'translateX(0)';

        setTimeout(() => {
            toast.style.transform = 'translateX(150%)';
        }, duration);
    }

    showLoading(show, text = 'Loading...') {
        const overlay = document.getElementById('loading-overlay');
        const loadingText = document.getElementById('loading-text');

        if (show) {
            overlay.style.display = 'flex';
            loadingText.textContent = text;
        } else {
            overlay.style.display = 'none';
        }
    }

    toggleSidebar() {
        document.getElementById('sidebar-panel').classList.toggle('open');
    }

    toggleFullScreen() {
        document.body.classList.toggle('presentation-mode');
        const exitBtn = document.getElementById('exit-fullscreen-btn');

        if (document.body.classList.contains('presentation-mode')) {
            exitBtn.style.display = 'block';
            this.showToast('已進入全螢幕（長按退出）');

            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(e => {
                    console.log('Fullscreen not available:', e);
                });
            }
        } else {
            exitBtn.style.display = 'none';

            if (document.exitFullscreen && document.fullscreenElement) {
                document.exitFullscreen();
            }

            this.showToast('已退出全螢幕');
        }
    }

    adjustZoom(delta) {
        let newZoom = this.app.currentZoom + delta;
        newZoom = Math.max(CONFIG.ZOOM_MIN, Math.min(CONFIG.ZOOM_MAX, newZoom));
        this.setZoom(newZoom);
    }

    setZoom(scale) {
        this.app.currentZoom = scale;

        const canvas = this.app.canvas;
        canvas.style.width = (canvas.width * scale) + 'px';
        canvas.style.height = (canvas.height * scale) + 'px';

        document.getElementById('zoom-level-text').textContent =
            Math.round(scale * 100) + '%';
    }

    fitToScreen() {
        if (this.app.currentPageIndex === -1) return;

        const page = this.app.pages[this.app.currentPageIndex];
        const wrapper = this.app.canvasWrapper.getBoundingClientRect();

        const scaleX = (wrapper.width - 40) / page.imageObj.width;
        const scaleY = (wrapper.height - 40) / page.imageObj.height;
        const fitScale = Math.min(scaleX, scaleY);

        this.setZoom(fitScale < 1 ? fitScale : 1);
    }
}

// ========== 初始化應用程式 ==========
const app = new SmartMaskApp();

console.log("✅ Smart Mask Tool v4.1 Enhanced 完整載入");

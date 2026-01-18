// ===== 設定常數 =====
export const CONFIG = {
    MAX_IMAGE_SIZE: 1024,
    IMAGE_QUALITY: 0.8,
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

export const TOOL_MODES = {
    VIEW: 'view',
    RECT: 'rect',
    BRUSH: 'brush',
    ERASER: 'eraser'
};

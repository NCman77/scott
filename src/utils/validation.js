// ===== 驗證工具 =====
export class ValidationUtils {
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

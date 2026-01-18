// ===== IndexedDB 儲存管理 =====

export class IndexedDBManager {
    constructor() {
        this.dbName = 'SmartMaskDB';
        this.version = 1;
        this.db = null;
    }

    /**
     * 初始化資料庫
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.error('IndexedDB 開啟失敗:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ IndexedDB 初始化成功');
                resolve(this.db);
            };

            request.onupgradeneeded = (e) => {
                const db = e.target.result;

                // 建立專案儲存空間
                if (!db.objectStoreNames.contains('projects')) {
                    const projectStore = db.createObjectStore('projects', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    projectStore.createIndex('timestamp', 'timestamp', { unique: false });
                    projectStore.createIndex('name', 'name', { unique: false });
                }

                // 建立設定儲存空間
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }

                console.log('✅ IndexedDB 結構建立完成');
            };
        });
    }

    /**
     * 儲存設定
     */
    async saveSetting(key, value) {
        const transaction = this.db.transaction(['settings'], 'readwrite');
        const store = transaction.objectStore('settings');

        return new Promise((resolve, reject) => {
            const request = store.put({ key, value });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 讀取設定
     */
    async getSetting(key) {
        const transaction = this.db.transaction(['settings'], 'readonly');
        const store = transaction.objectStore('settings');

        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result?.value);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 儲存專案
     */
    async saveProject(project) {
        const transaction = this.db.transaction(['projects'], 'readwrite');
        const store = transaction.objectStore('projects');

        const data = {
            ...project,
            timestamp: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 讀取專案
     */
    async getProject(id) {
        const transaction = this.db.transaction(['projects'], 'readonly');
        const store = transaction.objectStore('projects');

        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 列出所有專案
     */
    async listProjects() {
        const transaction = this.db.transaction(['projects'], 'readonly');
        const store = transaction.objectStore('projects');

        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 刪除專案
     */
    async deleteProject(id) {
        const transaction = this.db.transaction(['projects'], 'readwrite');
        const store = transaction.objectStore('projects');

        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 從 localStorage 自動遷移 API Key
     */
    async migrateFromLocalStorage() {
        const oldKey = 'smart_mask_api_key';
        const encryptedKey = localStorage.getItem(oldKey);

        if (encryptedKey) {
            try {
                await this.saveSetting('api_key', encryptedKey);
                console.log('✅ API Key 已從 localStorage 遷移到 IndexedDB');
                // 不刪除舊的，以防萬一需要回退
                // localStorage.removeItem(oldKey);
            } catch (error) {
                console.error('遷移 API Key 失敗:', error);
            }
        }
    }
}

/**
 * 全域 IndexedDB 實例（單例模式）
 */
let dbInstance = null;

export async function getDB() {
    if (!dbInstance) {
        dbInstance = new IndexedDBManager();
        await dbInstance.init();
        await dbInstance.migrateFromLocalStorage();
    }
    return dbInstance;
}

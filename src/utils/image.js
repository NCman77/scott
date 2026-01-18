// ===== 圖片處理工具 =====
import { CONFIG } from './config.js';

export class ImageUtils {
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
     * 將 Canvas 內容匯出為 Blob
     */
    static canvasToBlob(canvas, mimeType = 'image/png', quality = 1.0) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(
                blob => {
                    if (blob) resolve(blob);
                    else reject(new Error('無法生成 Blob'));
                },
                mimeType,
                quality
            );
        });
    }

    /**
     * 下載Blob為檔案
     */
    static downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// ===== 加密工具 =====
import { CONFIG } from './config.js';

export class CryptoUtils {
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

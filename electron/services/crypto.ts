/**
 * 凭据加解密：优先使用 Electron safeStorage（Windows 下走 DPAPI）。
 * 若当前环境不支持系统密钥环（如无桌面密钥环的 Linux），退化为本地编码存储并在界面提示。
 */

import { safeStorage } from 'electron';

export function isStrongEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export function encryptSecret(plain: string): string {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return `enc:${safeStorage.encryptString(plain).toString('base64')}`;
    }
  } catch {
    /* 退化处理 */
  }
  return `plain:${Buffer.from(plain, 'utf8').toString('base64')}`;
}

export function decryptSecret(stored?: string): string | undefined {
  if (!stored) return undefined;
  if (stored.startsWith('enc:')) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
    } catch {
      return undefined;
    }
  }
  if (stored.startsWith('plain:')) {
    return Buffer.from(stored.slice(6), 'base64').toString('utf8');
  }
  return stored;
}

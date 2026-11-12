/** 账户管理：增删改查、凭据加密、连接测试、默认文件夹初始化 */

import crypto from 'node:crypto';
import { encryptSecret } from './crypto';
import { imapService } from './imap';
import { smtpService } from './smtp';
import { store } from './store';
import type { Account, AccountInput, Folder } from './types';

export interface AccountView extends Account {
  hasImapPassword: boolean;
  hasSmtpPassword: boolean;
}

const DEFAULT_FOLDER_DEFS: { suffix: string; name: string; kind: Folder['kind']; order: number }[] = [
  { suffix: 'inbox', name: '收件箱', kind: 'inbox', order: 0 },
  { suffix: 'draft', name: '草稿箱', kind: 'draft', order: 1 },
  { suffix: 'sent', name: '已发送', kind: 'sent', order: 2 },
  { suffix: 'archive', name: '存档', kind: 'archive', order: 3 },
  { suffix: 'junk', name: '垃圾邮件', kind: 'junk', order: 4 },
  { suffix: 'trash', name: '已删除', kind: 'trash', order: 5 },
];

export function folderIdFor(accountId: string, suffix: string): string {
  return `${accountId}:${suffix}`;
}

export function ensureDefaultFolders(accountId: string): Folder[] {
  const created: Folder[] = [];
  for (const def of DEFAULT_FOLDER_DEFS) {
    const id = folderIdFor(accountId, def.suffix);
    if (store.getFolder(id)) continue;
    const folder: Folder = {
      id,
      accountId,
      name: def.name,
      kind: def.kind,
      remotePath: undefined,
      deletable: false,
      order: def.order,
      local: true,
    };
    store.upsertFolder(folder);
    created.push(folder);
  }
  return created;
}

export function toView(account: Account): AccountView {
  const secret = store.getAccountSecret(account.id);
  return {
    ...account,
    hasImapPassword: Boolean(secret.imapPassword),
    hasSmtpPassword: Boolean(secret.smtpPassword),
  };
}

export function listAccounts(): AccountView[] {
  return store.listAccounts().map(toView);
}

export function saveAccount(input: AccountInput): AccountView {
  const id = input.id || `acc-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const existing = store.getAccount(id);
  const account: Account = {
    id,
    name: input.name || input.email,
    email: input.email,
    displayName: input.displayName || input.name || input.email.split('@')[0],
    imap: input.imap,
    smtp: input.smtp,
    syncDays: input.syncDays ?? store.getSettings().sync.days,
    demo: input.demo ?? existing?.demo ?? false,
    color: input.color ?? existing?.color ?? '#1F6FD0',
    createdAt: existing?.createdAt ?? Date.now(),
    lastSyncAt: existing?.lastSyncAt,
  };
  store.upsertAccount(account);

  const secret: { imapPassword?: string; smtpPassword?: string } = {};
  if (input.imapPassword) secret.imapPassword = encryptSecret(input.imapPassword);
  if (input.smtpPassword) secret.smtpPassword = encryptSecret(input.smtpPassword);
  if (!input.smtpPassword && input.imapPassword && !store.getAccountSecret(id).smtpPassword) {
    // 多数邮箱 IMAP/SMTP 共用同一授权码
    secret.smtpPassword = encryptSecret(input.imapPassword);
  }
  if (Object.keys(secret).length) store.setAccountSecret(id, secret);

  if (!store.listFolders(id).length) ensureDefaultFolders(id);
  return toView(account);
}

export function removeAccount(id: string): AccountView[] {
  void imapService.stopIdle(id);
  store.removeAccount(id);
  return listAccounts();
}

export async function testAccount(input: AccountInput): Promise<{
  imap: { ok: boolean; message: string };
  smtp: { ok: boolean; message: string };
}> {
  const existing = input.id ? store.getAccount(input.id) : undefined;
  const secret = existing ? store.getAccountSecret(existing.id) : {};
  const probe: Account = {
    id: input.id ?? 'probe',
    name: input.name || input.email,
    email: input.email,
    displayName: input.displayName || input.email,
    imap: input.imap,
    smtp: input.smtp,
    syncDays: input.syncDays ?? 30,
    createdAt: Date.now(),
  };

  // 测试时使用输入中的临时授权码，不写入存储
  if (input.imapPassword) {
    store.setAccountSecret(probe.id, { imapPassword: encryptSecret(input.imapPassword) });
  }
  if (input.smtpPassword) {
    store.setAccountSecret(probe.id, { smtpPassword: encryptSecret(input.smtpPassword) });
  }
  if (!input.imapPassword && secret.imapPassword) {
    store.setAccountSecret(probe.id, { imapPassword: secret.imapPassword });
  }
  if (!input.smtpPassword && secret.smtpPassword) {
    store.setAccountSecret(probe.id, { smtpPassword: secret.smtpPassword });
  }

  const [imap, smtp] = await Promise.all([
    imapService.testConnection(probe),
    smtpService.testConnection(probe),
  ]);

  if (probe.id === 'probe') {
    store.setAccountSecret('probe', {});
  }
  return { imap, smtp };
}

export function accountFolderTree(accountId: string): Folder[] {
  return store.listFolders(accountId);
}

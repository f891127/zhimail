/**
 * IMAP 收信服务：连接、文件夹枚举、增量同步、IDLE 新邮件、标记/移动/删除。
 * 使用 imapflow 官方 API，所有网络操作均有超时与错误归类。
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { AddressObject } from 'mailparser';
import { decryptSecret } from './crypto';
import { assignThreadIds } from './thread';
import { store } from './store';
import type {
  Account,
  AttachmentMeta,
  Folder,
  FolderKind,
  MailAddress,
  MessageMeta,
  SyncProgress,
} from './types';

const CONNECTION_TIMEOUT = 20000;
const GREETING_TIMEOUT = 15000;

function toAddresses(input: unknown): MailAddress[] {
  if (!input) return [];
  const list = Array.isArray(input) ? input : [input];
  const result: MailAddress[] = [];
  for (const item of list) {
    if (!item) continue;
    const entry = item as { name?: string; address?: string; value?: { name?: string; address?: string }[] };
    // imapflow 的 envelope 直接给 { name, address }；mailparser 给 { value: [{ name, address }] }
    if (Array.isArray(entry.value)) {
      for (const one of entry.value) {
        if (one?.address) result.push({ name: one.name || undefined, address: one.address });
      }
      continue;
    }
    if (entry.address) result.push({ name: entry.name || undefined, address: entry.address });
  }
  return result;
}

function makeSnippet(text: string | undefined, html: string | undefined): string {
  const source = (text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  if (source) return source;
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function detectFolderKind(path: string, specialUse: string | undefined): FolderKind {
  const use = (specialUse ?? '').toLowerCase();
  if (use.includes('\\inbox')) return 'inbox';
  if (use.includes('\\sent')) return 'sent';
  if (use.includes('\\draft')) return 'draft';
  if (use.includes('\\trash')) return 'trash';
  if (use.includes('\\junk') || use.includes('\\spam')) return 'junk';
  if (use.includes('\\archive')) return 'archive';

  const lower = path.toLowerCase();
  if (lower === 'inbox' || lower.endsWith('/inbox')) return 'inbox';
  if (/sent|已发送|送信/.test(lower)) return 'sent';
  if (/draft|草稿/.test(lower)) return 'draft';
  if (/trash|deleted|已删除|废纸篓/.test(lower)) return 'trash';
  if (/junk|spam|垃圾/.test(lower)) return 'junk';
  if (/archive|存档|归档/.test(lower)) return 'archive';
  return 'custom';
}

const KIND_ORDER: Record<FolderKind, number> = {
  virtual: -1,
  inbox: 0,
  draft: 1,
  sent: 2,
  archive: 3,
  junk: 4,
  trash: 5,
  custom: 10,
  brief: 99,
};

export class ImapService {
  private clients = new Map<string, ImapFlow>();
  private cancels = new Set<string>();
  private idleListeners = new Map<string, (accountId: string) => void>();

  private createClient(account: Account): ImapFlow {
    const secret = store.getAccountSecret(account.id);
    const password = decryptSecret(secret.imapPassword);
    if (!password) throw new Error('未找到该账户的 IMAP 授权码，请在账户设置中重新填写');

    return new ImapFlow({
      host: account.imap.host,
      port: account.imap.port,
      secure: account.imap.secure,
      auth: { user: account.imap.user || account.email, pass: password },
      logger: false,
      connectionTimeout: CONNECTION_TIMEOUT,
      greetingTimeout: GREETING_TIMEOUT,
      socketTimeout: 120000,
      emitLogs: false,
    });
  }

  async testConnection(account: Account): Promise<{ ok: boolean; message: string }> {
    let client: ImapFlow | undefined;
    try {
      client = this.createClient(account);
      await client.connect();
      const list = await client.list();
      const folders = list.filter((item) => !item.flags.has('\\Noselect')).length;
      return { ok: true, message: `IMAP 连接成功，发现 ${folders} 个可用文件夹` };
    } catch (error) {
      return { ok: false, message: describeImapError(error) };
    } finally {
      if (client) {
        try {
          await client.logout();
        } catch {
          /* 忽略退出异常 */
        }
      }
    }
  }

  /** 枚举服务器文件夹并写入本地索引 */
  async syncFolders(account: Account): Promise<Folder[]> {
    const client = this.createClient(account);
    await client.connect();
    try {
      const list = await client.list();
      const existing = store.listFolders(account.id);
      // 服务器上的收件箱/已发送/草稿等特殊文件夹要与内置文件夹合并，
      // 否则会出现「收件箱」和「INBOX」两个入口、邮件全堆在 INBOX 的情况
      const builtinByKind = new Map<string, Folder>();
      for (const folder of existing) {
        if (folder.remotePath) continue;
        if (folder.kind === 'custom' || folder.kind === 'brief' || folder.kind === 'virtual') continue;
        if (!builtinByKind.has(folder.kind)) builtinByKind.set(folder.kind, folder);
      }
      const folders: Folder[] = [];
      const usedBuiltin = new Set<string>();
      for (const item of list) {
        if (item.flags?.has('\\Noselect')) continue;
        const kind = detectFolderKind(item.path, item.specialUse);
        const builtin = kind === 'custom' ? undefined : builtinByKind.get(kind);
        if (builtin && !usedBuiltin.has(builtin.id)) {
          usedBuiltin.add(builtin.id);
          folders.push({
            ...builtin,
            remotePath: item.path,
            specialUse: item.specialUse,
            deletable: false,
            order: KIND_ORDER[kind],
          });
          continue;
        }
        folders.push({
          id: `${account.id}:${item.path}`,
          accountId: account.id,
          name: item.name || item.path,
          kind,
          remotePath: item.path,
          specialUse: item.specialUse,
          deletable: !['inbox', 'sent', 'draft', 'trash'].includes(kind),
          order: KIND_ORDER[kind],
          local: false,
        });
      }
      // 清理历史遗留的重复文件夹（例如上一版本同步出来的 acc:INBOX），其邮件会在本次同步中重新拉取
      const keep = new Set(folders.map((folder) => folder.id));
      for (const folder of existing) {
        if (keep.has(folder.id)) continue;
        if (folder.kind === 'brief' || folder.kind === 'virtual') continue;
        if (!folder.remotePath) continue; // 本地自建目录保留
        store.removeFolderData(folder.id);
      }
      folders.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh'));
      return folders;
    } finally {
      try {
        await client.logout();
      } catch {
        /* 忽略 */
      }
    }
  }

  cancel(accountId: string): void {
    this.cancels.add(accountId);
  }

  private isCancelled(accountId: string): boolean {
    return this.cancels.has(accountId);
  }

  /**
   * 同步单个账户：枚举文件夹 → 逐文件夹拉取邮件。
   * 最新 fullCount 封拉取完整正文，其余仅拉取邮件头，打开时按需下载。
   */
  async syncAccount(
    account: Account,
    options: { days: number; limit: number; fullCount?: number },
    onProgress: (progress: SyncProgress) => void,
  ): Promise<{ fetched: number; folders: number; errors: string[] }> {
    this.cancels.delete(account.id);
    const errors: string[] = [];
    let fetched = 0;

    onProgress({
      accountId: account.id,
      phase: 'connecting',
      current: 0,
      total: 0,
      message: '正在连接邮件服务器…',
    });

    const client = this.createClient(account);
    await client.connect();

    try {
      const remoteFolders = await this.syncFolders(account);
      for (const folder of remoteFolders) {
        store.upsertFolder(folder);
      }

      const targets = remoteFolders.filter((f) =>
        ['inbox', 'sent', 'draft', 'custom', 'archive'].includes(f.kind),
      );

      for (const [index, folder] of targets.entries()) {
        if (this.isCancelled(account.id)) {
          onProgress({
            accountId: account.id,
            phase: 'cancelled',
            current: fetched,
            total: 0,
            message: '同步已取消',
          });
          break;
        }
        onProgress({
          accountId: account.id,
          folderId: folder.id,
          folderName: folder.name,
          phase: 'listing',
          current: index,
          total: targets.length,
          message: `正在同步「${folder.name}」…`,
        });
        try {
          const count = await this.syncFolder(client, account, folder, options, onProgress);
          fetched += count;
        } catch (error) {
          errors.push(`${folder.name}: ${describeImapError(error)}`);
        }
      }

      account.lastSyncAt = Date.now();
      store.upsertAccount(account);
      onProgress({
        accountId: account.id,
        phase: 'done',
        current: fetched,
        total: fetched,
        message: `同步完成，共更新 ${fetched} 封邮件`,
      });
    } finally {
      try {
        await client.logout();
      } catch {
        /* 忽略 */
      }
    }

    return { fetched, folders: store.listFolders(account.id).length, errors };
  }

  private async syncFolder(
    client: ImapFlow,
    account: Account,
    folder: Folder,
    options: { days: number; limit: number; fullCount?: number },
    onProgress: (progress: SyncProgress) => void,
  ): Promise<number> {
    const lock = await client.getMailboxLock(folder.remotePath ?? folder.name);
    try {
      const since = new Date(Date.now() - options.days * 24 * 3600 * 1000);
      const uids = (await client.search({ since }, { uid: true })) as number[];
      if (!uids.length) return 0;
      uids.sort((a, b) => a - b);
      const limited = uids.slice(-options.limit);
      const fullCount = options.fullCount ?? 60;
      const fullUids = new Set(limited.slice(-fullCount));
      const envelopeOnly = limited.filter((uid) => !fullUids.has(uid));

      const existing = new Set(
        store
          .allMessages()
          .filter((m) => m.folderId === folder.id)
          .map((m) => m.uid),
      );
      const newUids = limited.filter((uid) => !existing.has(uid));
      const pendingFull = [...newUids.filter((uid) => fullUids.has(uid))];
      const pendingHead = [...newUids.filter((uid) => !fullUids.has(uid))];
      void envelopeOnly;

      const collected: MessageMeta[] = [];
      let processed = 0;
      const total = pendingFull.length + pendingHead.length;

      // 第一轮：完整拉取（含正文）
      if (pendingFull.length) {
        const range = pendingFull.join(',');
        for await (const message of client.fetch(
          range,
          { envelope: true, flags: true, size: true, source: true, internalDate: true },
          { uid: true },
        )) {
          if (this.isCancelled(account.id)) break;
          const meta = await this.persistFullMessage(account, folder, message);
          if (meta) collected.push(meta);
          processed += 1;
          onProgress({
            accountId: account.id,
            folderId: folder.id,
            folderName: folder.name,
            phase: 'fetching',
            current: processed,
            total,
            message: `「${folder.name}」已下载 ${processed}/${total} 封`,
          });
        }
      }

      // 第二轮：仅拉取邮件头
      if (pendingHead.length) {
        const range = pendingHead.join(',');
        for await (const message of client.fetch(
          range,
          { envelope: true, flags: true, size: true, internalDate: true, bodyStructure: true },
          { uid: true },
        )) {
          if (this.isCancelled(account.id)) break;
          const meta = this.persistHeadOnly(account, folder, message);
          if (meta) collected.push(meta);
          processed += 1;
          if (processed % 10 === 0) {
            onProgress({
              accountId: account.id,
              folderId: folder.id,
              folderName: folder.name,
              phase: 'fetching',
              current: processed,
              total,
              message: `「${folder.name}」已处理 ${processed}/${total} 封`,
            });
          }
        }
      }

      if (collected.length) {
        assignThreadIds(collected, store.allMessages());
        store.upsertMessageMetas(collected);
      }
      return collected.length;
    } finally {
      lock.release();
    }
  }

  private buildMeta(
    account: Account,
    folder: Folder,
    message: any,
    snippet: string,
    hasAttachments: boolean,
  ): MessageMeta {
    const envelope = message.envelope ?? {};
    const flags: string[] = [];
    if (message.flags) {
      for (const flag of message.flags) flags.push(flag);
    }
    const date = envelope.date
      ? new Date(envelope.date).getTime()
      : message.internalDate
        ? new Date(message.internalDate).getTime()
        : Date.now();

    return {
      id: `${account.id}/${folder.id}/${message.uid}`,
      accountId: account.id,
      folderId: folder.id,
      uid: message.uid,
      messageId: envelope.messageId ?? undefined,
      subject: envelope.subject || '(无主题)',
      from: toAddresses(envelope.from),
      to: toAddresses(envelope.to),
      cc: toAddresses(envelope.cc),
      date,
      size: message.size ?? 0,
      flags,
      hasAttachments,
      snippet,
      inReplyTo: envelope.inReplyTo ?? undefined,
      references: Array.isArray(envelope.references)
        ? envelope.references
        : envelope.references
          ? [envelope.references]
          : undefined,
    };
  }

  private async persistFullMessage(
    account: Account,
    folder: Folder,
    message: any,
  ): Promise<MessageMeta | undefined> {
    if (!message.source) return this.persistHeadOnly(account, folder, message);
    const parsed = await simpleParser(message.source);
    const attachments: AttachmentMeta[] = (parsed.attachments ?? []).map((attachment, index) => ({
      index,
      filename: attachment.filename || `附件-${index + 1}`,
      contentType: attachment.contentType,
      size: attachment.size,
      contentId: attachment.cid ?? undefined,
    }));

    const meta = this.buildMeta(
      account,
      folder,
      message,
      makeSnippet(parsed.text ?? undefined, parsed.html || undefined),
      attachments.length > 0,
    );

    if (meta.messageId === undefined && parsed.messageId) meta.messageId = parsed.messageId;
    if (!meta.inReplyTo && parsed.inReplyTo) meta.inReplyTo = parsed.inReplyTo;
    if ((!meta.references || !meta.references.length) && parsed.references) {
      meta.references = Array.isArray(parsed.references) ? parsed.references : [parsed.references];
    }

    // 附件立即落盘，避免阅读时再走一次网络
    for (const attachment of parsed.attachments ?? []) {
      const index = parsed.attachments.indexOf(attachment);
      try {
        const filePath = store.attachmentPath(meta.id, attachment.filename || `附件-${index + 1}`);
        const fs = await import('node:fs');
        fs.writeFileSync(filePath, attachment.content);
        attachments[index].localPath = filePath;
      } catch (error) {
        console.warn('[imap] 附件保存失败', error);
      }
    }

    store.saveMessageBody(account.id, folder.id, message.uid, {
      text: parsed.text ?? undefined,
      html: typeof parsed.html === 'string' ? parsed.html : undefined,
      attachments,
    });

    return meta;
  }

  private persistHeadOnly(
    account: Account,
    folder: Folder,
    message: any,
  ): MessageMeta | undefined {
    const structure = message.bodyStructure;
    const hasAttachments = Boolean(
      structure?.childNodes?.some(
        (node: any) =>
          node.disposition === 'attachment' ||
          (node.type === 'application' && node.disposition !== 'inline'),
      ),
    );
    return this.buildMeta(account, folder, message, '', hasAttachments);
  }

  /** 按需下载单封邮件正文（列表中只拉过邮件头的邮件） */
  async fetchMessageBody(
    account: Account,
    folder: Folder,
    uid: number,
  ): Promise<{ text?: string; html?: string; attachments: AttachmentMeta[] } | undefined> {
    const client = this.createClient(account);
    await client.connect();
    try {
      const lock = await client.getMailboxLock(folder.remotePath ?? folder.name);
      try {
        const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!message || !message.source) return undefined;
        const parsed = await simpleParser(message.source);
        const attachments: AttachmentMeta[] = (parsed.attachments ?? []).map(
          (attachment, index) => ({
            index,
            filename: attachment.filename || `附件-${index + 1}`,
            contentType: attachment.contentType,
            size: attachment.size,
            contentId: attachment.cid ?? undefined,
          }),
        );
        const metaId = `${account.id}/${folder.id}/${uid}`;
        for (const attachment of parsed.attachments ?? []) {
          const index = parsed.attachments.indexOf(attachment);
          try {
            const filePath = store.attachmentPath(
              metaId,
              attachment.filename || `附件-${index + 1}`,
            );
            const fs = await import('node:fs');
            fs.writeFileSync(filePath, attachment.content);
            attachments[index].localPath = filePath;
          } catch (error) {
            console.warn('[imap] 附件保存失败', error);
          }
        }
        const body = {
          text: parsed.text ?? undefined,
          html: typeof parsed.html === 'string' ? parsed.html : undefined,
          attachments,
        };
        store.saveMessageBody(account.id, folder.id, uid, body);
        store.patchMessage(metaId, {
          snippet: makeSnippet(body.text, body.html),
          hasAttachments: attachments.length > 0,
        });
        return body;
      } finally {
        lock.release();
      }
    } finally {
      try {
        await client.logout();
      } catch {
        /* 忽略 */
      }
    }
  }

  /** 与服务器同步标记状态 */
  async setFlags(account: Account, folder: Folder, uids: number[], flag: string, value: boolean) {
    const client = this.createClient(account);
    await client.connect();
    try {
      const lock = await client.getMailboxLock(folder.remotePath ?? folder.name);
      try {
        if (value) await client.messageFlagsAdd(uids, [flag], { uid: true });
        else await client.messageFlagsRemove(uids, [flag], { uid: true });
      } finally {
        lock.release();
      }
    } finally {
      try {
        await client.logout();
      } catch {
        /* 忽略 */
      }
    }
  }

  async moveMessages(account: Account, folder: Folder, uids: number[], targetPath: string) {
    const client = this.createClient(account);
    await client.connect();
    try {
      const lock = await client.getMailboxLock(folder.remotePath ?? folder.name);
      try {
        await client.messageMove(uids, targetPath, { uid: true });
      } finally {
        lock.release();
      }
    } finally {
      try {
        await client.logout();
      } catch {
        /* 忽略 */
      }
    }
  }

  async deleteMessages(account: Account, folder: Folder, uids: number[]) {
    const client = this.createClient(account);
    await client.connect();
    try {
      const lock = await client.getMailboxLock(folder.remotePath ?? folder.name);
      try {
        await client.messageDelete(uids, { uid: true });
      } finally {
        lock.release();
      }
    } finally {
      try {
        await client.logout();
      } catch {
        /* 忽略 */
      }
    }
  }

  /** 启动 IDLE 长连接，收到新邮件时回调 */
  async startIdle(account: Account, onNewMail: (accountId: string) => void): Promise<void> {
    if (this.clients.has(account.id)) return;
    const client = this.createClient(account);
    this.idleListeners.set(account.id, onNewMail);
    client.on('exists', (data: any) => {
      const count = typeof data === 'number' ? data : data?.count;
      if (count) onNewMail(account.id);
    });
    client.on('error', (error: Error) => {
      console.warn('[imap] IDLE 连接异常', error.message);
      this.clients.delete(account.id);
    });
    client.on('close', () => {
      this.clients.delete(account.id);
    });
    await client.connect();
    this.clients.set(account.id, client);
  }

  async stopIdle(accountId: string): Promise<void> {
    const client = this.clients.get(accountId);
    this.clients.delete(accountId);
    this.idleListeners.delete(accountId);
    if (!client) return;
    try {
      await client.logout();
    } catch {
      /* 忽略 */
    }
  }

  async stopAll(): Promise<void> {
    for (const accountId of [...this.clients.keys()]) {
      await this.stopIdle(accountId);
    }
  }
}

export function describeImapError(error: unknown): string {
  const err = error as any;
  const code = err?.code ?? err?.responseCode;
  const message: string = err?.message ?? String(error);
  // 服务器返回的原始原因（例如 "LOGIN failed" / "user is disabled"），对排查最有用
  const serverText: string =
    err?.responseText ?? err?.response ?? err?.serverResponse ?? '';
  const withServer = (base: string) => (serverText ? `${base}（服务器返回：${String(serverText).slice(0, 160)}）` : base);
  if (
    err?.authenticationFailed === true ||
    code === 'EAUTH' ||
    /authentication failed|invalid credentials|login failed|command failed|auth/i.test(message)
  ) {
    return withServer(
      'IMAP 登录被服务器拒绝：请确认「用户名」为完整邮箱地址，密码处填写客户端授权码/专用密码（不是网页登录密码），并在邮箱网页版开启 IMAP 服务',
    );
  }
  if (code === 'ENOTFOUND' || /getaddrinfo|ENOTFOUND/i.test(message)) {
    return '无法解析邮件服务器地址，请检查 IMAP 主机名是否正确';
  }
  if (code === 'ECONNREFUSED') {
    return '连接被拒绝：端口可能被占用或被服务器限制，请核对端口与加密方式';
  }
  if (code === 'ETIMEDOUT' || /timeout/i.test(message)) {
    return '连接超时：请检查网络或防火墙是否允许该端口';
  }
  if (/certificate|self signed/i.test(message)) {
    return '证书校验失败：服务器使用了自签名证书，请确认服务器地址';
  }
  return withServer(message);
}

export const imapService = new ImapService();

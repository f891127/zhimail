/** SMTP 发信服务：发送、回复、转发；失败时保留草稿并返回可读原因 */

import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';
import { decryptSecret } from './crypto';
import { store } from './store';
import type { Account, DraftInput, SendResult } from './types';

function buildTransporter(account: Account) {
  const secret = store.getAccountSecret(account.id);
  const password = decryptSecret(secret.smtpPassword) ?? decryptSecret(secret.imapPassword);
  if (!password) throw new Error('未找到该账户的 SMTP 授权码，请在账户设置中重新填写');

  return nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: { user: account.smtp.user || account.email, pass: password },
    connectionTimeout: 20000,
    greetingTimeout: 15000,
    socketTimeout: 60000,
  });
}

export function describeSmtpError(error: unknown): string {
  const err = error as any;
  const message: string = err?.message ?? String(error);
  if (err?.code === 'EAUTH' || /authentication|535|550/i.test(message)) {
    return 'SMTP 认证失败：请确认授权码有效，且邮箱已开启 SMTP 服务';
  }
  if (err?.code === 'ENOTFOUND') return '无法解析 SMTP 服务器地址，请检查主机名';
  if (err?.code === 'ECONNREFUSED') return 'SMTP 连接被拒绝，请核对端口与加密方式（465 为 SSL，587 为 STARTTLS）';
  if (err?.code === 'ETIMEDOUT') return 'SMTP 连接超时，请检查网络或防火墙';
  return message;
}

export class SmtpService {
  async testConnection(account: Account): Promise<{ ok: boolean; message: string }> {
    try {
      const transporter = buildTransporter(account);
      await transporter.verify();
      return { ok: true, message: 'SMTP 连接成功，可以发送邮件' };
    } catch (error) {
      return { ok: false, message: describeSmtpError(error) };
    }
  }

  async send(account: Account, draft: DraftInput): Promise<SendResult> {
    try {
      const transporter = buildTransporter(account);
      const attachments = (draft.attachments ?? [])
        .filter((file) => fs.existsSync(file))
        .map((file) => ({ filename: path.basename(file), path: file }));

      const info = await transporter.sendMail({
        from: {
          name: account.displayName || account.name,
          address: account.email,
        },
        to: draft.to,
        cc: draft.cc || undefined,
        bcc: draft.bcc || undefined,
        subject: draft.subject,
        html: draft.html,
        text: draft.text,
        inReplyTo: draft.inReplyTo,
        references: draft.references,
        attachments,
      });
      return { ok: true, messageId: info.messageId };
    } catch (error) {
      return { ok: false, error: describeSmtpError(error) };
    }
  }
}

export const smtpService = new SmtpService();

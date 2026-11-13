/** 系统设置页：参照 Foxmail「系统设置」，分程序 / 邮件 / 语言三组 */
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { api } from '@/lib/api';
import { LOCALE_OPTIONS } from '@/lib/i18n';
import { useAppStore } from '@/store/useAppStore';
import type { AppLocale, AppSystemState } from '@/types/zhimail';

function Checkbox({
  checked,
  label,
  hint,
  onChange,
}: {
  checked: boolean;
  label: string;
  hint?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-[3px] hover:bg-black/[0.02]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-[2px] h-3.5 w-3.5 accent-brand-500"
      />
      <span className="text-[11px] leading-4 text-shell-text">
        {label}
        {hint && <span className="ml-1 text-shell-faint">{hint}</span>}
      </span>
    </label>
  );
}

export function SystemSettingsPage() {
  const store = useAppStore();
  const [system, setSystem] = useState<AppSystemState | null>(null);

  useEffect(() => {
    void api.app.system().then(setSystem);
  }, [store.settings?.app, store.settings?.mail, store.settings?.locale]);

  const app = store.settings?.app;
  const mail = store.settings?.mail;

  const patchApp = (patch: Partial<NonNullable<typeof app>>) =>
    void store.applySystemSettings({ app: { ...app, ...patch } });
  const patchMail = (patch: Partial<NonNullable<typeof mail>>) =>
    void store.applySystemSettings({ mail: { ...mail, ...patch } });

  return (
    <div className="space-y-4">
      <section>
        <div className="mb-1.5 text-[11px] font-semibold text-shell-sub">程序</div>
        <div className="space-y-[2px] rounded border border-shell-lineSoft bg-[#fafbfc] px-2.5 py-2">
          <Checkbox
            checked={system?.defaultMailClient ?? false}
            label="设置知邮为系统默认邮件客户端"
            hint={system?.canSetDefaultMailClient ? '(写入当前用户注册表，无需管理员)' : '(仅 Windows 支持)'}
            onChange={(value) => void store.setDefaultMailClient(value)}
          />
          <Checkbox
            checked={app?.autoLaunch ?? false}
            label="开机自动启动知邮"
            onChange={(value) => patchApp({ autoLaunch: value })}
          />
          <Checkbox
            checked={app?.showInTaskbar ?? true}
            label="最小化时，在任务栏显示"
            onChange={(value) => patchApp({ showInTaskbar: value })}
          />
          <Checkbox
            checked={app?.quitOnClose ?? true}
            label="关闭主窗口时，退出程序"
            hint="(取消勾选则最小化到托盘继续收信)"
            onChange={(value) => patchApp({ quitOnClose: value })}
          />
          <Checkbox
            checked={store.settings?.update?.autoCheck ?? true}
            label="软件自动更新"
            hint="(启动后自动检查 GitHub Releases)"
            onChange={(value) =>
              void store.updateSettings({ update: { ...store.settings?.update, autoCheck: value } } as never)
            }
          />
          <div className="flex items-center gap-2 px-1 pt-1">
            <span className="text-[11px] text-shell-text">界面字体大小：</span>
            <select
              value={app?.fontScale ?? 'standard'}
              onChange={(event) => patchApp({ fontScale: event.target.value as 'small' | 'standard' | 'large' })}
              className="field w-[110px] py-1"
            >
              <option value="small">较小</option>
              <option value="standard">标准</option>
              <option value="large">较大</option>
            </select>
            <span className="text-[11px] text-shell-faint">即时生效，无需重启</span>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-1.5 text-[11px] font-semibold text-shell-sub">邮件</div>
        <div className="space-y-[2px] rounded border border-shell-lineSoft bg-[#fafbfc] px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-2 px-1 py-1">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={mail?.autoReceive ?? true}
                onChange={(e) => patchMail({ autoReceive: e.target.checked })}
                className="h-3.5 w-3.5 accent-brand-500"
              />
              <span className="text-[11px] text-shell-text">定时收取邮件</span>
            </label>
            <span className="text-[11px] text-shell-sub">每隔</span>
            <input
              type="number"
              min={1}
              max={240}
              value={mail?.receiveIntervalMinutes ?? 15}
              disabled={!(mail?.autoReceive ?? true)}
              onChange={(e) => {
                const value = Math.max(1, Math.min(240, Number(e.target.value) || 15));
                patchMail({ receiveIntervalMinutes: value });
              }}
              className="w-16 rounded border border-shell-line bg-white px-1.5 py-[3px] text-[11px] text-shell-text outline-none focus:border-brand-400 disabled:opacity-50"
            />
            <span className="text-[11px] text-shell-sub">分钟</span>
            <span className="text-[10px] text-shell-faint">（1–240，修改后立即生效；点「同步」可手动立即收取）</span>
          </div>
          <Checkbox
            checked={mail?.notify ?? true}
            label="新邮件提醒窗口"
            hint="(系统通知，点击可定位到该邮件)"
            onChange={(value) => patchMail({ notify: value })}
          />
          <Checkbox
            checked={mail?.notifySound ?? false}
            label="新邮件提醒声音"
            onChange={(value) => patchMail({ notifySound: value })}
          />
          <Checkbox
            checked={mail?.attachmentPreview ?? true}
            label="附件预览"
            hint="(图片 / PDF / 文本可直接在客户端内预览)"
            onChange={(value) => patchMail({ attachmentPreview: value })}
          />
          <div className="flex flex-wrap items-center gap-3 px-1 pt-1.5">
            <span className="text-[11px] text-shell-text">邮件列表显示模式：</span>
            {(
              [
                ['normal', '普通模式'],
                ['conversation', '会话模式'],
                ['related', '相关邮件模式'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="listMode"
                  checked={(mail?.listMode ?? 'conversation') === value}
                  onChange={() => patchMail({ listMode: value })}
                  className="h-3.5 w-3.5 accent-brand-500"
                />
                <span className="text-[11px] text-shell-text">
                  {label}
                  {value === 'conversation' && <span className="ml-1 rounded bg-brand-100 px-1 text-[10px] text-brand-700">推荐</span>}
                </span>
              </label>
            ))}
          </div>
          <div className="px-1 text-[10px] leading-4 text-shell-faint">
            普通模式按时间平铺全部邮件；会话模式把同一话题合并成一条；相关邮件模式在当前文件夹内按发件人与话题聚合相似邮件。
          </div>
        </div>
      </section>

      <section>
        <div className="mb-1.5 text-[11px] font-semibold text-shell-sub">语言</div>
        <div className="rounded border border-shell-lineSoft bg-[#fafbfc] px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-3">
            {LOCALE_OPTIONS.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="locale"
                  checked={(store.settings?.locale ?? 'system') === option.value}
                  onChange={() => void store.applySystemSettings({ locale: option.value as AppLocale })}
                  className="h-3.5 w-3.5 accent-brand-500"
                />
                <span className="text-[11px] text-shell-text">{option.label}</span>
              </label>
            ))}
          </div>
          <div className="mt-1 flex items-start gap-1 text-[10px] leading-4 text-shell-faint">
            <Icon name="info" size={11} className="mt-[2px] shrink-0" />
            <span>
              切换已覆盖菜单栏、工具栏、文件夹树、邮件列表表头与状态栏；AI 助手、简报中心等深层文案仍在补齐中，
              当前以简体中文显示。
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

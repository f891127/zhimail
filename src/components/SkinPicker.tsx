/** 皮肤切换：工具栏右上角的调色板按钮，弹出 7 套预置皮肤 */
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Icon } from './Icon';
import { SKINS, resolveSkin } from '@/lib/skin';

export function SkinPicker() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const pushToast = useAppStore((state) => state.pushToast);
  const current = resolveSkin(settings?.ui?.skin);

  useEffect(() => {
    if (!open) return;
    const handleDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const handleBlur = () => setOpen(false);
    window.addEventListener('mousedown', handleDown);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('mousedown', handleDown);
      window.removeEventListener('blur', handleBlur);
    };
  }, [open]);

  const choose = async (id: string, name: string) => {
    await updateSettings({ ui: { ...(settings?.ui ?? {}), skin: id } } as never);
    pushToast({ type: 'success', title: `已切换到「${name}」皮肤`, message: '设置会自动保存，下次启动继续生效' });
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={`tool-btn ${open ? 'chrome-btn-active' : ''}`}
        title="切换皮肤"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="palette" size={15} className="text-brand-500" />
        <span>皮肤</span>
      </button>
      {open && (
        <div className="absolute right-0 top-[30px] z-[90] w-[288px] rounded-md border border-shell-line bg-shell-panel p-2 shadow-menu">
          <div className="mb-1.5 px-1 text-[11px] font-semibold text-shell-sub">界面皮肤</div>
          <div className="grid grid-cols-1 gap-1">
            {SKINS.map((skin) => {
              const active = skin.id === current;
              return (
                <button
                  key={skin.id}
                  type="button"
                  onClick={() => void choose(skin.id, skin.name)}
                  className={`flex items-center gap-2 rounded border px-2 py-1.5 text-left transition-colors duration-120 ${
                    active
                      ? 'border-brand-400 bg-brand-50'
                      : 'border-transparent hover:border-shell-line hover:bg-black/[0.03]'
                  }`}
                >
                  <span className="flex shrink-0 overflow-hidden rounded border border-black/10">
                    {skin.swatch.map((color, index) => (
                      <span key={color} style={{ background: color, width: index === 2 ? 16 : 10, height: 22 }} />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-xs font-medium text-shell-text">
                      {skin.name}
                      {active && <Icon name="check" size={11} className="text-brand-600" />}
                    </span>
                    <span className="block truncate text-[10px] text-shell-faint">{skin.note}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 border-t border-shell-lineSoft px-1 pt-1.5 text-[10px] text-shell-faint">
            也可以在「设置 → 界面」里切换
          </div>
        </div>
      )}
    </div>
  );
}

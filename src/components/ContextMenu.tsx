/** 轻量右键菜单：支持分隔线、禁用项与二级菜单 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export interface ContextMenuItem {
  label?: string;
  onClick?: () => void;
  divider?: boolean;
  disabled?: boolean;
  danger?: boolean;
  shortcut?: string;
  submenu?: ContextMenuItem[];
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    setPosition({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [x, y]);

  useEffect(() => {
    const handleDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handleDown);
    window.addEventListener('keydown', handleKey);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('mousedown', handleDown);
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[80] min-w-[168px] rounded-[3px] border border-shell-line bg-white py-1 shadow-menu"
      style={{ left: position.left, top: position.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item, index) =>
        item.divider ? (
          <div key={`divider-${index}`} className="my-1 h-px bg-shell-lineSoft" />
        ) : (
          <div
            key={`${item.label}-${index}`}
            className="relative"
            onMouseEnter={() => setOpenSubmenu(item.submenu ? index : null)}
          >
            <button
              type="button"
              disabled={item.disabled}
              onClick={() => {
                if (item.submenu) return;
                item.onClick?.();
                onClose();
              }}
              className={`flex w-full items-center gap-2 px-2.5 py-[5px] text-left text-[12px] transition-colors ${
                item.disabled
                  ? 'cursor-default text-shell-faint'
                  : item.danger
                    ? 'text-rose-600 hover:bg-rose-50'
                    : 'text-shell-text hover:bg-brand-50'
              }`}
            >
              <span className="flex-1 truncate">{item.label}</span>
              {item.shortcut && <span className="text-[10px] text-shell-faint">{item.shortcut}</span>}
              {item.submenu && <Icon name="chevron-right" size={11} className="text-shell-faint" />}
            </button>

            {item.submenu && openSubmenu === index && (
              <div className="absolute left-full top-0 -mt-1 ml-0.5 max-h-[320px] min-w-[150px] overflow-auto rounded-[3px] border border-shell-line bg-white py-1 shadow-menu">
                {item.submenu.map((sub, subIndex) => (
                  <button
                    key={`${sub.label}-${subIndex}`}
                    type="button"
                    disabled={sub.disabled}
                    onClick={() => {
                      sub.onClick?.();
                      onClose();
                    }}
                    className={`block w-full truncate px-2.5 py-[5px] text-left text-[12px] ${
                      sub.disabled ? 'cursor-default text-shell-faint' : 'text-shell-text hover:bg-brand-50'
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ),
      )}
    </div>
  );
}

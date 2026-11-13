/** 界面语言 Hook：组件内调用 t('menu.file') 即可取到当前语言文案 */
import { useCallback } from 'react';
import { translate } from '@/lib/i18n';
import { useAppStore } from '@/store/useAppStore';

export function useT() {
  const locale = useAppStore((state) => state.locale);
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );
}

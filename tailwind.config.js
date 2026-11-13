/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 全部走 CSS 变量，切换皮肤时只换变量（见 src/index.css 的 data-skin 段）
        brand: {
          50: 'rgb(var(--c-brand-50) / <alpha-value>)',
          100: 'rgb(var(--c-brand-100) / <alpha-value>)',
          200: 'rgb(var(--c-brand-200) / <alpha-value>)',
          300: 'rgb(var(--c-brand-300) / <alpha-value>)',
          400: 'rgb(var(--c-brand-400) / <alpha-value>)',
          500: 'rgb(var(--c-brand-500) / <alpha-value>)',
          600: 'rgb(var(--c-brand-600) / <alpha-value>)',
          700: 'rgb(var(--c-brand-700) / <alpha-value>)',
          800: 'rgb(var(--c-brand-800) / <alpha-value>)',
          900: 'rgb(var(--c-brand-900) / <alpha-value>)',
        },
        accent: {
          400: 'rgb(var(--c-accent-400) / <alpha-value>)',
          500: 'rgb(var(--c-accent-500) / <alpha-value>)',
          600: 'rgb(var(--c-accent-600) / <alpha-value>)',
        },
        shell: {
          bg: 'rgb(var(--c-shell-bg) / <alpha-value>)',
          panel: 'rgb(var(--c-shell-panel) / <alpha-value>)',
          chrome: 'rgb(var(--c-shell-chrome) / <alpha-value>)',
          line: 'rgb(var(--c-shell-line) / <alpha-value>)',
          lineSoft: 'rgb(var(--c-shell-lineSoft) / <alpha-value>)',
          text: 'rgb(var(--c-shell-text) / <alpha-value>)',
          sub: 'rgb(var(--c-shell-sub) / <alpha-value>)',
          faint: 'rgb(var(--c-shell-faint) / <alpha-value>)',
        },
      },
      fontFamily: {
        ui: [
          '"Microsoft YaHei UI"',
          '"Microsoft YaHei"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Segoe UI"',
          'system-ui',
          'sans-serif',
        ],
        mono: ['"Cascadia Mono"', 'Consolas', '"SF Mono"', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', '16px'],
        xs: ['12px', '18px'],
        sm: ['13px', '20px'],
        base: ['14px', '22px'],
        md: ['15px', '24px'],
        lg: ['17px', '26px'],
        xl: ['20px', '28px'],
      },
      boxShadow: {
        pane: '0 1px 2px rgba(16, 24, 40, 0.06)',
        drawer: '-6px 0 24px rgba(16, 24, 40, 0.12)',
        card: '0 2px 8px rgba(16, 24, 40, 0.08)',
        menu: '0 6px 18px rgba(16, 24, 40, 0.14)',
      },
      transitionDuration: {
        120: '120ms',
        180: '180ms',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(16px)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        'rise-in': {
          from: { transform: 'translateY(6px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
      },
      animation: {
        'fade-in': 'fade-in 140ms ease-out',
        'slide-in-right': 'slide-in-right 180ms ease-out',
        'rise-in': 'rise-in 160ms ease-out',
        'pulse-soft': 'pulse-soft 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

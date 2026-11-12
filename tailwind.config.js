/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef5fd',
          100: '#d7e7fa',
          200: '#b0cdf3',
          300: '#7fabe8',
          400: '#4a88dc',
          500: '#1f6fd0',
          600: '#1a5cb0',
          700: '#164a8d',
          800: '#123a6e',
          900: '#0e2b51',
        },
        accent: {
          400: '#f5764a',
          500: '#e8541e',
          600: '#c84312',
        },
        shell: {
          bg: '#f5f6f7',
          panel: '#ffffff',
          chrome: '#eef0f2',
          line: '#d9dde2',
          lineSoft: '#e8ebee',
          text: '#1f2329',
          sub: '#5f6772',
          faint: '#8d959f',
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

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: 'rgb(var(--rv-ink) / <alpha-value>)',
          soft: 'rgb(var(--rv-ink-soft) / <alpha-value>)',
          faint: 'rgb(var(--rv-ink-faint) / <alpha-value>)'
        },
        paper: {
          DEFAULT: 'rgb(var(--rv-bg) / <alpha-value>)',
          card: 'rgb(var(--rv-card) / <alpha-value>)',
          line: 'rgb(var(--rv-line) / <alpha-value>)'
        },
        reel: {
          DEFAULT: 'rgb(var(--rv-accent) / <alpha-value>)',
          dark: 'rgb(var(--rv-accent-dark) / <alpha-value>)',
          soft: 'rgb(var(--rv-accent-soft) / <alpha-value>)'
        },
        moss: 'rgb(var(--rv-moss) / <alpha-value>)'
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"PingFang SC"', '"Hiragino Sans GB"',
          '"Microsoft YaHei"', '"Noto Sans SC"', 'system-ui', 'sans-serif'
        ],
        serif: ['"Songti SC"', '"SimSun"', 'Georgia', 'serif']
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--rv-shadow) / 0.06), 0 8px 24px -12px rgb(var(--rv-shadow) / 0.18)',
        lift: '0 2px 4px rgb(var(--rv-shadow) / 0.08), 0 18px 40px -18px rgb(var(--rv-shadow) / 0.28)'
      },
      borderRadius: {
        lg: 'var(--rv-radius-lg)',
        xl: 'var(--rv-radius-xl)',
        '2xl': 'var(--rv-radius-2xl)',
        xl2: 'var(--rv-radius-2xl)'
      }
    },
  },
  plugins: [],
}

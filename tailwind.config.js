/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /* ------------------------------------------------------------------
         色彩：全部指向 CSS 变量，深浅主题无缝切换
         命名保留 v1 语义（ink / paper / reel / moss），并按 Material 3 补齐
         ------------------------------------------------------------------ */
      colors: {
        ink: {
          DEFAULT: 'rgb(var(--rv-ink) / <alpha-value>)',
          soft: 'rgb(var(--rv-ink-soft) / <alpha-value>)',
          faint: 'rgb(var(--rv-ink-faint) / <alpha-value>)',
          inverse: 'rgb(var(--rv-ink-inverse) / <alpha-value>)'
        },
        paper: {
          DEFAULT: 'rgb(var(--rv-bg) / <alpha-value>)',
          card: 'rgb(var(--rv-surface) / <alpha-value>)',
          sunken: 'rgb(var(--rv-sunken) / <alpha-value>)',
          line: 'rgb(var(--rv-line) / <alpha-value>)',
          lineStrong: 'rgb(var(--rv-line-strong) / <alpha-value>)'
        },
        reel: {
          DEFAULT: 'rgb(var(--rv-accent) / <alpha-value>)',
          dark: 'rgb(var(--rv-accent-dark) / <alpha-value>)',
          soft: 'rgb(var(--rv-accent-soft) / <alpha-value>)',
          on: 'rgb(var(--rv-on-accent) / <alpha-value>)'
        },
        moss: {
          DEFAULT: 'rgb(var(--rv-success) / <alpha-value>)',
          on: 'rgb(var(--rv-on-success) / <alpha-value>)'
        },
        clay: 'rgb(var(--rv-warning) / <alpha-value>)',
        danger: {
          DEFAULT: 'rgb(var(--rv-danger) / <alpha-value>)',
          soft: 'rgb(var(--rv-danger-soft) / <alpha-value>)',
          on: 'rgb(var(--rv-on-danger) / <alpha-value>)'
        }
      },

      /* ------------------------------------------------------------------
         字体：正文走系统中文字体栈（离线可用），标题叠加中文衬线做「编辑感」
         ------------------------------------------------------------------ */
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"PingFang SC"', '"HarmonyOS Sans SC"',
          '"Hiragino Sans GB"', '"Microsoft YaHei"', '"Noto Sans SC"', 'system-ui',
          'sans-serif'
        ],
        serif: ['"Songti SC"', '"Source Han Serif SC"', '"Noto Serif CJK SC"',
          '"SimSun"', 'Georgia', 'serif'],
        display: ['"Songti SC"', '"Source Han Serif SC"', '"Noto Serif CJK SC"',
          '"Times New Roman"', 'Georgia', 'serif'],
        mono: ['"SF Mono"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace']
      },

      /* ------------------------------------------------------------------
         类型阶梯（Material 3）—— 全部 rem，随「字号」设置整体缩放
         ------------------------------------------------------------------ */
      fontSize: {
        /** 页面主标题：跟随字号设置的 rem 基准 */
        page: ['1.75rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '600' }],
        display: ['2rem', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '600' }],
        headline: ['1.5rem', { lineHeight: '1.22', letterSpacing: '-0.015em' }],
        title: ['1.125rem', { lineHeight: '1.35', letterSpacing: '-0.01em' }],
        subtitle: ['1rem', { lineHeight: '1.4', letterSpacing: '-0.005em' }],
        body: ['0.9375rem', { lineHeight: '1.6' }],
        'body-sm': ['0.875rem', { lineHeight: '1.55' }],
        label: ['0.8125rem', { lineHeight: '1.45', fontWeight: '500' }],
        caption: ['0.75rem', { lineHeight: '1.4' }],
        micro: ['0.6875rem', { lineHeight: '1.35' }]
      },

      /* ------------------------------------------------------------------
         形状：跟随「圆角」设置
         ------------------------------------------------------------------ */
      borderRadius: {
        sm: 'var(--rv-radius-sm)',
        DEFAULT: 'var(--rv-radius-md)',
        md: 'var(--rv-radius-md)',
        lg: 'var(--rv-radius-lg)',
        xl: 'var(--rv-radius-xl)',
        '2xl': 'var(--rv-radius-2xl)',
        full: 'var(--rv-radius-full)'
      },

      /* ------------------------------------------------------------------
         层级：3 级 elevation，暖色调阴影
         ------------------------------------------------------------------ */
      boxShadow: {
        e1: '0 1px 2px rgb(var(--rv-shadow) / 0.05), 0 2px 8px -4px rgb(var(--rv-shadow) / 0.12)',
        e2: '0 1px 2px rgb(var(--rv-shadow) / 0.05), 0 6px 20px -8px rgb(var(--rv-shadow) / 0.16)',
        e3: '0 2px 6px rgb(var(--rv-shadow) / 0.08), 0 14px 32px -12px rgb(var(--rv-shadow) / 0.24)',
        card: '0 1px 2px rgb(var(--rv-shadow) / 0.05), 0 6px 20px -8px rgb(var(--rv-shadow) / 0.16)',
        lift: '0 2px 6px rgb(var(--rv-shadow) / 0.08), 0 18px 44px -16px rgb(var(--rv-shadow) / 0.28)',
        pop: '0 8px 12px -6px rgb(var(--rv-shadow) / 0.16), 0 24px 56px -20px rgb(var(--rv-shadow) / 0.34)',
        none: 'none'
      },

      /* ------------------------------------------------------------------
         动效：曲线与时长
         ------------------------------------------------------------------ */
      transitionTimingFunction: {
        spring: 'var(--ease-spring)',
        standard: 'var(--ease-standard)',
        decelerate: 'var(--ease-decelerate)',
        accelerate: 'var(--ease-accelerate)'
      },
      transitionDuration: {
        '1': 'var(--dur-1)',
        '2': 'var(--dur-2)',
        '3': 'var(--dur-3)',
        '4': 'var(--dur-4)',
        '5': 'var(--dur-5)'
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: {
          from: { transform: 'translateY(18px) scale(0.99)', opacity: '0' },
          to: { transform: 'translateY(0) scale(1)', opacity: '1' }
        },
        popIn: {
          from: { transform: 'scale(0.92)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' }
        },
        staggerIn: {
          from: { transform: 'translateY(10px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' }
        },
        shimmer: {
          '0%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0 50%' }
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' }
        },
        rvShake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-5px)' },
          '40%': { transform: 'translateX(5px)' },
          '60%': { transform: 'translateX(-3px)' },
          '80%': { transform: 'translateX(3px)' }
        }
      },
      animation: {
        fadeIn: 'fadeIn var(--dur-3) var(--ease-decelerate) both',
        slideUp: 'slideUp var(--dur-4) var(--ease-spring) both',
        popIn: 'popIn var(--dur-3) var(--ease-spring) both',
        staggerIn: 'staggerIn var(--dur-4) var(--ease-decelerate) both',
        shimmer: 'shimmer 1.4s var(--ease-standard) infinite',
        pulseSoft: 'pulseSoft 1.6s var(--ease-standard) infinite',
        shake: 'rvShake 380ms var(--ease-standard) both'
      },

      /* Apple HIG 最小触控 44px */
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' }
    }
  },
  plugins: []
}

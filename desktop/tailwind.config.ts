import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // Linear-school palette: warm-neutral light, deep cool dark.
        bg: {
          DEFAULT: '#FCFCFD',
          dark: '#0B0B0F',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          raised: '#F7F7F9',
          sunk: '#F2F2F4',
          dark: '#15151B',
          'dark-raised': '#1C1C24',
          'dark-sunk': '#101015',
        },
        border: {
          DEFAULT: '#E4E4E7',
          strong: '#D4D4D8',
          dark: '#27272A',
          'dark-strong': '#3F3F46',
        },
        ink: {
          DEFAULT: '#0B0B0F',
          muted: '#52525B',
          subtle: '#A1A1AA',
          dark: '#F5F5F7',
          'dark-muted': '#A1A1AA',
          'dark-subtle': '#71717A',
        },
        accent: {
          50: '#EEF0FE',
          100: '#DDE0FD',
          200: '#BFC6FB',
          300: '#9AA3F8',
          400: '#7B86F6',
          500: '#5765F2',
          600: '#4651D9',
          700: '#3942B8',
          800: '#2D348E',
          900: '#212666',
          DEFAULT: '#5765F2',
        },
        success: '#10B981',
        warn: '#F59E0B',
        danger: '#EF4444',
      },
      fontFamily: {
        display: ['"SF Pro Display"', 'Geist', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Geist', '"SF Pro Text"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['10.5px', { lineHeight: '14px', letterSpacing: '0.04em' }],
        xs: ['11.5px', { lineHeight: '16px' }],
        sm: ['12.5px', { lineHeight: '17px' }],
        base: ['13.5px', { lineHeight: '20px' }],
        md: ['14px', { lineHeight: '22px' }],
        lg: ['16px', { lineHeight: '24px' }],
        xl: ['18px', { lineHeight: '26px' }],
        '2xl': ['22px', { lineHeight: '28px', letterSpacing: '-0.01em' }],
        '3xl': ['28px', { lineHeight: '34px', letterSpacing: '-0.015em' }],
        '4xl': ['36px', { lineHeight: '42px', letterSpacing: '-0.02em' }],
        '5xl': ['48px', { lineHeight: '54px', letterSpacing: '-0.025em' }],
        '6xl': ['60px', { lineHeight: '64px', letterSpacing: '-0.03em' }],
        '7xl': ['72px', { lineHeight: '76px', letterSpacing: '-0.035em' }],
        '8xl': ['96px', { lineHeight: '100px', letterSpacing: '-0.04em' }],
      },
      letterSpacing: {
        tightest: '-0.04em',
        cap: '0.06em',
      },
      borderRadius: {
        none: '0px',
        sm: '6px',
        DEFAULT: '8px',
        md: '10px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        '3xl': '28px',
        full: '9999px',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(8 8 16 / 0.05)',
        sm: '0 2px 4px -1px rgb(8 8 16 / 0.06), 0 1px 2px 0 rgb(8 8 16 / 0.04)',
        DEFAULT:
          '0 4px 8px -2px rgb(8 8 16 / 0.07), 0 2px 4px -1px rgb(8 8 16 / 0.04)',
        md: '0 8px 16px -4px rgb(8 8 16 / 0.08), 0 4px 8px -2px rgb(8 8 16 / 0.05)',
        lg: '0 16px 32px -8px rgb(8 8 16 / 0.10), 0 8px 16px -4px rgb(8 8 16 / 0.06)',
        xl: '0 24px 48px -12px rgb(8 8 16 / 0.18)',
        glow: '0 0 0 1px rgb(87 101 242 / 0.20), 0 4px 12px -2px rgb(87 101 242 / 0.30)',
        'glow-lg':
          '0 0 0 1px rgb(87 101 242 / 0.30), 0 12px 32px -8px rgb(87 101 242 / 0.40)',
        inner: 'inset 0 1px 2px 0 rgb(8 8 16 / 0.06)',
      },
      backgroundImage: {
        'mesh-light':
          'radial-gradient(ellipse at top left, rgb(87 101 242 / 0.06), transparent 40%), radial-gradient(ellipse at bottom right, rgb(124 58 237 / 0.04), transparent 50%)',
        'mesh-dark':
          'radial-gradient(ellipse at top left, rgb(87 101 242 / 0.10), transparent 40%), radial-gradient(ellipse at bottom right, rgb(124 58 237 / 0.08), transparent 50%)',
        'accent-gradient':
          'linear-gradient(135deg, #5765F2 0%, #7C3AED 100%)',
        'shimmer':
          'linear-gradient(90deg, transparent 0%, rgb(255 255 255 / 0.08) 50%, transparent 100%)',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { opacity: '0.7', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.18)' },
        },
        pulseRing: {
          '0%': {
            boxShadow: '0 0 0 0 rgb(87 101 242 / 0.55)',
          },
          '70%': {
            boxShadow: '0 0 0 6px rgb(87 101 242 / 0)',
          },
          '100%': {
            boxShadow: '0 0 0 0 rgb(87 101 242 / 0)',
          },
        },
        cursor: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        rise: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        breathe: 'breathe 1.6s ease-in-out infinite',
        'pulse-ring': 'pulseRing 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        cursor: 'cursor 1.05s steps(1, end) infinite',
        slideIn: 'slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        rise: 'rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer: 'shimmer 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config

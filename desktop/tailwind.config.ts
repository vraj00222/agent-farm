import type { Config } from 'tailwindcss'

/**
 * Pure tinted black & white system. No accent color. Semantic state colors
 * exist only as 5px dots, never as backgrounds, borders, or accents.
 *
 * All neutrals are tinted toward warm-cool ink (chroma ~0.005) per
 * impeccable's "never use #000 or #fff" rule.
 *
 * Motion is one curve only: cubic-bezier(0.32, 0.72, 0, 1).
 */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // Tinted neutrals — warm-cool ink scale.
        // Light surface: bone (warm off-white). Dark surface: deep ink.
        bone: {
          DEFAULT: '#FAFAF9', // primary bg, light
          raised: '#F4F4F2',  // raised surface (selected, hover)
          sunk: '#EFEFED',    // sunken surface (input bg, code)
        },
        ink: {
          50:  '#F7F7F6',
          100: '#EAEAE8',
          200: '#D6D6D2',
          300: '#B5B5B0',
          400: '#85857F',
          500: '#5C5C56',
          600: '#3F3F3B',
          700: '#2A2A27',
          800: '#1A1A18',
          900: '#0F0F0E',     // deep ink for text. Not pure black.
          DEFAULT: '#0F0F0E',
        },
        // Dark mode equivalents.
        coal: {
          DEFAULT: '#0E0E0D', // deep bg, dark mode
          raised: '#181816',
          sunk: '#0A0A09',
        },
        chalk: {
          DEFAULT: '#F2F2F0',  // text on dark
          dim: '#A8A8A2',
          subtle: '#6E6E68',
        },
        // Borders — tinted hairlines.
        line: {
          DEFAULT: '#E0E0DC',
          strong: '#C8C8C2',
          dark: '#252523',
          'dark-strong': '#3A3A36',
        },
        // Semantic state colors — used ONLY for the small state dot.
        // Desaturated. Never used as backgrounds, borders, fills.
        state: {
          run: '#0F0F0E',     // running = ink (with pulse ring)
          done: '#3F3F3B',    // done = mid ink
          failed: '#A02F2F',  // a single muted brick red
          noop: '#85857F',    // muted gray
        },
      },
      fontFamily: {
        // Geist + JetBrains Mono — both vetted against impeccable's reflex-reject list.
        // No display serif. No second sans. One family, varied weights.
        sans: ['Geist', '"SF Pro Text"', 'system-ui', 'sans-serif'],
        display: ['Geist', '"SF Pro Display"', 'system-ui', 'sans-serif'],
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
        '2xl': ['22px', { lineHeight: '28px', letterSpacing: '-0.012em' }],
        '3xl': ['28px', { lineHeight: '32px', letterSpacing: '-0.018em' }],
        '4xl': ['36px', { lineHeight: '40px', letterSpacing: '-0.024em' }],
        '5xl': ['48px', { lineHeight: '52px', letterSpacing: '-0.030em' }],
      },
      letterSpacing: {
        tightest: '-0.04em',
        cap: '0.10em',
      },
      borderRadius: {
        none: '0px',
        sm: '5px',
        DEFAULT: '6px',
        md: '8px',
        lg: '10px',
        xl: '14px',
        '2xl': '18px',
        full: '9999px',
      },
      boxShadow: {
        // Practically non-existent. The skill says shadows must be ultra-diffuse.
        xs:   '0 1px 0 0 rgb(15 15 14 / 0.04)',
        sm:   '0 1px 2px 0 rgb(15 15 14 / 0.04)',
        DEFAULT: '0 2px 4px -1px rgb(15 15 14 / 0.04), 0 1px 2px 0 rgb(15 15 14 / 0.03)',
        md:   '0 4px 8px -2px rgb(15 15 14 / 0.05), 0 2px 4px -1px rgb(15 15 14 / 0.03)',
      },
      transitionTimingFunction: {
        'expo-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'quart-out': 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      keyframes: {
        // Pulse-ring on the running dot — ink rings outward, no color.
        ringInk: {
          '0%':   { boxShadow: '0 0 0 0 rgb(15 15 14 / 0.45)' },
          '70%':  { boxShadow: '0 0 0 7px rgb(15 15 14 / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(15 15 14 / 0)' },
        },
        ringChalk: {
          '0%':   { boxShadow: '0 0 0 0 rgb(242 242 240 / 0.40)' },
          '70%':  { boxShadow: '0 0 0 7px rgb(242 242 240 / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(242 242 240 / 0)' },
        },
        cursor: {
          '0%, 49%':   { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        rise: {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'ring-ink':   'ringInk 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ring-chalk': 'ringChalk 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        cursor:       'cursor 1.05s steps(1, end) infinite',
        rise:         'rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in':    'fadeIn 0.3s cubic-bezier(0.32, 0.72, 0, 1) both',
      },
    },
  },
  plugins: [],
} satisfies Config

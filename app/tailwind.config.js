/**
 * Tailwind 3.4 (et non v4) : la v4 n'est pas compatible avec Sass.
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#07090f',
          900: '#0c1020',
          800: '#141a2e',
          700: '#1e2640',
          600: '#2c3656',
          400: '#8b95b5',
          200: '#d5dbee',
        },
        brand: { DEFAULT: '#6d5efc', soft: '#8b7fff', cyan: '#22d3ee' },
        ok: '#34d399',
        warn: '#fbbf24',
        bad: '#f87171',
      },
      fontFamily: {
        sans: ['"Segoe UI Variable"', '"Segoe UI"', 'Roboto', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // texte de base volontairement grand pour la lisibilité
        base: ['1.0625rem', { lineHeight: '1.6rem' }],
      },
      boxShadow: {
        glow: '0 10px 40px -10px rgba(109, 94, 252, .55)',
      },
      keyframes: {
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        pulse2: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.35' } },
      },
      animation: {
        'sheet-up': 'sheet-up .32s cubic-bezier(.2,.8,.2,1)',
        'fade-in': 'fade-in .2s ease-out',
        pulse2: 'pulse2 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

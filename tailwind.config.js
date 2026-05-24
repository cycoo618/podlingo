/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0d0f14',
        surface: '#161920',
        'surface-2': '#1a1f2e',
        border: '#1e2330',
        accent: '#6ee7b7',
        purple: '#818cf8',
        highlight: '#fbbf24',
        muted: '#4b5563',
      },
      fontFamily: {
        sans: ['DM Sans', 'Noto Sans SC', 'sans-serif'],
      },
      keyframes: {
        bubble: {
          '0%': { opacity: '0', transform: 'scale(0.92) translateY(4px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        bubble: 'bubble 0.12s ease-out forwards',
      },
    },
  },
  plugins: [],
}


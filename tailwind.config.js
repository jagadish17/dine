/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: { DEFAULT: '#FBF7F1', deep: '#F4EDE2' },
        ink: { DEFAULT: '#1F1B16', soft: '#5E554B', faint: '#8F857A' },
        line: '#E9DFD1',
        ember: { DEFAULT: '#C2541B', dark: '#A2420F', soft: '#F6E6D8', tint: '#FBF0E6' },
        leaf: '#2F6B4F',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(31,27,22,.04), 0 8px 24px -12px rgba(31,27,22,.12)',
        lift: '0 2px 4px rgba(31,27,22,.05), 0 18px 40px -18px rgba(31,27,22,.25)',
      },
      borderRadius: { '2xl': '1.1rem', '3xl': '1.6rem' },
    },
  },
  plugins: [],
};

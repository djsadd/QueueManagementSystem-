/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#121826',
        muted: '#667085',
        line: '#D8DEE8',
        brand: '#0F766E',
        signal: '#C2410C',
      },
      boxShadow: {
        panel: '0 20px 50px rgba(18, 24, 38, 0.10)',
      },
    },
  },
  plugins: [],
}

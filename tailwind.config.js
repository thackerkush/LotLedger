/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'financial-bg': '#070b13',
        'financial-card': '#0e1424',
        'financial-border': '#182030',
        'financial-text': '#f8fafc',
        'financial-muted': '#94a3b8',
        'financial-green': '#10b981',
        'financial-red': '#f43f5e',
      }
    },
  },
  plugins: [],
}

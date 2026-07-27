/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        base: { 900: '#0f172a', 950: '#020617' },
        healthy: '#10b981',
        suspected: '#fbbf24',
        remediating: '#f97316',
        escalated: '#f43f5e',
        verifying: '#8b5cf6',
        fallback: '#facc15',
      },
    },
  },
  plugins: [],
}

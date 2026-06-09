/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Accent — indigo default
        acc: {
          50:  "#eef1ff",
          100: "#e0e6ff",
          200: "#c4ceff",
          300: "#9aabff",
          400: "#6e7eff",
          500: "#4f55f5",
          600: "#3d3ee0",
          700: "#3331b8",
          800: "#2a2a90",
          900: "#20206b",
          950: "#131347",
        },
        // Neutral warm-gray
        ink: {
          0:   "#ffffff",
          50:  "#fafaf7",
          100: "#f4f3ee",
          150: "#ecebe4",
          200: "#e0ddd2",
          300: "#c8c4b6",
          400: "#9c988b",
          500: "#6f6c63",
          600: "#4a4844",
          700: "#2f2e2b",
          800: "#1d1c1a",
          900: "#111110",
          paper: "#faf8f3",
        },
        // Status
        good: { 50: "#eaf6ed", 500: "#2f9e54", 700: "#1d6e3b" },
        warn: { 50: "#fbf1d9", 500: "#d49b18", 700: "#8a610a" },
        bad:  { 50: "#fcebe9", 500: "#d6463a", 700: "#8d2820" },
      },
      fontFamily: {
        sans:    ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        display: ["Georgia", "serif"],
        mono:    ["ui-monospace", "monospace"],
      },
      borderRadius: {
        DEFAULT: "10px",
        lg: "16px",
      },
    },
  },
  plugins: [],
};

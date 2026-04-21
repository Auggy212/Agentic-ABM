/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#1E3A5F",
          accent: "#2E6BCC",
          light: "#D6E4F7"
        }
      }
    }
  },
  plugins: []
};


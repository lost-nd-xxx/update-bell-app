/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class", // HTMLクラスに基づいてダークモードを切り替える
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#faf5ff",
          100: "#f3e8ff",
          200: "#e9d5ff",
          300: "#d8b4fe",
          400: "#c084fc",
          500: "#a855f7",
          600: "#8b5cf6",
          700: "#7c3aed",
          800: "#6d28d9",
          900: "#5b21b6",
        },
      },
    },
  },
  plugins: [],
};

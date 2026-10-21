// tailwind.config.js
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#0B66FF",
          light: "#3C9FFE",
          dark: "#05326A",
        },
        accent: {
          DEFAULT: "#FF7A20",
          light: "#FFB27A",
          dark: "#A35400",
        },
        success: {
          DEFAULT: "#16A34A",
          light: "#4ADE80",
          dark: "#13803D",
        },
        danger: {
          DEFAULT: "#EF4444",
          light: "#F87171",
          dark: "#B91C1C",
        },
      },
    },
  },
  plugins: [],
};

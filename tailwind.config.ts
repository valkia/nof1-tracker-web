import tailwindTypography from "@tailwindcss/typography";
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      container: {
        center: true,
        screens: {
          xl: "1140px",
          "2xl": "1140px",
        },
        padding: {
          DEFAULT: "2rem",
          sm: "2.5rem",
          lg: "3rem",
        },
      },
    },
  },
  darkMode: "class",
  plugins: [tailwindTypography()],
};

export default config;

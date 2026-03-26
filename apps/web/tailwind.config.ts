import type { Config } from "tailwindcss";

const config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1rem"
      },
      colors: {
        brand: {
          50: "#f3f8ff",
          100: "#e7f0ff",
          500: "#2d6ce5",
          600: "#2457b8",
          900: "#152748"
        }
      },
      boxShadow: {
        lift: "0 20px 40px -28px rgb(15 23 42 / 0.35)"
      },
      backgroundImage: {
        "dashboard-wash":
          "radial-gradient(circle at 10% 10%, rgba(45,108,229,0.12), transparent 35%), radial-gradient(circle at 90% 80%, rgba(16,185,129,0.1), transparent 40%)"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
} satisfies Config;

export default config;

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ciclo: {
          50: "#f7f3f5",
          100: "#eee7ea",
          200: "#d9c8cf",
          300: "#c4aab5",
          400: "#ad8d9a",
          500: "#9D848E",
          600: "#7f6871",
          700: "#604f56",
          800: "#43373c",
          900: "#251f22",
          950: "#171215"
        }
      },
      boxShadow: {
        soft: "0 18px 45px rgba(65, 52, 58, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;

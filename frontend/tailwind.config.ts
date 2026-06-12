import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#0A0A0F",
          surface: "#111118",
          elevated: "#1A1A24",
        },
        border: {
          DEFAULT: "#2A2A38",
          hover: "#3A3A50",
        },
        primary: {
          DEFAULT: "#6366F1",
          hover: "#4F46E5",
          glow: "rgba(99,102,241,0.15)",
        },
        text: {
          primary: "#F4F4F6",
          secondary: "#9090A8",
          muted: "#5A5A70",
        },
        success: "#22C55E",
        warning: "#F59E0B",
        danger: "#EF4444",
        accent: "#A78BFA",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 20px rgba(99,102,241,0.15), 0 0 60px rgba(99,102,241,0.1)",
        "glow-sm": "0 0 12px rgba(99,102,241,0.1)",
      },
      borderRadius: {
        input: "8px",
        card: "8px",
        button: "6px",
        badge: "4px",
      },
      letterSpacing: {
        tight: "-0.02em",
        caps: "0.08em",
      },
    },
  },
  plugins: [],
};
export default config;

import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Design Bible V2 surfaces
        void: "var(--void)",
        stage: "var(--stage)",
        "stage-up": "var(--stage-up)",
        "stage-up2": "var(--stage-up2)",
        "stage-up3": "var(--stage-up3)",
        edge: "var(--edge)",

        // Text tokens
        text: "var(--text)",
        "text-soft": "var(--text-soft)",
        "text-mid": "var(--text-mid)",
        "text-dim": "var(--text-dim)",
        "text-ghost": "var(--text-ghost)",

        // Accents
        sun: "#ff9f1c",
        "sun-light": "#fff0d4",
        coral: "#ff6b6b",
        "coral-light": "#ffe0e0",
        aqua: "#4ecdc4",
        "aqua-light": "#d4f5f2",
        violet: "#7c5cfc",
        "violet-light": "#ede8ff",
        mint: "#34d399",
        sky: "#60a5fa",
        gold: "#d4af37",

        // Compat aliases
        ink: "var(--text)",
        "ink-secondary": "var(--text-soft)",
        "ink-muted": "var(--text-dim)",
        cream: "var(--void)",
        "cream-deep": "var(--stage-up)",
        glass: "var(--stage)",
        "glass-heavy": "var(--stage)",
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.5rem",
        "6xl": "3rem",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.04), 0 12px 40px rgba(0,0,0,0.06)",
        "card-hover": "0 2px 8px rgba(0,0,0,0.06), 0 20px 60px rgba(0,0,0,0.10)",
        glow: "0 0 60px rgba(255,159,28,0.15)",
        "glow-coral": "0 0 60px rgba(255,107,107,0.15)",
        "glow-violet": "0 0 60px rgba(124,92,252,0.15)",
        float: "0 24px 80px rgba(0,0,0,0.08)",
        "inner-ring": "inset 0 0 0 1px rgba(0,0,0,0.06)",
        panel: "var(--panel-shadow)",
      },
      fontSize: {
        /* -- Display (Inter Tight) -- */
        "display-xl": ["4.5rem", { lineHeight: "0.92", letterSpacing: "-0.035em", fontWeight: "700" }],
        "display-lg": ["3.25rem", { lineHeight: "0.94", letterSpacing: "-0.03em", fontWeight: "700" }],
        "display-md": ["2.25rem", { lineHeight: "0.96", letterSpacing: "-0.025em", fontWeight: "600" }],
        "display-sm": ["1.625rem", { lineHeight: "1.05", letterSpacing: "-0.02em", fontWeight: "600" }],
        /* -- Body (Inter) -- */
        "body-lg": ["1.0625rem", { lineHeight: "1.7", letterSpacing: "-0.006em", fontWeight: "400" }],
        body: ["0.875rem", { lineHeight: "1.65", letterSpacing: "-0.003em", fontWeight: "400" }],
        "body-sm": ["0.8125rem", { lineHeight: "1.55", letterSpacing: "0em", fontWeight: "400" }],
        /* -- Chat (Inter) -- */
        "chat-body": ["0.8125rem", { lineHeight: "1.65", letterSpacing: "-0.003em", fontWeight: "400" }],
        "chat-body-lg": ["0.875rem", { lineHeight: "1.7", letterSpacing: "-0.006em", fontWeight: "400" }],
        "chat-meta": ["0.6875rem", { lineHeight: "1.35", letterSpacing: "0.01em", fontWeight: "500" }],
        "chat-label": ["0.625rem", { lineHeight: "1.2", letterSpacing: "0.06em", fontWeight: "600" }],
        "chat-code": ["0.75rem", { lineHeight: "1.6", letterSpacing: "0em", fontWeight: "400" }],
        /* -- UI (Inter) -- */
        label: ["0.6875rem", { lineHeight: "1.2", letterSpacing: "0.06em", fontWeight: "600" }],
        caption: ["0.625rem", { lineHeight: "1.3", letterSpacing: "0.02em", fontWeight: "500" }],
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        code: ["var(--font-code)"],
      },
      animation: {
        "fade-in": "fade-in 0.5s ease-out forwards",
        "fade-up": "fade-up 0.6s ease-out forwards",
        "slide-in-right": "slide-in-right 0.4s ease-out forwards",
        "scale-in": "scale-in 0.3s ease-out forwards",
        "pulse-soft": "pulse-soft 3s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 2.5s ease-in-out infinite",
        orbit: "orbit 20s linear infinite",
        breathe: "breathe 4s ease-in-out infinite",
        "orb-breathe": "orb-breathe 4s ease-in-out infinite",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(24px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.94)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        orbit: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        breathe: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.04)" },
        },
        "orb-breathe": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.85" },
          "50%": { transform: "scale(1.08)", opacity: "1" },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [],
};

export default config;

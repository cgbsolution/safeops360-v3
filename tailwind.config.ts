import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          50: "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
          800: "#5b21b6",
          900: "#4c1d95",
          950: "#2e1065",
        },
        // Midnight Executive gold — the accent and the attention state. 500 is
        // the brand gold; 800 is the step that is legible as text (6.07:1).
        gold: {
          50: "#fff6e2",
          100: "#f6ecd7",
          200: "#eedab0",
          300: "#decaa0",
          400: "#d9b86e",
          500: "#c9a961",
          600: "#af8f46",
          700: "#96772c",
          800: "#7c5e07",
          900: "#624900",
        },
        // Midnight Executive ice — a surface, not a mark. 1.17:1 on white.
        ice: {
          DEFAULT: "#e8eef7",
          50: "#f7fafd",
          100: "#e8eef7",
          200: "#d5e0ee",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        success: {
          DEFAULT: "#10b981",
          foreground: "#ffffff",
          bg: "#d1fae5",
          dark: "#065f46",
        },
        warning: {
          DEFAULT: "#f59e0b",
          foreground: "#ffffff",
          bg: "#fef3c7",
          dark: "#92400e",
        },
        danger: {
          DEFAULT: "#ef4444",
          foreground: "#ffffff",
          bg: "#fee2e2",
          dark: "#991b1b",
        },
        info: {
          DEFAULT: "#3b82f6",
          foreground: "#ffffff",
          bg: "#dbeafe",
          dark: "#1e40af",
        },
        neutral: {
          DEFAULT: "#6b7280",
          foreground: "#ffffff",
          bg: "#f3f4f6",
          dark: "#1f2937",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      fontFamily: {
        // Georgia display / Calibri body, per Midnight Executive. Both are
        // installed fonts, so they cost no webfont request — this product ships
        // into plants with poor connectivity and is expected to survive an
        // airgap, which rules out a Google Fonts dependency for brand type.
        display: ['Georgia', '"Times New Roman"', '"Nimbus Roman"', 'serif'],
        body: ['Calibri', '"Carlito"', '"Segoe UI"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        "elev-0": "none",
        "elev-1": "0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.04)",
        "elev-2": "0 4px 6px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.04)",
        "elev-hover": "0 10px 15px rgba(0,0,0,0.04), 0 4px 6px rgba(0,0,0,0.05)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.5", transform: "scale(0.92)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "skeleton-shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
        "fade-in": "fade-in 200ms ease-out",
        "skeleton-shimmer": "skeleton-shimmer 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;

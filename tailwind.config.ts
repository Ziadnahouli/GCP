import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          hover: 'hsl(var(--primary-hover))',
          subtle: 'hsl(var(--primary-subtle))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        danger: 'hsl(var(--danger))',
        border: {
          DEFAULT: 'hsl(var(--border))',
          strong: 'hsl(var(--border-strong))',
        },
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        surface: {
          DEFAULT: 'hsl(var(--surface-default))',
          default: 'hsl(var(--surface-default))',
          hover: 'hsl(var(--surface-hover))',
          active: 'hsl(var(--surface-active))',
          header: 'hsl(var(--surface-header))',
          sidebar: 'hsl(var(--surface-sidebar))',
          rail: 'hsl(var(--surface-rail))',
          panel: 'hsl(var(--surface-panel))',
        },
        status: {
          online: 'hsl(var(--status-online))',
          idle: 'hsl(var(--status-idle))',
          dnd: 'hsl(var(--status-dnd))',
          offline: 'hsl(var(--status-offline))',
        },
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],      // 12px / 16px
        sm: ['0.8125rem', { lineHeight: '1.125rem' }], // 13px / 18px
        base: ['0.875rem', { lineHeight: '1.25rem' }],  // 14px / 20px (Clean Pro body)
        md: ['1rem', { lineHeight: '1.5rem' }],         // 16px / 24px
        lg: ['1.25rem', { lineHeight: '1.75rem' }],     // 20px / 28px
        xl: ['1.5rem', { lineHeight: '2rem' }],          // 24px / 32px
        '2xl': ['2rem', { lineHeight: '2.5rem' }],       // 32px / 40px
      },
      borderRadius: {
        control: '6px',
        card: '8px',
        dialog: '12px',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      zIndex: {
        base: '0',
        sticky: '10',
        dropdown: '20',
        sheet: '30',
        dialog: '40',
        toast: '50',
        'call-overlay': '60',
      },
      transitionDuration: {
        fast: '120ms',
        normal: '180ms',
        sheet: '240ms',
      },
      transitionTimingFunction: {
        pro: 'cubic-bezier(0.2, 0, 0, 1)',
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        popover: 'var(--elevation-shadow)',
        dialog: '0 16px 48px rgb(0 0 0 / 0.28)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'pulse-subtle': 'pulse-subtle 2s cubic-bezier(0.2, 0, 0, 1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;

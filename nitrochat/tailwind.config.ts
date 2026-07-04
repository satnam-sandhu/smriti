import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      /* -----------------------------------------
       * COLORS (unchanged, semantic additions)
       * ----------------------------------------- */
      colors: {
        primary: 'var(--color-primary)',
        primaryForeground: 'var(--color-primary-foreground)',

        secondary: 'var(--color-secondary)',
        accent: 'var(--color-accent)',

        background: 'var(--color-background)',
        foreground: 'var(--color-foreground)',

        card: 'var(--color-card)',
        sidebar: 'var(--color-sidebar)',
        border: 'var(--color-border)',

        muted: 'var(--color-muted)',
        mutedForeground: 'var(--color-muted-foreground)',

        error: 'var(--color-error)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',

        /* theme_version_2.advanced_customization tokens */
        headerBg: 'var(--color-header-bg)',
        headerText: 'var(--color-header-text)',
        headerSubtext: 'var(--color-header-subtext)',
        chatAreaBg: 'var(--color-chat-area-bg)',
        inputBg: 'var(--color-input-bg)',
        inputText: 'var(--color-input-text)',
        inputPlaceholder: 'var(--color-input-placeholder)',
        inputBorder: 'var(--color-input-border)',
        inputSendBg: 'var(--color-input-send-bg)',
        inputSendIcon: 'var(--color-input-send-icon)',
        aiBubbleBg: 'var(--color-ai-bubble-bg)',
        aiBubbleText: 'var(--color-ai-bubble-text)',
        userBubbleBg: 'var(--color-user-bubble-bg)',
        userBubbleText: 'var(--color-user-bubble-text)',
        alertBg: 'var(--color-alert-bg)',
        alertText: 'var(--color-alert-text)',
      },

      /* -----------------------------------------
       * TYPOGRAPHY (ChatGPT-locked)
       * ----------------------------------------- */
      fontSize: {
        base: ['15px', { lineHeight: '1.6' }],
      },

      /* -----------------------------------------
       * LAYOUT DISCIPLINE
       * ----------------------------------------- */
      maxWidth: {
        chat: '768px',
      },

      /* -----------------------------------------
       * RADIUS (keep yours, just standardize)
       * ----------------------------------------- */
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '12px',
      },

      /* -----------------------------------------
       * MOTION (bare minimum)
       * ----------------------------------------- */
      transitionDuration: {
        DEFAULT: '150ms',
      },
      /* -----------------------------------------
       * ANIMATIONS (for VoiceOrbOverlay)
       * ----------------------------------------- */
      keyframes: {
        'spin-slow': {
          'from': { transform: 'rotate(0deg)' },
          'to': { transform: 'rotate(360deg)' },
        },
        'pulse-fast': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.05)' },
        },
      },
      animation: {
        'spin-slow': 'spin-slow 3s linear infinite',
        'pulse-fast': 'pulse-fast 0.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config

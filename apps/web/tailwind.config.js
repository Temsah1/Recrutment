export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#F2F6FB',
          100: '#E2EAF4',
          200: '#C3D3E7',
          300: '#93AECD',
          400: '#5E82AE',
          500: '#395E8D',
          600: '#264873',
          700: '#1A365C',
          800: '#11294A',
          900: '#0B1F3A',
          950: '#061326',
        },
        ember: {
          50: '#FFF7EE',
          100: '#FEECD8',
          200: '#FCD5AE',
          300: '#F9B97D',
          400: '#F5A050',
          500: '#F28C28',
          600: '#D97018',
          700: '#B45513',
          800: '#8F4213',
          900: '#753715',
        },
        paper: '#FBFAF7',
        mist: '#F3F5F8',
        line: '#E5E8ED',
        ink: '#0D1726',
        muted: '#5A687B',
        success: {
          50: '#EEF8F1',
          100: '#D6EEDD',
          500: '#2E8B57',
          600: '#247247',
          700: '#1D5C39',
        },
        warning: {
          50: '#FFF8E8',
          100: '#FDEDC6',
          500: '#B7791F',
          600: '#975F14',
          700: '#7A4B10',
        },
        danger: {
          50: '#FDF1F0',
          100: '#FADEDC',
          500: '#C0392B',
          600: '#A52F23',
          700: '#86251B',
        },
        info: {
          50: '#EEF4FB',
          100: '#D9E7F6',
          500: '#2F6DA8',
          600: '#275A8C',
          700: '#1F4A74',
        },
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Fraunces Variable', 'Fraunces', 'Georgia', 'serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.08em' }],
        'hero': ['clamp(2.85rem, 6.4vw, 5.4rem)', { lineHeight: '0.96', letterSpacing: '-0.035em' }],
        'display': ['clamp(2rem, 3.6vw, 3.1rem)', { lineHeight: '1.02', letterSpacing: '-0.028em' }],
        'section': ['clamp(1.7rem, 2.6vw, 2.35rem)', { lineHeight: '1.08', letterSpacing: '-0.022em' }],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(13, 23, 38, 0.05), 0 10px 30px -18px rgba(13, 23, 38, 0.22)',
        lift: '0 2px 4px rgba(13, 23, 38, 0.05), 0 28px 60px -28px rgba(13, 23, 38, 0.4)',
        panel: '0 1px 0 rgba(13, 23, 38, 0.03), 0 16px 40px -24px rgba(13, 23, 38, 0.3)',
        insetLine: 'inset 0 0 0 1px rgba(255, 255, 255, 0.08)',
      },
      backgroundImage: {
        'grid-faint':
          'linear-gradient(to right, rgba(11,31,58,0.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(11,31,58,0.055) 1px, transparent 1px)',
        'navy-glow':
          'radial-gradient(120% 90% at 85% 0%, rgba(242,140,40,0.22) 0%, rgba(242,140,40,0) 55%), radial-gradient(90% 80% at 0% 100%, rgba(57,94,141,0.45) 0%, rgba(57,94,141,0) 60%)',
        'ember-wash':
          'radial-gradient(60% 60% at 70% 10%, rgba(242,140,40,0.14) 0%, rgba(242,140,40,0) 70%)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-soft': 'pulse-soft 2.6s ease-in-out infinite',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
        emphasized: 'cubic-bezier(0.22, 1, 0.36, 1)',
        editorial: 'cubic-bezier(0.76, 0, 0.24, 1)',
      },
    },
  },
  plugins: [],
};

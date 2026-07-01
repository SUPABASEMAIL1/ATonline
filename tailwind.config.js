/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        'primary-hover': 'var(--color-primary-hover)',
        app: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        danger: 'var(--color-danger)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
      },
      textColor: {
        default: 'var(--color-text)',
        muted: 'var(--color-text-muted)',
      },
      borderColor: {
        default: 'var(--color-border)',
      }
    },
  },
  plugins: [],
};

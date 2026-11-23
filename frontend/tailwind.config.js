/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"DM Serif Display"', 'Georgia', 'serif'],
        sans: ['"Inter"', '"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        bg: 'var(--bg)',
        s1: 'var(--s1)',
        s2: 'var(--s2)',
        trunk: 'var(--trunk)',
        branchOpen: 'var(--branch-open)',
        subEmerald: 'var(--sub-emerald)',
        subCyan: 'var(--sub-cyan)',
        change: 'var(--change)',
        hyp: 'var(--hyp)',
        ok: 'var(--ok)',
        amb: 'var(--amb)',
        evi: 'var(--evi)',
        t1: 'var(--t1)',
        t2: 'var(--t2)',
        t3: 'var(--t3)',
      },
    },
  },
  plugins: [],
};

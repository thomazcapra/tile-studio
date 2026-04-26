/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        panel: '#1e1e1e',
        panel2: '#252526',
        border: '#3c3c3c',
        ink: '#d4d4d4',
        accent: '#3794ff',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [
    // Pointer-capability media variants. Use `coarse:w-11` to bump a button to 44 px on
    // touch devices (iPad / phone), and `fine:` to target precision pointers (mouse).
    function ({ addVariant }) {
      addVariant('coarse', '@media (pointer: coarse)');
      addVariant('fine', '@media (pointer: fine)');
      addVariant('hover-none', '@media (hover: none)');
    },
  ],
};

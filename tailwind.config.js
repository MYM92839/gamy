/** @type {import('tailwindcss').Config} */
const defaultTheme = require('tailwindcss/defaultTheme');

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        pretendard: ['Pretendard Variable', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      const newUtilities = {
        '.h-dvh': {
          /* dvh를 지원하는 브라우저에서는 dvh를, 그렇지 않은 경우엔 100vh를 fallback으로 사용 */
          height: '100dvh',
          /* fallback */
          '@supports not (height: 100dvh)': {
            height: '100vh',
          },
        },
      };
      addUtilities(newUtilities);
    },
  ],
}

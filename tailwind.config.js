
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      screens: {
        'xs': '475px',
      },
      width: {
        'screen-115': '115vw',
      },
      height: {
        'screen-115': '115vh',
      }
    },
  },
  plugins: [],
}

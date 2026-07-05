/** Tailwind build config for the RepoLore production stylesheet.
 *  Build:  npx -y tailwindcss@3.4.17 -c design/tailwind.config.js -i design/tailwind.input.css -o design/styles.css --minify
 *  Scans the HTML and the COMPILED app.js (class names live there after JSX compile). */
module.exports = {
  content: ["./index.html", "./app.js"],
  theme: {
    extend: {
      colors: {
        base: "#0a0b0c",
        panel: "#0f1114",
        elevated: "#141619",
        ink: "#e6e8eb",
        muted: "#8b9099",
        faint: "#5b6069",
        accent: "#6d5efc",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      maxWidth: { content: "1100px" },
    },
  },
};

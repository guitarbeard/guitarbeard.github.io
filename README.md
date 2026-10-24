# alxdna.dev

Alex Medina's portfolio site, served by GitHub Pages at https://alxdna.dev.

## Structure

- `index.html`: the page markup, with no inline styles.
- `styles.css`: design tokens (light and dark themes) and component styles.
- `main.js`: theme toggle, mobile menu, Then/Now photo switch, and the WebGL background. A small inline script in `<head>` sets the theme before first paint so there's no flash.
- `alxdnai.js`: the alxdnAI chat widget. Its server lives in `alxdnai/`.

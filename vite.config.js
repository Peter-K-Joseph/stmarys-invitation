import { defineConfig } from 'vite';

// SITE_URL (e.g. https://user.github.io/stmarys-invitation/) is injected by the
// GitHub Pages workflow so link previews (WhatsApp, Facebook) get absolute URLs.
const site = (process.env.SITE_URL || '').replace(/\/?$/, '/');

export default defineConfig({
  base: './',
  build: { target: 'es2019', assetsInlineLimit: 0, chunkSizeWarningLimit: 900 },
  plugins: [
    {
      name: 'site-url',
      transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', site === '/' ? './' : site),
    },
  ],
});

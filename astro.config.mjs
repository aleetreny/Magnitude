// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import mdx from '@astrojs/mdx';

// Deployed to GitHub Pages at https://aleetreny.github.io/Magnitude
// If you later point a custom domain at the site, set `site` to it and `base` to '/'.
export default defineConfig({
  site: 'https://aleetreny.github.io',
  base: '/Magnitude',
  trailingSlash: 'ignore',
  integrations: [mdx()],
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  // Self-hosted at build time: no request to Google on page load, no FOUT on
  // the mono metadata. Helvetica Neue is a system face and needs no download.
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'IBM Plex Mono',
      cssVariable: '--font-mono',
      weights: [400, 500],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
    },
  ],
});

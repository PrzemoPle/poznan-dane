import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://poznan-dane.pages.dev',
  build: { format: 'directory' },
  compressHTML: true,
  integrations: [
    sitemap({
      // 404 nie jest treścią do indeksowania
      filter: (url) => !url.includes('/404'),
      i18n: undefined,
      changefreq: 'weekly',
    }),
  ],
});

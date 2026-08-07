import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://poznan-dane.pl',
  build: { format: 'directory' },
  compressHTML: true,
});

// @ts-check
import { defineConfig } from 'astro/config';

// כתובת האתר ונתיב הבסיס נקבעים אוטומטית ב-GitHub Actions
// (SITE_URL ו-BASE_PATH). בפיתוח מקומי האתר רץ בשורש.
const site = process.env.SITE_URL || 'http://localhost:4321';
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  build: { format: 'directory' },
  image: {
    // איכות גבוהה לתמונות מהשטח
    service: { entrypoint: 'astro/assets/services/sharp', config: { limitInputPixels: false } },
  },
});

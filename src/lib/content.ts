/**
 * טעינת קבצי התוכן (content/*.yaml), אימות המבנה שלהם,
 * וסינון הפריטים לפי מצב האתר (draft / final).
 *
 * העורכים לא צריכים לגעת בקובץ הזה.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'astro/zod';
import type { ImageMetadata } from 'astro';

const CONTENT_DIR = path.resolve(process.cwd(), 'content');

function load<T>(file: string, schema: z.ZodType<T>): T {
  const full = path.join(CONTENT_DIR, file);
  let raw: unknown;
  try {
    raw = parse(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    throw new Error(
      `\n\n❌ שגיאה בקריאת הקובץ content/${file}\n` +
        `ייתכן שיש בעיית הזחה (רווחים) או מירכאות שלא נסגרו.\n` +
        `פרטים: ${(err as Error).message}\n`,
    );
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • שדה "${i.path.join(' → ')}": ${i.message}`)
      .join('\n');
    throw new Error(`\n\n❌ יש בעיה בתוכן הקובץ content/${file}:\n${issues}\n`);
  }
  return result.data;
}

const str = z.string().nullish().transform((v) => (v ?? '').trim());
const status = z.enum(['draft', 'published']).default('draft');

/* ---------- סכמות ---------- */

const siteSchema = z.object({
  mode: z.enum(['draft', 'final']).default('draft'),
  heroImage: str,
  heroImageAlt: str,
  closingImage: str,
  closingImageAlt: str,
  ogImage: str,
  allowSearchEngines: z.boolean().default(false),
  hero: z.object({ brand: z.string(), eyebrow: z.string(), title: z.string(), subtitle: z.string() }),
  about: z.object({ title: z.string(), text: z.string() }),
  numbers: z.object({ title: z.string() }),
  gallery: z.object({ title: z.string(), subtitle: str }),
  testimonials: z.object({ title: z.string(), visibleCount: z.number().int().min(1).default(3) }),
  media: z.object({ title: z.string(), subtitle: str }),
  forward: z.object({ title: z.string(), text: z.string() }),
  footer: z.object({ partnershipNote: str }),
});

const statsSchema = z.object({
  updatedAt: z.union([z.string(), z.date()]).transform((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)),
  final: z.boolean().default(false),
  items: z
    .array(
      z.object({
        prefix: str,
        value: z.number({ message: 'value חייב להיות מספר בלי פסיקים, למשל 15000' }),
        suffix: str,
        label: z.string(),
        detail: str,
        verified: z.boolean().default(false),
        note: str,
      }),
    )
    .default([]),
});

const gallerySchema = z.object({
  items: z
    .array(
      z.object({
        file: str,
        alt: str,
        caption: str,
        approved: z.boolean().default(false),
        status,
      }),
    )
    .nullish()
    .transform((v) => v ?? []),
});

const testimonialsSchema = z.object({
  items: z
    .array(
      z.object({
        text: z.string(),
        name: str,
        role: str,
        showName: z.boolean().default(false),
        approved: z.boolean().default(false),
        featured: z.boolean().default(false),
        status,
      }),
    )
    .nullish()
    .transform((v) => v ?? []),
});

const mediaSchema = z.object({
  items: z
    .array(
      z.object({
        type: z.enum(['youtube', 'instagram', 'facebook', 'article']),
        url: str,
        title: z.string(),
        outlet: str,
        date: z.union([z.string(), z.date()]).nullish().transform((v) =>
          v instanceof Date ? v.toISOString().slice(0, 10) : (v ?? '').trim(),
        ),
        status,
      }),
    )
    .nullish()
    .transform((v) => v ?? []),
});

const donorSchema = z.object({
  name: z.string(),
  greeting: z.string(),
  thanksTitle: z.string(),
  thanksText: z.array(z.string()).min(1),
});

/* ---------- תמונות ---------- */

const photoModules = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/photos/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG,WEBP}',
  { eager: true },
);
const logoModules = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/logos/*.{svg,png,jpg,jpeg,webp,SVG,PNG}',
  { eager: true },
);

export function getPhoto(file: string): ImageMetadata | undefined {
  if (!file) return undefined;
  const key = `/src/assets/photos/${file}`;
  const mod = photoModules[key];
  if (!mod) {
    throw new Error(
      `\n\n❌ התמונה "${file}" לא נמצאה בתיקייה src/assets/photos.\n` +
        `בדקו שהקובץ הועלה ושהשם (כולל אותיות גדולות/קטנות והסיומת) זהה בדיוק.\n`,
    );
  }
  return mod.default;
}

/** לוגו לפי שם בסיס: iron-pair או nifgashim (כל סיומת) */
export function getLogo(base: 'iron-pair' | 'nifgashim'): ImageMetadata | undefined {
  const hit = Object.entries(logoModules).find(([k]) =>
    k.toLowerCase().startsWith(`/src/assets/logos/${base}.`),
  );
  return hit?.[1].default;
}

/* ---------- ייצוא התוכן המסונן ---------- */

export type Donor = z.infer<typeof donorSchema> & { slug: string };

export function getDonors(): Donor[] {
  const dir = path.join(CONTENT_DIR, 'donors');
  return fs
    .readdirSync(dir)
    .filter((f) => /\.ya?ml$/i.test(f) && !f.startsWith('_'))
    .map((f) => ({ slug: f.replace(/\.ya?ml$/i, ''), ...load(`donors/${f}`, donorSchema) }));
}

export function getContent() {
  const site = load('site.yaml', siteSchema);
  const stats = load('stats.yaml', statsSchema);
  const gallery = load('gallery.yaml', gallerySchema);
  const testimonials = load('testimonials.yaml', testimonialsSchema);
  const media = load('media.yaml', mediaSchema);

  const draft = site.mode === 'draft';

  // תמונות: מוצגות רק אם יש קובץ, אושרו וסומנו published
  const photos = gallery.items
    .filter((p) => p.file && p.approved && p.status === 'published')
    .map((p) => ({ ...p, image: getPhoto(p.file)! }));
  const photoPlaceholders = draft ? gallery.items.filter((p) => !(p.file && p.approved && p.status === 'published')).length : 0;

  const quotes = testimonials.items.filter((t) => t.approved && t.status === 'published');
  quotes.sort((a, b) => Number(b.featured) - Number(a.featured));
  const quotePlaceholders = draft ? testimonials.items.filter((t) => !(t.approved && t.status === 'published')) : [];

  const mediaItems = media.items.filter((m) => m.url && m.status === 'published');
  const mediaPlaceholders = draft ? media.items.filter((m) => !(m.url && m.status === 'published')) : [];

  const statItems = stats.items.filter((s) => s.verified || draft);

  const heroImage = getPhoto(site.heroImage);
  const closingImage = getPhoto(site.closingImage);

  return {
    site,
    draft,
    heroImage,
    closingImage,
    stats: { ...stats, items: statItems },
    photos,
    photoPlaceholders,
    quotes,
    quotePlaceholders,
    mediaItems,
    mediaPlaceholders,
    logos: { ironPair: getLogo('iron-pair'), nifgashim: getLogo('nifgashim') },
  };
}

/** מזהה סרטון מתוך כל צורת קישור ליוטיוב */
export function youtubeId(url: string): string | null {
  const m =
    url.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/) ??
    url.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : null;
}

export function formatHebrewDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

/** נתיב יחסי לבסיס האתר (עובד גם תחת /iron-pair-impact/) */
export function withBase(p: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${p.replace(/^\//, '')}`;
}

/** פורמטי תמונה: באירוח כ-Artifact מסתפקים ב-WebP כדי לשמור על משקל נמוך */
export const imgFormats: ('avif' | 'webp')[] = process.env.TARGET === 'artifact' ? ['webp'] : ['avif', 'webp'];

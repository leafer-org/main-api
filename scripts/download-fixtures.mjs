/**
 * One-time script to download themed stock photos from Unsplash for seed data.
 * Run: node scripts/download-fixtures.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');

// Unsplash photo IDs mapped to our seed entities
const PHOTOS = {
  // Categories (square icons, 400x400)
  'categories/education.jpg': { id: 'photo-1503676260728-1c00da094a0b', w: 400, h: 400 },
  'categories/sport.jpg':     { id: 'photo-1517649763962-0c623066013b', w: 400, h: 400 },
  'categories/creativity.jpg':{ id: 'photo-1513364776144-60967b0f800f', w: 400, h: 400 },
  'categories/entertainment.jpg': { id: 'photo-1514525253161-7a46d19cd819', w: 400, h: 400 },

  // Organization avatars (square, 400x400)
  'orgs/yoga-studio.jpg':  { id: 'photo-1545205597-3d9d02c29597', w: 400, h: 400 },
  'orgs/dance-school.jpg': { id: 'photo-1504609813442-a8924e83f76e', w: 400, h: 400 },
  'orgs/coffee-shop.jpg':  { id: 'photo-1501339847302-ac426a4a7cbb', w: 400, h: 400 },

  // Item cover images (landscape, 800x600)
  'items/personal-yoga.jpg':   { id: 'photo-1544367567-0f2fcb009e0b', w: 800, h: 600 },
  'items/group-hatha.jpg':     { id: 'photo-1588286840104-8957b019727f', w: 800, h: 600 },
  'items/salsa-class.jpg':     { id: 'photo-1524594152303-9fd13543fe6e', w: 800, h: 600 },
  'items/kids-dance.jpg':      { id: 'photo-1535525153412-5a42439a210d', w: 800, h: 600 },
  'items/dance-evening.jpg':   { id: 'photo-1504609773096-104ff2c73ba4', w: 800, h: 600 },
  'items/latte-art.jpg':       { id: 'photo-1534778101976-62847782c213', w: 800, h: 600 },
  'items/coffee-tasting.jpg':  { id: 'photo-1495474472287-4d71bcdd2085', w: 800, h: 600 },
  'items/poetry-evening.jpg':  { id: 'photo-1456513080510-7bf3a84b82f8', w: 800, h: 600 },

  // Team member portraits (square, 300x300)
  'team/olga.jpg':   { id: 'photo-1438761681033-6461ffad8d80', w: 300, h: 300 },
  'team/anna.jpg':   { id: 'photo-1494790108377-be9c29b29330', w: 300, h: 300 },
  'team/igor.jpg':   { id: 'photo-1507003211169-0a1dd7228f2d', w: 300, h: 300 },
  'team/viktor.jpg': { id: 'photo-1472099645785-5658abf4ff4e', w: 300, h: 300 },
};

async function download(url, maxRedirects = 5) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  for (const [path, { id, w, h }] of Object.entries(PHOTOS)) {
    const outPath = join(FIXTURES, path);
    if (existsSync(outPath)) {
      console.log(`  ✓ ${path} (exists)`);
      continue;
    }

    const dir = dirname(outPath);
    await mkdir(dir, { recursive: true });

    const url = `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&q=80&auto=format`;
    console.log(`  ↓ ${path}...`);

    try {
      const buf = await download(url);
      await writeFile(outPath, buf);
      console.log(`  ✓ ${path} (${(buf.length / 1024).toFixed(0)} KB)`);
    } catch (err) {
      console.error(`  ✗ ${path}: ${err.message}`);
    }
  }

  console.log('\nDone! Add fixtures/ to git.');
}

main();

import { access, cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { GAMES } from './catalog.js';

const rootFiles = ['index.html', 'styles.css', 'portal.js', 'catalog.js'];
const assetFiles = [
  'player.png', 'trail.png', 'ground.png', 'obstacle-ruido.png',
  'obstacle-distraccion.png', 'obstacle-miedo.png', 'semilla.png'
];
const gameFiles = ['index.html', 'styles.css', 'game.js'];

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}
async function required(path) {
  if (!(await exists(path))) throw new Error(`Missing required file: ${path}`);
}

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

for (const file of rootFiles) {
  await required(file);
  await cp(file, join('dist', file));
}

await required('public/assets');
await cp('public', 'dist/public', { recursive: true });

const gameIds = GAMES.map(game => game.id);
if (new Set(gameIds).size !== gameIds.length) throw new Error('Catalog contains duplicate game ids');

for (const game of GAMES) {
  for (const file of gameFiles) await required(join('games', game.id, file));
}
await cp('games', 'dist/games', { recursive: true });

for (const file of rootFiles) await required(join('dist', file));
for (const file of assetFiles) await required(join('dist', 'public', 'assets', file));
for (const game of GAMES) {
  for (const file of gameFiles) await required(join('dist', 'games', game.id, file));
}

console.log('Minijuegos SØD PRIME build complete');
console.log(`Verified ${GAMES.length} playable games and ${assetFiles.length} shared assets`);
console.log('Output: dist/');

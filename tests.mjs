import { access, readFile } from 'node:fs/promises';
import { GAMES } from './catalog.js';

const requiredRoot = ['index.html', 'styles.css', 'portal.js', 'catalog.js', 'build.mjs', 'vercel.json'];
for (const file of requiredRoot) await access(file);

const ids = GAMES.map(game => game.id);
if (ids.length < 2) throw new Error('Portal should expose at least the existing Runner and Maze games');
if (new Set(ids).size !== ids.length) throw new Error('Game ids must be unique');

for (const game of GAMES) {
  for (const file of ['index.html', 'styles.css', 'game.js']) await access(`games/${game.id}/${file}`);
  if (!game.path.includes(`/games/${game.id}/`)) throw new Error(`${game.id}: catalog path does not match directory`);
}

const assets = ['player.png','trail.png','ground.png','obstacle-ruido.png','obstacle-distraccion.png','obstacle-miedo.png','semilla.png'];
for (const asset of assets) await access(`public/assets/${asset}`);

const portal = await readFile('portal.js', 'utf8');
if (!portal.includes("type !== 'sod-game-event'")) throw new Error('Portal event bridge missing');
if (!portal.includes('localStorage')) throw new Error('Local record integration missing');

const runner = await readFile('games/runner/game.js', 'utf8');
if (runner.includes('player.jumps >= 2')) throw new Error('Runner regressed to capped jumping');
if (!runner.includes("game: 'runner'")) throw new Error('Runner portal bridge missing');
if (!runner.includes("get('embed') === '1'")) throw new Error('Runner embed mode missing');

const maze = await readFile('games/maze/game.js', 'utf8');
if (!maze.includes("game: 'maze'")) throw new Error('Maze portal bridge missing');
if (!maze.includes("get('embed') === '1'")) throw new Error('Maze embed mode missing');
if (!maze.includes("sod-maze-record-v1")) throw new Error('Maze local record missing');

const index = await readFile('index.html', 'utf8');
for (const id of ['gameGrid','gameShell','gameFrame','playFeatured']) {
  if (!index.includes(`id="${id}"`)) throw new Error(`Portal UI node missing: ${id}`);
}

console.log('SØD PRIME portal tests passed');
console.log(`Catalog verified: ${ids.join(', ')}`);

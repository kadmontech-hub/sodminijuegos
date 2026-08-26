const IS_EMBEDDED = new URLSearchParams(location.search).get('embed') === '1';
document.documentElement.classList.toggle('is-embedded', IS_EMBEDDED);

function notifyPortal(event, payload = {}) {
  if (window.parent === window) return;
  try { window.parent.postMessage({ type: 'sod-game-event', game: 'maze', event, ...payload }, '*'); } catch {}
}

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const stage = document.getElementById('stage');

const ui = {
  score: document.getElementById('score'),
  record: document.getElementById('record'),
  level: document.getElementById('level'),
  lives: document.getElementById('lives'),
  startOverlay: document.getElementById('startOverlay'),
  pauseOverlay: document.getElementById('pauseOverlay'),
  gameOverOverlay: document.getElementById('gameOverOverlay'),
  startButton: document.getElementById('startButton'),
  restartButton: document.getElementById('restartButton'),
  finalScore: document.getElementById('finalScore'),
  newRecord: document.getElementById('newRecord'),
  levelBanner: document.getElementById('levelBanner'),
  toastLayer: document.getElementById('toastLayer'),
  muteButton: document.getElementById('muteButton')
};

const ASSET_PATHS = {
  player: '/public/assets/player.png',
  trail: '/public/assets/trail.png',
  ground: '/public/assets/ground.png',
  ruido: '/public/assets/obstacle-ruido.png',
  distraccion: '/public/assets/obstacle-distraccion.png',
  miedo: '/public/assets/obstacle-miedo.png',
  semilla: '/public/assets/semilla.png'
};

const CONFIG = {
  cols: 23,
  rows: 23,
  playerSpeed: 6.3,
  enemySpeed: 4.55,
  frightenedEnemySpeed: 3.55,
  levelSpeedGain: 0.22,
  powerDuration: 7.0,
  playerRadius: 0.36,
  enemyRadius: 0.34,
  collisionDistance: 0.58,
  particleCap: 240,
  maxDpr: 2,
  tunnelRow: 11,
  deathFreeze: 0.11,
  lifeResetDelay: 0.82,
  levelDelay: 0.72,
  firstInputGuardMs: 120
};

const MAP_TEMPLATE = [
  '#######################',
  '#o........###........o#',
  '#.###.####.#.####.###.#',
  '#.....................#',
  '#.###.#.#######.#.###.#',
  '#.....#....#....#.....#',
  '#####.####.#.####.#####',
  '#.....#.........#.....#',
  '#.###.#.###.###.#.###.#',
  '#.....#..1...2..#.....#',
  '###.#.#####.#####.#.###',
  '....#.......3.....#....',
  '###.#.###.#####.#.#.###',
  '#.....#....#....#.....#',
  '#.###.#.#######.#.###.#',
  '#o..#......P......#..o#',
  '###.#.#.#######.#.#.###',
  '#.....#....#....#.....#',
  '#.########.#.########.#',
  '#.....................#',
  '#.###.####.#.####.###.#',
  '#o...................o#',
  '#######################'
];

const DIRS = {
  left:  { x: -1, y: 0, angle: Math.PI },
  right: { x: 1, y: 0, angle: 0 },
  up:    { x: 0, y: -1, angle: -Math.PI / 2 },
  down:  { x: 0, y: 1, angle: Math.PI / 2 },
  none:  { x: 0, y: 0, angle: 0 }
};

const ENEMY_DEFS = [
  { id: 'ruido', asset: 'ruido', marker: '1', tint: '#ff365a', home: { x: 9, y: 9 }, style: 'chase', scale: 1.0 },
  { id: 'distraccion', asset: 'distraccion', marker: '2', tint: '#ff4dda', home: { x: 13, y: 9 }, style: 'ambush', scale: 1.13 },
  { id: 'miedo', asset: 'miedo', marker: '3', tint: '#ff784d', home: { x: 12, y: 11 }, style: 'scatter', scale: 0.98 }
];

let width = 1280;
let height = 720;
let dpr = 1;
let tile = 28;
let boardX = 0;
let boardY = 0;
let boardW = 0;
let boardH = 0;
let gameState = 'loading'; // loading, ready, running, paused, dying, levelclear, gameover
let lastTime = performance.now();
let elapsed = 0;
let freezeTimer = 0;
let stateTimer = 0;
let level = 1;
let score = 0;
let lives = 3;
let powerTimer = 0;
let powerCombo = 0;
let pelletsLeft = 0;
let board = [];
let pellets = new Set();
let powerSeeds = new Set();
let particles = [];
let speedLines = [];
let record = Number(localStorage.getItem('sod-maze-record-v1') || 0);
let muted = localStorage.getItem('sod-maze-muted-v1') === '1';
let audioCtx = null;
let lastIntentAt = 0;
let swipeStart = null;
let cachedBackground = null;
let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const assets = {};
const player = {
  x: 11,
  y: 15,
  dir: 'left',
  desiredDir: 'left',
  speed: CONFIG.playerSpeed,
  spawn: { x: 11, y: 15 },
  angle: Math.PI,
  pulse: 0,
  alive: true
};
let enemies = [];

function keyOf(x, y) { return `${x},${y}`; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function pad(v, n = 6) { return Math.max(0, Math.floor(v)).toString().padStart(n, '0'); }
function atCenter(actor, eps = 0.035) {
  return Math.abs(actor.x - Math.round(actor.x)) < eps && Math.abs(actor.y - Math.round(actor.y)) < eps;
}
function opposite(dir) {
  return ({ left: 'right', right: 'left', up: 'down', down: 'up' })[dir] || 'none';
}
function normalizeTunnelX(x, y) {
  if (y !== CONFIG.tunnelRow) return x;
  if (x < 0) return CONFIG.cols - 1;
  if (x >= CONFIG.cols) return 0;
  return x;
}
function isWall(x, y) {
  if (y < 0 || y >= CONFIG.rows) return true;
  x = normalizeTunnelX(x, y);
  if (x < 0 || x >= CONFIG.cols) return true;
  return board[y]?.[x] === '#';
}
function canMoveFrom(x, y, dir) {
  const d = DIRS[dir];
  if (!d || dir === 'none') return false;
  return !isWall(x + d.x, y + d.y);
}
function passableNeighbors(x, y) {
  return ['left', 'right', 'up', 'down'].filter(dir => canMoveFrom(x, y, dir));
}

function initBoard() {
  board = MAP_TEMPLATE.map(row => row.split(''));
  pellets = new Set();
  powerSeeds = new Set();
  let foundPlayer = false;
  const enemyMarkers = new Map();

  for (let y = 0; y < CONFIG.rows; y++) {
    for (let x = 0; x < CONFIG.cols; x++) {
      const c = board[y][x];
      if (c === '.') pellets.add(keyOf(x, y));
      if (c === 'o') powerSeeds.add(keyOf(x, y));
      if (c === 'P') {
        player.spawn = { x, y };
        foundPlayer = true;
        board[y][x] = ' ';
      }
      if (['1', '2', '3'].includes(c)) {
        enemyMarkers.set(c, { x, y });
        board[y][x] = ' ';
      }
    }
  }

  if (!foundPlayer) throw new Error('Player spawn missing from maze');
  pelletsLeft = pellets.size + powerSeeds.size;
  enemies = ENEMY_DEFS.map(def => {
    const home = enemyMarkers.get(def.marker) || def.home;
    return {
      ...def,
      x: home.x,
      y: home.y,
      spawn: { ...home },
      dir: def.id === 'ruido' ? 'left' : def.id === 'distraccion' ? 'right' : 'up',
      speed: CONFIG.enemySpeed,
      active: true,
      respawnTimer: 0,
      phase: Math.random() * Math.PI * 2
    };
  });
}

function resetActors() {
  player.x = player.spawn.x;
  player.y = player.spawn.y;
  player.dir = 'left';
  player.desiredDir = 'left';
  player.angle = Math.PI;
  player.pulse = 0;
  player.alive = true;
  enemies.forEach((enemy, i) => {
    enemy.x = enemy.spawn.x;
    enemy.y = enemy.spawn.y;
    enemy.dir = i === 0 ? 'left' : i === 1 ? 'right' : 'up';
    enemy.active = true;
    enemy.respawnTimer = 0;
  });
  powerTimer = 0;
  powerCombo = 0;
}

function newGame() {
  level = 1;
  score = 0;
  lives = 3;
  initBoard();
  resetActors();
  gameState = 'running';
  elapsed = 0;
  stateTimer = 0;
  hideOverlays();
  showBanner('NIVEL 01');
  updateHud(true);
  unlockAudio();
  sfx('start');
  notifyPortal('game-start');
}

function nextLevel() {
  level += 1;
  initBoard();
  resetActors();
  gameState = 'levelclear';
  stateTimer = CONFIG.levelDelay;
  showBanner(`NIVEL ${String(level).padStart(2, '0')}`);
  burstWorld(player.x, player.y, '#29e9ff', 36, 2.7);
  sfx('level');
  updateHud(true);
  notifyPortal('level-complete', { level, score });
}

function loseLife() {
  if (gameState !== 'running') return;
  gameState = 'dying';
  freezeTimer = CONFIG.deathFreeze;
  stateTimer = CONFIG.lifeResetDelay;
  lives -= 1;
  player.alive = false;
  burstWorld(player.x, player.y, '#ff365a', 44, 3.2);
  sfx('death');
  vibrate(35);
  updateHud(true);
}

function finishGame() {
  gameState = 'gameover';
  const isRecord = score > record;
  if (isRecord) {
    record = score;
    localStorage.setItem('sod-maze-record-v1', String(record));
    sfx('record');
    notifyPortal('record', { score });
  }
  ui.finalScore.textContent = score.toLocaleString('es-AR');
  ui.newRecord.classList.toggle('visible', isRecord);
  ui.gameOverOverlay.classList.add('visible');
  updateHud(true);
  notifyPortal('game-over', { score, record, level });
}

function hideOverlays() {
  ui.startOverlay.classList.remove('visible');
  ui.pauseOverlay.classList.remove('visible');
  ui.gameOverOverlay.classList.remove('visible');
}

function togglePause() {
  if (gameState === 'running') {
    gameState = 'paused';
    ui.pauseOverlay.classList.add('visible');
  } else if (gameState === 'paused') {
    gameState = 'running';
    ui.pauseOverlay.classList.remove('visible');
    lastTime = performance.now();
  }
}

function setDirection(dir) {
  if (!DIRS[dir] || dir === 'none') return;
  player.desiredDir = dir;
  lastIntentAt = performance.now();
  if (gameState === 'paused') togglePause();
  unlockAudio();
}

function moveActor(actor, dt, isPlayer = false) {
  let remaining = actor.speed * dt;
  let loops = 0;
  while (remaining > 0.0001 && loops++ < 8) {
    const cx = Math.round(actor.x);
    const cy = Math.round(actor.y);

    if (atCenter(actor, 0.04)) {
      actor.x = cx;
      actor.y = cy;
      if (isPlayer) {
        if (canMoveFrom(cx, cy, actor.desiredDir)) actor.dir = actor.desiredDir;
      } else {
        actor.dir = chooseEnemyDirection(actor, cx, cy);
      }
      if (!canMoveFrom(cx, cy, actor.dir)) return;
    }

    const d = DIRS[actor.dir];
    if (!d || actor.dir === 'none') return;

    let targetX = actor.x;
    let targetY = actor.y;
    if (d.x > 0) targetX = Math.floor(actor.x + 1e-5) + 1;
    if (d.x < 0) targetX = Math.ceil(actor.x - 1e-5) - 1;
    if (d.y > 0) targetY = Math.floor(actor.y + 1e-5) + 1;
    if (d.y < 0) targetY = Math.ceil(actor.y - 1e-5) - 1;

    const distance = d.x !== 0 ? Math.abs(targetX - actor.x) : Math.abs(targetY - actor.y);
    const step = Math.min(remaining, Math.max(distance, 0.0001));
    actor.x += d.x * step;
    actor.y += d.y * step;
    remaining -= step;

    if (distance <= step + 1e-5) {
      actor.x = targetX;
      actor.y = targetY;
      if (actor.y === CONFIG.tunnelRow) {
        if (actor.x < 0) actor.x = CONFIG.cols - 1;
        if (actor.x >= CONFIG.cols) actor.x = 0;
      }
    }
  }
}

function chooseEnemyDirection(enemy, x, y) {
  let options = passableNeighbors(x, y);
  if (!options.length) return opposite(enemy.dir);
  const reverse = opposite(enemy.dir);
  const nonReverse = options.filter(d => d !== reverse);
  if (nonReverse.length) options = nonReverse;

  const target = enemyTarget(enemy);
  const frightened = powerTimer > 0;
  const scored = options.map(dir => {
    const d = DIRS[dir];
    let nx = normalizeTunnelX(x + d.x, y + d.y);
    const ny = y + d.y;
    const dx = nx - target.x;
    const dy = ny - target.y;
    let dist = dx * dx + dy * dy;
    if (enemy.id === 'miedo' && !frightened && Math.random() < 0.24) dist += Math.random() * 100;
    return { dir, dist };
  });

  scored.sort((a, b) => frightened ? b.dist - a.dist : a.dist - b.dist);
  return scored[0]?.dir || options[0];
}

function enemyTarget(enemy) {
  if (powerTimer > 0) return { x: player.x, y: player.y };
  if (enemy.style === 'chase') return { x: player.x, y: player.y };
  if (enemy.style === 'ambush') {
    const d = DIRS[player.dir] || DIRS.left;
    return { x: player.x + d.x * 4, y: player.y + d.y * 4 };
  }
  const cycle = Math.floor(elapsed / 6) % 4;
  const corners = [
    { x: 1, y: 1 },
    { x: CONFIG.cols - 2, y: 1 },
    { x: CONFIG.cols - 2, y: CONFIG.rows - 2 },
    { x: 1, y: CONFIG.rows - 2 }
  ];
  return cycle % 2 === 0 ? corners[2] : { x: player.x, y: player.y };
}

function collectAtPlayer() {
  const x = Math.round(player.x);
  const y = Math.round(player.y);
  if (!atCenter(player, 0.16)) return;
  const k = keyOf(x, y);
  if (pellets.delete(k)) {
    score += 10;
    pelletsLeft--;
    tinyBurst(x, y, '#29e9ff');
    sfx('pellet');
  }
  if (powerSeeds.delete(k)) {
    score += 100;
    pelletsLeft--;
    powerTimer = CONFIG.powerDuration;
    powerCombo = 0;
    burstWorld(x, y, '#f5c75a', 26, 2.1);
    toastAtWorld(x, y, 'CLARIDAD +100', true);
    sfx('power');
    vibrate(12);
  }
  if (pelletsLeft <= 0 && gameState === 'running') nextLevel();
}

function checkEnemyCollisions() {
  if (gameState !== 'running') return;
  for (const enemy of enemies) {
    if (!enemy.active) continue;
    let dx = Math.abs(enemy.x - player.x);
    if (Math.round(player.y) === CONFIG.tunnelRow) dx = Math.min(dx, CONFIG.cols - dx);
    const dy = enemy.y - player.y;
    if (Math.hypot(dx, dy) < CONFIG.collisionDistance) {
      if (powerTimer > 0) {
        powerCombo += 1;
        const bonus = 200 * (2 ** (powerCombo - 1));
        score += bonus;
        enemy.active = false;
        enemy.respawnTimer = 1.8;
        burstWorld(enemy.x, enemy.y, '#8af4ff', 24, 2.5);
        toastAtWorld(enemy.x, enemy.y, `PURIFICADO +${bonus}`);
        sfx('purify');
        vibrate(9);
      } else {
        loseLife();
        return;
      }
    }
  }
}

function updateEnemies(dt) {
  const speedBoost = (level - 1) * CONFIG.levelSpeedGain;
  for (const enemy of enemies) {
    if (!enemy.active) {
      enemy.respawnTimer -= dt;
      if (enemy.respawnTimer <= 0) {
        enemy.active = true;
        enemy.x = enemy.spawn.x;
        enemy.y = enemy.spawn.y;
        enemy.dir = 'left';
      }
      continue;
    }
    enemy.speed = (powerTimer > 0 ? CONFIG.frightenedEnemySpeed : CONFIG.enemySpeed) + speedBoost;
    moveActor(enemy, dt, false);
    enemy.phase += dt * 4;
  }
}

function update(dt) {
  if (freezeTimer > 0) {
    freezeTimer = Math.max(0, freezeTimer - dt);
    return;
  }

  if (gameState === 'dying') {
    stateTimer -= dt;
    updateParticles(dt);
    if (stateTimer <= 0) {
      if (lives <= 0) finishGame();
      else {
        resetActors();
        gameState = 'running';
      }
    }
    return;
  }

  if (gameState === 'levelclear') {
    stateTimer -= dt;
    updateParticles(dt);
    if (stateTimer <= 0) gameState = 'running';
    return;
  }

  if (gameState !== 'running') return;

  elapsed += dt;
  powerTimer = Math.max(0, powerTimer - dt);
  if (powerTimer === 0) powerCombo = 0;

  player.speed = CONFIG.playerSpeed + (level - 1) * 0.12;
  moveActor(player, dt, true);
  player.angle = lerpAngle(player.angle, DIRS[player.dir]?.angle ?? player.angle, clamp(dt * 18, 0, 1));
  player.pulse = Math.max(0, player.pulse - dt * 4.5);
  collectAtPlayer();
  updateEnemies(dt);
  checkEnemyCollisions();
  updateParticles(dt);
  updateSpeedLines(dt);
  updateHud();
}

function lerpAngle(a, b, t) {
  let delta = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + delta * t;
}

function updateParticles(dt) {
  for (const p of particles) {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.05, dt);
    p.vy *= Math.pow(0.05, dt);
  }
  particles = particles.filter(p => p.age < p.life).slice(-CONFIG.particleCap);
}

function updateSpeedLines(dt) {
  if (reducedMotion) return;
  if (Math.random() < 0.07 + level * 0.01) {
    speedLines.push({
      x: Math.random() * width,
      y: Math.random() * height,
      len: 20 + Math.random() * 50,
      life: 0.25 + Math.random() * 0.25,
      age: 0
    });
  }
  for (const s of speedLines) s.age += dt;
  speedLines = speedLines.filter(s => s.age < s.life).slice(-45);
}

function tinyBurst(x, y, color) {
  if (reducedMotion) return;
  for (let i = 0; i < 3; i++) {
    const a = Math.random() * Math.PI * 2;
    particles.push({ x, y, vx: Math.cos(a) * 1.1, vy: Math.sin(a) * 1.1, age: 0, life: 0.3, color, size: 0.06 + Math.random() * 0.05 });
  }
}

function burstWorld(x, y, color, count, power) {
  if (reducedMotion) count = Math.ceil(count * 0.25);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const p = (0.3 + Math.random() * 0.7) * power;
    particles.push({ x, y, vx: Math.cos(a) * p, vy: Math.sin(a) * p, age: 0, life: 0.3 + Math.random() * 0.55, color, size: 0.05 + Math.random() * 0.09 });
  }
}

function toastAtWorld(x, y, text, gold = false) {
  const p = worldToScreen(x, y);
  const el = document.createElement('div');
  el.className = `score-toast${gold ? ' gold' : ''}`;
  el.textContent = text;
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  ui.toastLayer.appendChild(el);
  setTimeout(() => el.remove(), 850);
}

function showBanner(text) {
  ui.levelBanner.textContent = text;
  ui.levelBanner.classList.add('visible');
  clearTimeout(showBanner.timer);
  showBanner.timer = setTimeout(() => ui.levelBanner.classList.remove('visible'), 900);
}

function updateHud(force = false) {
  const nextScore = pad(score);
  const nextRecord = pad(Math.max(record, score));
  const nextLevel = String(level).padStart(2, '0');
  const nextLives = '●'.repeat(Math.max(0, lives)) || '—';
  if (force || ui.score.textContent !== nextScore) ui.score.textContent = nextScore;
  if (force || ui.record.textContent !== nextRecord) ui.record.textContent = nextRecord;
  if (force || ui.level.textContent !== nextLevel) ui.level.textContent = nextLevel;
  if (force || ui.lives.textContent !== nextLives) ui.lives.textContent = nextLives;
}

function resize() {
  const rect = stage.getBoundingClientRect();
  width = Math.max(320, rect.width);
  height = Math.max(420, rect.height);
  dpr = Math.min(devicePixelRatio || 1, CONFIG.maxDpr);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const marginX = width < 700 ? 14 : 36;
  const marginY = width < 700 ? 14 : 26;
  tile = Math.floor(Math.min((width - marginX * 2) / CONFIG.cols, (height - marginY * 2) / CONFIG.rows));
  tile = Math.max(tile, 12);
  boardW = tile * CONFIG.cols;
  boardH = tile * CONFIG.rows;
  boardX = Math.floor((width - boardW) / 2);
  boardY = Math.floor((height - boardH) / 2);
  cachedBackground = null;
  draw();
}

function worldToScreen(x, y) {
  return { x: boardX + (x + 0.5) * tile, y: boardY + (y + 0.5) * tile };
}

function draw() {
  drawBackground();
  drawMaze();
  drawPellets();
  drawParticles();
  drawEnemies();
  drawPlayer();
  drawPowerStatus();
  drawSpeedLines();
}

function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#02080a');
  grad.addColorStop(0.55, '#010607');
  grad.addColorStop(1, '#010304');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width * 0.5, height * 0.47, 0, width * 0.5, height * 0.47, Math.max(width, height) * 0.65);
  glow.addColorStop(0, powerTimer > 0 ? 'rgba(12,126,148,.16)' : 'rgba(8,75,86,.10)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#29e9ff';
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const yy = ((i * 113 + elapsed * 9) % (height + 100)) - 50;
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(width, yy + Math.sin(i * 2.1) * 12);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMaze() {
  ctx.save();
  const wallR = tile * 0.16;
  for (let y = 0; y < CONFIG.rows; y++) {
    for (let x = 0; x < CONFIG.cols; x++) {
      if (board[y][x] !== '#') continue;
      const sx = boardX + x * tile;
      const sy = boardY + y * tile;
      ctx.fillStyle = '#061115';
      ctx.fillRect(sx + 1, sy + 1, tile - 2, tile - 2);
      ctx.strokeStyle = 'rgba(41,233,255,.38)';
      ctx.lineWidth = Math.max(1, tile * 0.055);
      ctx.strokeRect(sx + wallR * 0.25, sy + wallR * 0.25, tile - wallR * 0.5, tile - wallR * 0.5);
      ctx.fillStyle = 'rgba(8,60,69,.22)';
      ctx.fillRect(sx + tile * 0.18, sy + tile * 0.18, tile * 0.64, tile * 0.64);
    }
  }

  ctx.strokeStyle = 'rgba(41,233,255,.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(boardX - 4, boardY - 4, boardW + 8, boardH + 8);
  ctx.restore();
}

function drawPellets() {
  ctx.save();
  ctx.fillStyle = '#8ff5ff';
  ctx.shadowColor = '#29e9ff';
  ctx.shadowBlur = tile * 0.3;
  for (const key of pellets) {
    const [x, y] = key.split(',').map(Number);
    const p = worldToScreen(x, y);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1.4, tile * 0.085), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const img = assets.semilla;
  if (img?.complete && img.naturalWidth) {
    for (const key of powerSeeds) {
      const [x, y] = key.split(',').map(Number);
      const p = worldToScreen(x, y);
      const s = tile * (0.72 + Math.sin(elapsed * 5 + x) * 0.06);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(elapsed * 0.7);
      ctx.shadowColor = '#f5c75a';
      ctx.shadowBlur = tile * 0.6;
      ctx.drawImage(img, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
  }
}

function drawPlayer() {
  if (!player.alive) return;
  const p = worldToScreen(player.x, player.y);
  const img = assets.player;
  const base = tile * 1.05;
  const pulse = 1 + Math.sin(elapsed * 5) * 0.025 + player.pulse * 0.08;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(player.angle);

  if (powerTimer > 0 && assets.trail?.complete && assets.trail.naturalWidth) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.24 + Math.sin(elapsed * 8) * 0.05;
    ctx.rotate(-player.angle - 0.25);
    const ts = tile * 2.25;
    ctx.drawImage(assets.trail, -ts * 0.7, -ts * 0.36, ts, ts);
    ctx.restore();
  }

  ctx.shadowColor = powerTimer > 0 ? '#f5c75a' : '#29e9ff';
  ctx.shadowBlur = tile * (powerTimer > 0 ? 0.9 : 0.55);
  if (img?.complete && img.naturalWidth) ctx.drawImage(img, -base * pulse / 2, -base * pulse / 2, base * pulse, base * pulse);
  ctx.restore();
}

function drawEnemies() {
  for (const enemy of enemies) {
    if (!enemy.active) continue;
    const p = worldToScreen(enemy.x, enemy.y);
    const img = assets[enemy.asset];
    const s = tile * enemy.scale;
    ctx.save();
    ctx.translate(p.x, p.y + Math.sin(enemy.phase) * tile * 0.035);
    ctx.shadowColor = powerTimer > 0 ? '#66ecff' : enemy.tint;
    ctx.shadowBlur = tile * (powerTimer > 0 ? 0.8 : 0.46);
    if (powerTimer > 0) {
      ctx.globalAlpha = powerTimer < 1.5 ? 0.55 + Math.abs(Math.sin(elapsed * 14)) * 0.45 : 0.72;
      ctx.globalCompositeOperation = 'screen';
    }
    if (img?.complete && img.naturalWidth) ctx.drawImage(img, -s / 2, -s / 2, s, s);
    ctx.restore();

    if (powerTimer > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(83,238,255,.65)';
      ctx.lineWidth = Math.max(1, tile * 0.06);
      ctx.beginPath();
      ctx.arc(p.x, p.y, tile * 0.43, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawParticles() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const part of particles) {
    const p = worldToScreen(part.x, part.y);
    const t = 1 - part.age / part.life;
    ctx.globalAlpha = clamp(t, 0, 1);
    ctx.fillStyle = part.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, tile * part.size * Math.max(0.4, t), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPowerStatus() {
  if (powerTimer <= 0) return;
  const ratio = powerTimer / CONFIG.powerDuration;
  const w = Math.min(width * 0.28, 330);
  const x = (width - w) / 2;
  const y = boardY + boardH + 8;
  if (y > height - 12) return;
  ctx.save();
  ctx.fillStyle = 'rgba(1,8,10,.8)';
  ctx.fillRect(x, y, w, 5);
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, '#f5c75a');
  g.addColorStop(1, '#29e9ff');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w * ratio, 5);
  ctx.restore();
}

function drawSpeedLines() {
  if (reducedMotion) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(55,220,240,.08)';
  ctx.lineWidth = 1;
  for (const s of speedLines) {
    const t = 1 - s.age / s.life;
    ctx.globalAlpha = t * 0.4;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.len, s.y);
    ctx.stroke();
  }
  ctx.restore();
}

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

function directionFromKey(code) {
  if (code === 'ArrowLeft' || code === 'KeyA') return 'left';
  if (code === 'ArrowRight' || code === 'KeyD') return 'right';
  if (code === 'ArrowUp' || code === 'KeyW') return 'up';
  if (code === 'ArrowDown' || code === 'KeyS') return 'down';
  return null;
}

function handleKey(event) {
  const dir = directionFromKey(event.code);
  if (dir) {
    event.preventDefault();
    if (!event.repeat) setDirection(dir);
    return;
  }
  if (['KeyP', 'Escape'].includes(event.code)) {
    event.preventDefault();
    if (!event.repeat && ['running', 'paused'].includes(gameState)) togglePause();
    return;
  }
  if (['Enter', 'Space'].includes(event.code)) {
    if (event.repeat) return;
    event.preventDefault();
    if (gameState === 'ready') newGame();
    else if (gameState === 'gameover') newGame();
    else if (gameState === 'paused') togglePause();
  }
}

function pointerDirection(event) {
  const rect = canvas.getBoundingClientRect();
  const px = (event.clientX - rect.left) * (width / rect.width);
  const py = (event.clientY - rect.top) * (height / rect.height);
  const p = worldToScreen(player.x, player.y);
  const dx = px - p.x;
  const dy = py - p.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
}

canvas.addEventListener('pointerdown', event => {
  event.preventDefault();
  if (gameState === 'paused') { togglePause(); return; }
  if (gameState !== 'running') return;
  swipeStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  setDirection(pointerDirection(event));
  try { canvas.setPointerCapture(event.pointerId); } catch {}
});

canvas.addEventListener('pointerup', event => {
  if (!swipeStart || swipeStart.id !== event.pointerId) return;
  const dx = event.clientX - swipeStart.x;
  const dy = event.clientY - swipeStart.y;
  if (Math.hypot(dx, dy) > 24) {
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    setDirection(dir);
  }
  swipeStart = null;
});

for (const button of document.querySelectorAll('[data-dir]')) {
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    event.stopPropagation();
    setDirection(button.dataset.dir);
  });
}

ui.startButton.addEventListener('click', event => { event.stopPropagation(); if (gameState === 'ready') newGame(); });
ui.restartButton.addEventListener('click', event => { event.stopPropagation(); if (gameState === 'gameover') newGame(); });
ui.pauseOverlay.addEventListener('pointerdown', event => { event.preventDefault(); if (gameState === 'paused') togglePause(); });
ui.muteButton.addEventListener('click', event => {
  event.stopPropagation();
  muted = !muted;
  localStorage.setItem('sod-maze-muted-v1', muted ? '1' : '0');
  updateMuteUi();
  unlockAudio();
  if (!muted) sfx('pellet');
});
window.addEventListener('keydown', handleKey, { passive: false });
window.addEventListener('resize', resize);
window.addEventListener('blur', () => { if (gameState === 'running') togglePause(); });

function updateMuteUi() {
  ui.muteButton.textContent = muted ? '×' : '♫';
  ui.muteButton.setAttribute('aria-label', muted ? 'Activar audio' : 'Silenciar audio');
}

function unlockAudio() {
  if (muted) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {}
}

function tone(freq, duration, type = 'sine', gain = 0.03, slide = 0) {
  if (muted || !audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), now + duration);
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(amp).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function sfx(name) {
  if (muted) return;
  if (!audioCtx) return;
  if (name === 'pellet') tone(820, 0.035, 'sine', 0.012, 40);
  if (name === 'power') { tone(390, 0.16, 'triangle', 0.035, 360); setTimeout(() => tone(720, 0.13, 'sine', 0.025, 180), 80); }
  if (name === 'purify') { tone(620, 0.09, 'square', 0.018, 340); setTimeout(() => tone(980, 0.11, 'sine', 0.02, 220), 65); }
  if (name === 'death') { tone(170, 0.25, 'sawtooth', 0.035, -105); }
  if (name === 'level') { tone(440, 0.12, 'triangle', 0.025, 220); setTimeout(() => tone(660, 0.16, 'sine', 0.027, 220), 100); }
  if (name === 'start') { tone(300, 0.08, 'triangle', 0.02, 200); setTimeout(() => tone(520, 0.1, 'sine', 0.024, 180), 65); }
  if (name === 'record') { tone(540, 0.12, 'triangle', 0.026, 240); setTimeout(() => tone(880, 0.18, 'sine', 0.028, 180), 120); }
}

function vibrate(ms) {
  try { if ('vibrate' in navigator) navigator.vibrate(ms); } catch {}
}

async function loadAssets() {
  const entries = Object.entries(ASSET_PATHS);
  await Promise.all(entries.map(([key, src]) => new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = async () => {
      try { await img.decode?.(); } catch {}
      assets[key] = img;
      resolve();
    };
    img.onerror = () => reject(new Error(`No se pudo cargar ${key}: ${src}`));
    img.src = src;
  })));
}

function validateMap() {
  if (MAP_TEMPLATE.length !== CONFIG.rows) throw new Error(`Maze rows invalid: ${MAP_TEMPLATE.length}`);
  for (const row of MAP_TEMPLATE) if (row.length !== CONFIG.cols) throw new Error(`Maze columns invalid: ${row.length}`);
}

async function boot() {
  try {
    validateMap();
    initBoard();
    updateHud(true);
    updateMuteUi();
    resize();
    await loadAssets();
    gameState = 'ready';
    ui.startButton.disabled = false;
    ui.startButton.textContent = 'INICIAR RECORRIDO';
  } catch (error) {
    console.error(error);
    ui.startButton.disabled = true;
    ui.startButton.textContent = 'ERROR DE CARGA';
  }
  requestAnimationFrame(frame);
}

boot();

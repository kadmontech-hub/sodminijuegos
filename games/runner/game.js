const IS_EMBEDDED = new URLSearchParams(location.search).get('embed') === '1';
document.documentElement.classList.toggle('is-embedded', IS_EMBEDDED);

function notifyPortal(event, payload = {}) {
  if (window.parent === window) return;
  try { window.parent.postMessage({ type: 'sod-game-event', game: 'runner', event, ...payload }, '*'); } catch {}
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const stageWrap = document.getElementById('stageWrap');
const startOverlay = document.getElementById('startOverlay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const startButton = document.getElementById('startButton');
const restartButton = document.getElementById('restartButton');
const muteButton = document.getElementById('muteButton');
const muteIcon = document.getElementById('muteIcon');
const loadingFault = document.getElementById('loadingFault');
const deathEyebrow = document.getElementById('deathEyebrow');
const scoreValue = document.getElementById('scoreValue');
const recordValue = document.getElementById('recordValue');
const seedValue = document.getElementById('seedValue');
const finalScore = document.getElementById('finalScore');
const finalSeeds = document.getElementById('finalSeeds');
const finalRecord = document.getElementById('finalRecord');

const CONFIG = Object.freeze({
  physics: {
    gravity: 1875,
    jumpImpulse: 460,
    groundImpulse: 505,
    maxRiseSpeed: 730,
    maxFallSpeed: 980,
    topMarginRatio: 0.075
  },
  world: {
    initialSpeed: 410,
    maxSpeed: 875,
    acceleration: 8.7,
    scorePerPixel: 0.021,
    firstObstacleDistance: 650,
    minSpawnDistance: 500,
    maxSpawnDistance: 780,
    seedPatternDistance: 760
  },
  player: {
    minSize: 58,
    maxSize: 80,
    widthRatio: 0.057,
    hitInset: 0.205
  },
  vfx: {
    maxParticles: 190,
    maxPopups: 18,
    deathShake: 12,
    maxSpeedLines: 24
  },
  score: {
    seedBonus: 100,
    nearMissBonus: 25,
    milestones: [250, 500, 1000, 2500, 5000]
  }
});

const ASSET_PATHS = {
  player: '/public/assets/player.png',
  trail: '/public/assets/trail.png',
  ground: '/public/assets/ground.png',
  ruido: '/public/assets/obstacle-ruido.png',
  distraccion: '/public/assets/obstacle-distraccion.png',
  miedo: '/public/assets/obstacle-miedo.png',
  semilla: '/public/assets/semilla.png'
};

const assets = {};
let assetsReady = false;
let assetLoadFailed = false;
let mode = 'loading'; // loading | ready | playing | dead
let width = 1280;
let height = 650;
let dpr = 1;
let lastTime = performance.now();
let elapsed = 0;
let runTime = 0;
let speed = CONFIG.world.initialSpeed;
let worldDistance = 0;
let bonusScore = 0;
let seedsCollected = 0;
let nextObstacleAt = CONFIG.world.firstObstacleDistance;
let nextSeedAt = CONFIG.world.seedPatternDistance;
let groundOffset = 0;
let flash = 0;
let screenShake = 0;
let deathAt = 0;
let newRecord = false;
let milestoneIndex = 0;
let cachedScore = -1;
let cachedSeeds = -1;
let cachedRecord = -1;
let bgCache = null;
let bgCacheCtx = null;
let audioCtx = null;
const storage = {
  get(key, fallback = null) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage may be unavailable */ } }
};
let muted = storage.get('sod-runner-muted', '0') === '1';
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const recordKey = 'sod-runner-record-v1';
let record = Number(storage.get(recordKey, '0') || 0);

const player = {
  x: 150,
  y: 0,
  vy: 0,
  size: 72,
  grounded: true,
  rotation: 0,
  squash: 0,
  impulsePulse: 0,
  ceilingPulse: 0
};

let obstacles = [];
let seeds = [];
let particles = [];
let popups = [];
let glyphs = [];
let distantNodes = [];
let speedLines = [];

const obstacleTypes = {
  ruido: { key: 'ruido', width: 78, height: 82, hitInsetX: .22, hitInsetY: .18 },
  miedo: { key: 'miedo', width: 92, height: 166, hitInsetX: .22, hitInsetY: .12 },
  distraccion: { key: 'distraccion', width: 152, height: 100, hitInsetX: .19, hitInsetY: .22 }
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(min, max) { return min + Math.random() * (max - min); }
function pad(v) { return Math.max(0, Math.floor(v)).toString().padStart(5, '0'); }
function scoreNow() { return Math.floor(worldDistance * CONFIG.world.scorePerPixel + bonusScore); }

function scaledPhysics() {
  const scale = clamp(height / 650, .83, 1.16);
  return {
    gravity: CONFIG.physics.gravity * scale,
    jumpImpulse: CONFIG.physics.jumpImpulse * scale,
    groundImpulse: CONFIG.physics.groundImpulse * scale,
    maxRiseSpeed: CONFIG.physics.maxRiseSpeed * scale,
    maxFallSpeed: CONFIG.physics.maxFallSpeed * scale
  };
}

function groundY() {
  return height * (width < 760 ? .82 : .835);
}

function resizeCanvas() {
  const rect = stageWrap.getBoundingClientRect();
  width = Math.max(320, rect.width);
  height = Math.max(430, rect.height);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  player.size = clamp(width * CONFIG.player.widthRatio, CONFIG.player.minSize, CONFIG.player.maxSize);
  player.x = clamp(width * .13, 58, 185);
  if (mode !== 'playing' || player.grounded) player.y = groundY() - player.size;
  else player.y = clamp(player.y, height * CONFIG.physics.topMarginRatio, groundY() - player.size);

  buildBackgroundCache();
  buildAmbientField();
}

function buildBackgroundCache() {
  bgCache = document.createElement('canvas');
  bgCache.width = Math.ceil(width);
  bgCache.height = Math.ceil(height);
  bgCacheCtx = bgCache.getContext('2d');
  const g = bgCacheCtx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, '#02090b');
  g.addColorStop(.46, '#010607');
  g.addColorStop(1, '#010304');
  bgCacheCtx.fillStyle = g;
  bgCacheCtx.fillRect(0, 0, width, height);

  const glow = bgCacheCtx.createRadialGradient(width * .22, height * .44, 0, width * .22, height * .44, width * .68);
  glow.addColorStop(0, 'rgba(19,116,133,.11)');
  glow.addColorStop(.45, 'rgba(4,37,43,.045)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  bgCacheCtx.fillStyle = glow;
  bgCacheCtx.fillRect(0, 0, width, height);

  const red = bgCacheCtx.createRadialGradient(width * .84, groundY(), 0, width * .84, groundY(), width * .42);
  red.addColorStop(0, 'rgba(102,4,20,.05)');
  red.addColorStop(1, 'rgba(0,0,0,0)');
  bgCacheCtx.fillStyle = red;
  bgCacheCtx.fillRect(0, 0, width, height);
}

function buildAmbientField() {
  glyphs = [];
  distantNodes = [];
  speedLines = [];
  const glyphCount = clamp(Math.floor(width * height / 22000), 14, 54);
  const chars = ['Ø', '·', '⌁', '⟡', '∴', '◦', '┼', '◇'];
  for (let i = 0; i < glyphCount; i++) {
    glyphs.push({
      x: Math.random() * width,
      y: rand(height * .17, groundY() - 40),
      speed: rand(4, 13),
      alpha: rand(.018, .055),
      char: chars[(Math.random() * chars.length) | 0],
      size: rand(7, 14)
    });
  }
  for (let i = 0; i < clamp(Math.floor(width / 105), 7, 18); i++) {
    distantNodes.push({
      x: Math.random() * width,
      y: rand(height * .22, groundY() * .8),
      r: rand(1, 2.2),
      speed: rand(14, 28),
      alpha: rand(.05, .14)
    });
  }
  for (let i = 0; i < CONFIG.vfx.maxSpeedLines; i++) {
    speedLines.push({
      x: Math.random() * width,
      y: rand(height * .2, groundY() - 30),
      len: rand(18, 80),
      phase: Math.random()
    });
  }
}

function resetGame() {
  elapsed = 0;
  runTime = 0;
  speed = CONFIG.world.initialSpeed * clamp(width / 1280, .9, 1.08);
  worldDistance = 0;
  bonusScore = 0;
  seedsCollected = 0;
  nextObstacleAt = CONFIG.world.firstObstacleDistance;
  nextSeedAt = CONFIG.world.seedPatternDistance;
  groundOffset = 0;
  flash = 0;
  screenShake = 0;
  newRecord = false;
  milestoneIndex = 0;
  obstacles = [];
  seeds = [];
  particles = [];
  popups = [];
  player.y = groundY() - player.size;
  player.vy = 0;
  player.grounded = true;
  player.rotation = 0;
  player.squash = 0;
  player.impulsePulse = 0;
  player.ceilingPulse = 0;
  cachedScore = cachedSeeds = -1;
  updateHud(true);
}

function startGame({ impulse = false } = {}) {
  if (!assetsReady || assetLoadFailed) return;
  initAudio();
  resetGame();
  mode = 'playing';
  stageWrap.classList.add('is-running');
  startOverlay.classList.remove('is-visible');
  gameOverOverlay.classList.remove('is-visible');
  lastTime = performance.now();
  notifyPortal('game-start');
  if (impulse) applyImpulse();
}

function endGame() {
  if (mode !== 'playing') return;
  mode = 'dead';
  stageWrap.classList.remove('is-running');
  deathAt = performance.now();
  screenShake = reducedMotion ? 0 : CONFIG.vfx.deathShake;
  flash = 1;
  player.vy = 0;
  burst(player.x + player.size * .5, player.y + player.size * .5, '#ff3155', 36, 230, true);
  playSound('death');
  haptic(34);

  const final = scoreNow();
  newRecord = final > record;
  if (newRecord) {
    record = final;
    storage.set(recordKey, String(record));
    playSound('record');
    notifyPortal('record', { score: final });
  }
  deathEyebrow.textContent = newRecord ? 'NUEVO RÉCORD' : 'INTERFERENCIA';
  finalScore.textContent = final.toString();
  finalSeeds.textContent = seedsCollected.toString();
  finalRecord.textContent = record.toString();
  updateHud(true);
  notifyPortal('game-over', { score: final, record, seeds: seedsCollected });

  window.setTimeout(() => {
    if (mode === 'dead') gameOverOverlay.classList.add('is-visible');
  }, reducedMotion ? 80 : 220);
}

function applyImpulse() {
  if (mode !== 'playing') return;
  const p = scaledPhysics();
  const impulse = player.grounded ? p.groundImpulse : p.jumpImpulse;
  player.vy = Math.max(player.vy - impulse, -p.maxRiseSpeed);
  player.grounded = false;
  player.impulsePulse = 1;
  player.squash = Math.max(player.squash, .56);
  burst(player.x + player.size * .32, player.y + player.size * .78, '#28efff', reducedMotion ? 4 : 8, 100, false);
  playSound('jump');
}

function handleGameplayAction(event) {
  if (event?.type === 'keydown') {
    if (!['Space', 'ArrowUp', 'KeyW', 'Enter'].includes(event.code)) return;
    if (event.repeat) return;
    event.preventDefault();
  }

  if (mode === 'loading') return;
  if (mode === 'ready') {
    startGame({ impulse: event?.type !== 'click' });
    return;
  }
  if (mode === 'dead') {
    if (performance.now() - deathAt < 260) return;
    startGame({ impulse: event?.type !== 'click' });
    return;
  }
  applyImpulse();
}

function currentDifficulty() {
  const t = runTime;
  if (t < 12) return { phase: 1, risk: 0, airChance: 0, pairChance: 0 };
  if (t < 30) return { phase: 2, risk: .25, airChance: .22, pairChance: 0 };
  if (t < 60) return { phase: 3, risk: .52, airChance: .38, pairChance: .08 };
  return { phase: 4, risk: .82, airChance: .47, pairChance: .15 };
}

function obstacleScale() {
  return clamp(width / 1280, .8, 1.08);
}

function spawnObstacle() {
  const diff = currentDifficulty();
  const scale = obstacleScale();
  let key = 'ruido';
  const roll = Math.random();
  if (diff.phase === 1) key = roll < .7 ? 'ruido' : 'miedo';
  else if (roll < diff.airChance) key = 'distraccion';
  else key = roll < .66 ? 'ruido' : 'miedo';

  const base = obstacleTypes[key];
  const w = base.width * scale;
  const h = base.height * scale;
  let y = groundY() - h;
  if (key === 'distraccion') {
    // Air hazards use multiple lanes so infinite impulses cannot be cheesed by camping at the ceiling.
    const highLane = diff.phase >= 3 && Math.random() < .36;
    if (highLane) {
      y = rand(height * .085, height * .19);
    } else {
      const minClearance = clamp(height * .11, 64, 96);
      const maxLift = clamp(height * .31, 120, 220);
      const lift = rand(minClearance, maxLift);
      y = clamp(groundY() - h - lift, height * .18, groundY() - h - minClearance);
    }
  }

  const obstacle = {
    ...base,
    width: w,
    height: h,
    x: width + 90,
    y,
    baseY: y,
    phase: Math.random() * Math.PI * 2,
    nearChecked: false,
    minGap: Infinity
  };
  obstacles.push(obstacle);

  // Optional advanced follow-up, spaced far enough to remain readable and solvable.
  if (diff.pairChance > 0 && Math.random() < diff.pairChance) {
    const followerKey = key === 'distraccion' ? 'ruido' : 'distraccion';
    const fb = obstacleTypes[followerKey];
    const fw = fb.width * scale;
    const fh = fb.height * scale;
    const gap = clamp(speed * .72, 330, 540);
    const fy = followerKey === 'distraccion'
      ? clamp(groundY() - fh - rand(80, 150), height * .2, groundY() - fh - 68)
      : groundY() - fh;
    obstacles.push({
      ...fb,
      width: fw,
      height: fh,
      x: width + 90 + gap,
      y: fy,
      baseY: fy,
      phase: Math.random() * Math.PI * 2,
      nearChecked: false,
      minGap: Infinity
    });
  }

  const normalized = clamp((speed - CONFIG.world.initialSpeed) / (CONFIG.world.maxSpeed - CONFIG.world.initialSpeed), 0, 1);
  const minGap = lerp(CONFIG.world.maxSpawnDistance, CONFIG.world.minSpawnDistance, normalized);
  const jitter = rand(0, 180);
  nextObstacleAt = worldDistance + Math.max(minGap + jitter, speed * 1.08);
}

function safeSeedY(size, x) {
  let y = rand(height * .25, groundY() - size - 60);
  for (const o of obstacles) {
    if (Math.abs(o.x - x) < o.width + 130) {
      const oTop = o.y;
      const oBottom = o.y + o.height;
      if (y + size > oTop - 32 && y < oBottom + 32) {
        y = o.key === 'distraccion'
          ? clamp(oBottom + 50, height * .25, groundY() - size - 45)
          : clamp(oTop - size - 60, height * .18, groundY() - size - 45);
      }
    }
  }
  return y;
}

function spawnSeedPattern() {
  const size = clamp(width * .031, 32, 46);
  const count = currentDifficulty().phase >= 3 ? 5 : 4;
  const startX = width + 125;
  const spacing = clamp(speed * .18, 74, 116);
  const centerY = safeSeedY(size, startX);
  for (let i = 0; i < count; i++) {
    const arc = Math.sin((i / Math.max(1, count - 1)) * Math.PI) * -clamp(height * .075, 38, 60);
    seeds.push({
      x: startX + i * spacing,
      y: clamp(centerY + arc, height * .16, groundY() - size - 40),
      size,
      phase: Math.random() * Math.PI * 2,
      collected: false
    });
  }
  nextSeedAt = worldDistance + rand(680, 1030);
}

function update(dt) {
  elapsed += dt;
  updateAmbient(dt);
  updateParticles(dt);
  updatePopups(dt);
  flash = Math.max(0, flash - dt * 3.4);
  screenShake = Math.max(0, screenShake - dt * 55);
  player.impulsePulse = Math.max(0, player.impulsePulse - dt * 7.4);
  player.squash = Math.max(0, player.squash - dt * 6.5);
  player.ceilingPulse = Math.max(0, player.ceilingPulse - dt * 4);

  if (mode !== 'playing') return;

  runTime += dt;
  speed = Math.min(CONFIG.world.maxSpeed, speed + CONFIG.world.acceleration * dt);
  worldDistance += speed * dt;
  groundOffset = (groundOffset + speed * dt) % Math.max(420, width * .52);

  const p = scaledPhysics();
  player.vy = Math.min(p.maxFallSpeed, player.vy + p.gravity * dt);
  player.y += player.vy * dt;
  player.rotation += (player.grounded ? -player.rotation * 8 : speed * .00115) * dt;

  const top = height * CONFIG.physics.topMarginRatio;
  if (player.y < top) {
    player.y = top;
    if (player.vy < 0) player.vy = Math.min(70, -player.vy * .08);
    player.ceilingPulse = 1;
  }

  const floor = groundY() - player.size;
  if (player.y >= floor) {
    if (!player.grounded && player.vy > 180) {
      player.squash = 1;
      burst(player.x + player.size / 2, groundY() - 3, '#28efff', reducedMotion ? 3 : 7, 64, false);
    }
    player.y = floor;
    player.vy = 0;
    player.grounded = true;
    player.rotation *= .78;
  } else {
    player.grounded = false;
  }

  if (worldDistance >= nextObstacleAt) spawnObstacle();
  if (worldDistance >= nextSeedAt) spawnSeedPattern();

  for (const o of obstacles) {
    o.x -= speed * dt;
    if (o.key === 'distraccion') o.y = o.baseY + Math.sin(elapsed * 2.2 + o.phase) * 5;
  }
  for (const s of seeds) {
    s.x -= speed * dt;
    s.phase += dt * 4.3;
  }

  obstacles = obstacles.filter(o => o.x + o.width > -150);
  seeds = seeds.filter(s => !s.collected && s.x + s.size > -90);

  checkCollisionsAndNearMisses();
  checkMilestones();
  updateHud();
}

function updateAmbient(dt) {
  const base = mode === 'playing' ? speed : 110;
  for (const g of glyphs) {
    g.x -= g.speed * dt * (1 + base / 900);
    if (g.x < -25) {
      g.x = width + 25;
      g.y = rand(height * .17, groundY() - 40);
    }
  }
  for (const n of distantNodes) {
    n.x -= n.speed * dt * (1 + base / 700);
    if (n.x < -20) {
      n.x = width + 20;
      n.y = rand(height * .22, groundY() * .8);
    }
  }
}

function rectDistance(a, b) {
  const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
  const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
  return Math.hypot(dx, dy);
}

function playerHitbox() {
  const inset = player.size * CONFIG.player.hitInset;
  return {
    x: player.x + inset,
    y: player.y + inset,
    w: player.size - inset * 2,
    h: player.size - inset * 2
  };
}

function obstacleHitbox(o) {
  const ix = o.width * o.hitInsetX;
  const iy = o.height * o.hitInsetY;
  return {
    x: o.x + ix,
    y: o.y + iy,
    w: o.width - ix * 2,
    h: o.height - iy * 1.5
  };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function checkCollisionsAndNearMisses() {
  const p = playerHitbox();
  for (const o of obstacles) {
    const box = obstacleHitbox(o);
    if (overlaps(p, box)) {
      endGame();
      return;
    }
    if (o.x < player.x + player.size + 90 && o.x + o.width > player.x - 40) {
      o.minGap = Math.min(o.minGap, rectDistance(p, box));
    }
    if (!o.nearChecked && o.x + o.width < player.x) {
      o.nearChecked = true;
      if (o.minGap > 0 && o.minGap < 30) {
        bonusScore += CONFIG.score.nearMissBonus;
        addPopup(`+${CONFIG.score.nearMissBonus} NEAR MISS`, player.x + player.size * .8, player.y - 8, '#83f4ff');
        burst(player.x + player.size, player.y + player.size * .5, '#83f4ff', reducedMotion ? 2 : 6, 88, false);
        playSound('near');
      }
    }
  }

  for (const s of seeds) {
    const bob = Math.sin(s.phase) * 5;
    const inset = s.size * .25;
    const box = { x: s.x + inset, y: s.y + bob + inset, w: s.size - inset * 2, h: s.size - inset * 2 };
    if (overlaps(p, box)) {
      s.collected = true;
      seedsCollected += 1;
      bonusScore += CONFIG.score.seedBonus;
      flash = Math.max(flash, .22);
      addPopup(`+${CONFIG.score.seedBonus}`, s.x, s.y, '#f7c85b');
      burst(s.x + s.size / 2, s.y + s.size / 2, '#f7c85b', reducedMotion ? 6 : 18, 145, true);
      playSound('seed');
      haptic(10);
    }
  }
}

function checkMilestones() {
  const score = scoreNow();
  const list = CONFIG.score.milestones;
  while (milestoneIndex < list.length && score >= list[milestoneIndex]) {
    addPopup(`${list[milestoneIndex]} · FLOW`, width * .5, height * .25, '#28efff', 1.35);
    playSound('milestone');
    milestoneIndex += 1;
  }
}

function burst(x, y, color, count, power, radial) {
  const available = Math.max(0, CONFIG.vfx.maxParticles - particles.length);
  const actual = Math.min(count, available);
  for (let i = 0; i < actual; i++) {
    const angle = radial ? Math.random() * Math.PI * 2 : rand(Math.PI * .68, Math.PI * 1.32);
    const force = rand(.35, 1) * power;
    particles.push({
      x, y,
      vx: Math.cos(angle) * force,
      vy: Math.sin(angle) * force,
      life: rand(.24, .58),
      age: 0,
      size: rand(1, 3.1),
      color
    });
  }
}

function updateParticles(dt) {
  for (const p of particles) {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(.12, dt);
    p.vy += 145 * dt;
  }
  particles = particles.filter(p => p.age < p.life);
}

function addPopup(text, x, y, color = '#fff', life = .8) {
  if (popups.length >= CONFIG.vfx.maxPopups) popups.shift();
  popups.push({ text, x, y, color, age: 0, life });
}

function updatePopups(dt) {
  for (const p of popups) {
    p.age += dt;
    p.y -= 28 * dt;
  }
  popups = popups.filter(p => p.age < p.life);
}

function updateHud(force = false) {
  const score = scoreNow();
  if (force || score !== cachedScore) {
    scoreValue.textContent = pad(score);
    cachedScore = score;
  }
  if (force || seedsCollected !== cachedSeeds) {
    seedValue.textContent = String(seedsCollected);
    cachedSeeds = seedsCollected;
  }
  if (force || record !== cachedRecord) {
    recordValue.textContent = pad(record);
    cachedRecord = record;
  }
}

function draw() {
  ctx.save();
  if (screenShake > 0) {
    ctx.translate((Math.random() - .5) * screenShake, (Math.random() - .5) * screenShake * .55);
  }

  drawBackground();
  drawParallax();
  drawSpeedLines();
  drawGround();
  drawSeeds();
  drawObstacles();
  drawPlayer();
  drawParticles();
  drawPopups();

  ctx.restore();

  if (flash > 0) {
    ctx.fillStyle = mode === 'dead'
      ? `rgba(255,32,68,${flash * .16})`
      : `rgba(44,235,255,${flash * .065})`;
    ctx.fillRect(0, 0, width, height);
  }
}

function drawBackground() {
  if (bgCache) ctx.drawImage(bgCache, 0, 0, width, height);
  else {
    ctx.fillStyle = '#010506';
    ctx.fillRect(0, 0, width, height);
  }
}

function drawParallax() {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const g of glyphs) {
    ctx.globalAlpha = g.alpha;
    ctx.fillStyle = '#26cde0';
    ctx.font = `700 ${g.size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillText(g.char, g.x, g.y);
  }
  ctx.globalAlpha = 1;
  for (const n of distantNodes) {
    ctx.fillStyle = `rgba(61,219,235,${n.alpha})`;
    ctx.fillRect(n.x, n.y, n.r * 3, 1);
  }

  const horizon = groundY();
  ctx.strokeStyle = 'rgba(40,239,255,.04)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const yy = horizon - i * height * .115;
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(width, yy);
    ctx.stroke();
  }
  const perspectiveOffset = (worldDistance * .04) % 120;
  ctx.strokeStyle = 'rgba(40,239,255,.026)';
  for (let x = -perspectiveOffset; x < width + 120; x += 120) {
    ctx.beginPath();
    ctx.moveTo(width * .5, horizon - height * .16);
    ctx.lineTo(x, horizon);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSpeedLines() {
  if (reducedMotion || mode !== 'playing') return;
  const intensity = clamp((speed - 520) / 360, 0, 1);
  if (intensity <= .01) return;
  ctx.save();
  ctx.lineWidth = 1;
  for (let i = 0; i < speedLines.length; i++) {
    const l = speedLines[i];
    const alpha = intensity * (.025 + l.phase * .045);
    const shift = (worldDistance * (.28 + l.phase * .12)) % (width + 160);
    const x = (l.x - shift + width + 160) % (width + 160) - 80;
    ctx.strokeStyle = `rgba(86,231,247,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(x, l.y);
    ctx.lineTo(x + l.len * (1 + intensity * 1.6), l.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGround() {
  const y = groundY();
  const img = assets.ground;
  const groundH = clamp(height * .12, 62, 96);
  const tileW = Math.max(430, width * .52);
  const offset = groundOffset % tileW;
  ctx.save();
  ctx.globalAlpha = .98;
  if (img?.naturalWidth) {
    for (let x = -offset - tileW; x < width + tileW; x += tileW) {
      ctx.drawImage(img, x, y - 7, tileW, groundH);
    }
  }
  ctx.fillStyle = 'rgba(40,239,255,.28)';
  ctx.fillRect(0, y, width, 1);
  ctx.restore();
}

function drawPlayer() {
  const img = assets.player;
  const x = player.x;
  const y = player.y;
  const size = player.size;

  if (!player.grounded && assets.trail?.naturalWidth) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = .22 + player.impulsePulse * .12;
    const trailSize = size * (1.5 + player.impulsePulse * .42);
    ctx.translate(x + size * .33, y + size * .69);
    ctx.rotate(-.42);
    ctx.drawImage(assets.trail, -trailSize * .68, -trailSize * .32, trailSize, trailSize);
    ctx.restore();
  }

  const squashY = 1 - player.squash * .08 + player.impulsePulse * .03;
  const stretchX = 1 + player.squash * .1 - player.impulsePulse * .025;
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate(player.rotation);
  ctx.scale(stretchX, squashY);
  ctx.shadowColor = `rgba(40,239,255,${.5 + player.impulsePulse * .25})`;
  ctx.shadowBlur = 17 + player.impulsePulse * 9;
  if (img?.naturalWidth) ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();

  if (player.ceilingPulse > 0) {
    ctx.save();
    ctx.globalAlpha = player.ceilingPulse * .18;
    ctx.strokeStyle = '#28efff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * (.62 + (1 - player.ceilingPulse) * .25), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawObstacles() {
  for (const o of obstacles) {
    const img = assets[o.key];
    const proximity = clamp(1 - Math.abs(o.x - player.x) / (width * .5), 0, 1);
    ctx.save();
    ctx.shadowColor = `rgba(255,34,69,${.25 + proximity * .3})`;
    ctx.shadowBlur = 12 + proximity * 14;
    ctx.globalAlpha = .98;
    if (img?.naturalWidth) ctx.drawImage(img, o.x, o.y, o.width, o.height);
    ctx.restore();

    if (!reducedMotion && proximity > .48) {
      ctx.save();
      ctx.globalAlpha = (proximity - .48) * .18;
      ctx.fillStyle = '#ff3155';
      ctx.fillRect(o.x + o.width * .18, o.y + o.height * .9, o.width * .64, 1);
      ctx.restore();
    }
  }
}

function drawSeeds() {
  for (const s of seeds) {
    const bob = Math.sin(s.phase) * 5;
    const spin = s.phase * .13;
    ctx.save();
    ctx.translate(s.x + s.size / 2, s.y + s.size / 2 + bob);
    ctx.rotate(spin);
    ctx.shadowColor = 'rgba(247,200,91,.7)';
    ctx.shadowBlur = 18;
    ctx.globalAlpha = .96;
    if (assets.semilla?.naturalWidth) ctx.drawImage(assets.semilla, -s.size / 2, -s.size / 2, s.size, s.size);
    ctx.restore();
  }
}

function drawParticles() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    const t = 1 - p.age / p.life;
    ctx.globalAlpha = t;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPopups() {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 10px ui-monospace, SFMono-Regular, Menlo, monospace';
  for (const p of popups) {
    const t = 1 - p.age / p.life;
    ctx.globalAlpha = Math.min(1, t * 1.8);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.restore();
}

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, .033);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

function initAudio() {
  if (audioCtx || muted) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    audioCtx = null;
  }
}

function tone(freq, duration, gain = .025, type = 'sine', endFreq = null, delay = 0) {
  if (muted || !audioCtx) return;
  const t0 = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + duration);
  g.gain.setValueAtTime(.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + .008);
  g.gain.exponentialRampToValueAtTime(.0001, t0 + duration);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + .02);
}

function playSound(name) {
  if (muted) return;
  initAudio();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  switch (name) {
    case 'jump':
      tone(370, .055, .018, 'sine', 610);
      break;
    case 'seed':
      tone(650, .09, .022, 'sine', 980);
      tone(980, .08, .012, 'sine', 1280, .035);
      break;
    case 'near':
      tone(260, .075, .012, 'triangle', 520);
      break;
    case 'death':
      tone(160, .16, .035, 'sawtooth', 72);
      break;
    case 'record':
      tone(520, .11, .018, 'sine', 760, .03);
      tone(760, .14, .018, 'sine', 1080, .14);
      break;
    case 'milestone':
      tone(440, .08, .012, 'sine', 660);
      break;
  }
}

function haptic(ms) {
  if ('vibrate' in navigator) {
    try { navigator.vibrate(ms); } catch { /* ignored */ }
  }
}

function syncMuteUI() {
  muteButton.setAttribute('aria-pressed', muted ? 'true' : 'false');
  muteButton.setAttribute('aria-label', muted ? 'Activar sonido' : 'Silenciar sonido');
  muteIcon.textContent = muted ? '○' : '◉';
}

function toggleMute(event) {
  event.stopPropagation();
  muted = !muted;
  storage.set('sod-runner-muted', muted ? '1' : '0');
  if (!muted) initAudio();
  syncMuteUI();
}

function preloadAssets() {
  startButton.disabled = true;
  startButton.textContent = 'CARGANDO…';
  const tasks = Object.entries(ASSET_PATHS).map(([key, src]) => new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = async () => {
      try { if (img.decode) await img.decode(); } catch { /* loaded is enough */ }
      assets[key] = img;
      resolve();
    };
    img.onerror = () => {
      console.error(`[SØD Runner] Failed to load asset ${key}: ${src}`);
      reject(new Error(`Asset failed: ${src}`));
    };
    img.src = src;
  }));

  Promise.all(tasks).then(() => {
    assetsReady = true;
    mode = 'ready';
    startButton.disabled = false;
    startButton.textContent = 'INICIAR';
    updateHud(true);
    draw();
  }).catch((error) => {
    assetLoadFailed = true;
    mode = 'loading';
    loadingFault.hidden = false;
    startButton.disabled = true;
    startButton.textContent = 'ERROR';
    console.error(error);
  });
}

startButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  event.stopPropagation();
  startGame({ impulse: true });
});
restartButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  event.stopPropagation();
  startGame({ impulse: true });
});
muteButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  toggleMute(event);
});

stageWrap.addEventListener('pointerdown', (event) => {
  if (event.button != null && event.button !== 0) return;
  if (event.target.closest?.('button')) return;
  event.preventDefault();
  handleGameplayAction(event);
}, { passive: false });

stageWrap.addEventListener('contextmenu', event => event.preventDefault());
window.addEventListener('keydown', handleGameplayAction, { passive: false });
window.addEventListener('resize', resizeCanvas, { passive: true });
window.addEventListener('blur', () => { lastTime = performance.now(); });

document.addEventListener('visibilitychange', () => {
  lastTime = performance.now();
});

syncMuteUI();
resizeCanvas();
resetGame();
preloadAssets();
requestAnimationFrame(frame);

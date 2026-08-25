import { GAMES, FUTURE_SLOTS } from './catalog.js';

const $ = selector => document.querySelector(selector);
const grid = $('#gameGrid');
const futureGrid = $('#futureGrid');
const gameShell = $('#gameShell');
const gameFrame = $('#gameFrame');
const frameLoader = $('#frameLoader');
const closeGameBtn = $('#closeGame');
const reloadGameBtn = $('#reloadGame');
const fullscreenBtn = $('#fullscreenGame');
const shellName = $('#shellName');
const shellFamily = $('#shellFamily');
const playFeatured = $('#playFeatured');
const featuredPreview = $('#featuredPreview');
const featuredCtaName = $('#featuredCtaName');
const featuredFamily = $('#featuredFamily');
const featuredEyebrow = $('#featuredEyebrow');
const featuredName = $('#featuredName');
const featuredDescription = $('#featuredDescription');
const runnerBest = $('#runnerBest');
const mazeBest = $('#mazeBest');
const activeCount = $('#activeCount');

let activeGame = null;
let featuredGame = GAMES[0];
let previousOverflow = '';

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
}

function safeNumber(key) {
  try { return Number(localStorage.getItem(key) || 0) || 0; } catch { return 0; }
}

function pad(value) {
  return Math.max(0, Math.floor(value)).toString().padStart(5, '0');
}

function updateLocalStats() {
  activeCount.textContent = String(GAMES.length).padStart(2, '0');
  runnerBest.textContent = pad(safeNumber('sod-runner-record-v1'));
  mazeBest.textContent = pad(safeNumber('sod-maze-record-v1'));
}

function previewMarkup(game) {
  const isMaze = game.visual === 'maze';
  return `
    <div class="game-art ${isMaze ? 'art-maze' : 'art-runner'}" aria-hidden="true">
      <div class="art-grid"></div>
      <div class="art-horizon"></div>
      <img class="art-player" src="/public/assets/player.png" alt="" />
      <img class="art-danger art-danger-a" src="/public/assets/${isMaze ? 'obstacle-distraccion' : 'obstacle-miedo'}.png" alt="" />
      <img class="art-danger art-danger-b" src="/public/assets/${isMaze ? 'obstacle-ruido' : 'obstacle-distraccion'}.png" alt="" />
      <img class="art-seed" src="/public/assets/semilla.png" alt="" />
      ${isMaze ? '<div class="maze-map"><i></i><i></i><i></i><i></i></div>' : '<div class="runner-ground"></div>'}
      <span class="card-play-glyph">▶</span>
    </div>`;
}

function renderGames() {
  grid.innerHTML = GAMES.map((game, index) => {
    const best = safeNumber(game.recordKey);
    return `
      <article class="game-card accent-${escapeHtml(game.accent)}" data-game-id="${escapeHtml(game.id)}" tabindex="0" aria-label="${escapeHtml(game.name)}">
        ${previewMarkup(game)}
        <div class="card-index">0${index + 1}</div>
        <div class="card-live"><i></i>${escapeHtml(game.status)}</div>
        <div class="card-body">
          <div class="card-family">${escapeHtml(game.family)} / ${escapeHtml(game.short)}</div>
          <h3>${escapeHtml(game.name)}</h3>
          <p>${escapeHtml(game.description)}</p>
          <div class="card-tags">${game.tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
          <div class="card-meta">
            <div><span>CONTROL</span><b>${escapeHtml(game.controls)}</b></div>
            <div><span>SESIÓN</span><b>${escapeHtml(game.session)}</b></div>
            <div><span>RÉCORD LOCAL</span><b>${pad(best)}</b></div>
          </div>
          <button class="card-cta" type="button" data-play="${escapeHtml(game.id)}"><span>JUGAR</span><b>→</b></button>
        </div>
      </article>`;
  }).join('');
}

function renderFuture() {
  futureGrid.innerHTML = FUTURE_SLOTS.map((slot, index) => `
    <article class="future-card">
      <span>0${GAMES.length + index + 1}</span>
      <div><b>${escapeHtml(slot.family)}</b><small>${escapeHtml(slot.label)}</small></div>
      <em>EN DISEÑO</em>
    </article>`).join('');
}

function setFeatured(game) {
  featuredGame = game;
  featuredCtaName.textContent = game.name;
  featuredFamily.textContent = game.family;
  featuredEyebrow.textContent = game.eyebrow;
  featuredName.textContent = game.name;
  featuredDescription.textContent = game.description;

  const stage = $('#heroStage');
  stage.dataset.visual = game.visual;
  const danger = stage.querySelector('.preview-danger');
  danger.src = `/public/assets/${game.visual === 'maze' ? 'obstacle-distraccion' : 'obstacle-miedo'}.png`;
}

function openGame(id, { updateUrl = true } = {}) {
  const game = GAMES.find(item => item.id === id);
  if (!game) return;

  activeGame = game;
  setFeatured(game);
  shellName.textContent = game.name;
  shellFamily.textContent = game.family;
  frameLoader.classList.remove('is-hidden');
  gameFrame.src = game.path;
  gameShell.classList.add('is-open');
  gameShell.setAttribute('aria-hidden', 'false');
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set('game', game.id);
    history.pushState({ game: game.id }, '', url);
  }
}

function closeGame({ updateUrl = true } = {}) {
  if (!gameShell.classList.contains('is-open')) return;
  gameShell.classList.remove('is-open');
  gameShell.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = previousOverflow;
  activeGame = null;
  gameFrame.src = 'about:blank';
  frameLoader.classList.remove('is-hidden');
  updateLocalStats();
  renderGames();

  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.delete('game');
    history.pushState({}, '', url);
  }
}

function syncFromUrl() {
  const id = new URL(location.href).searchParams.get('game');
  if (GAMES.some(game => game.id === id)) openGame(id, { updateUrl: false });
}

renderGames();
renderFuture();
updateLocalStats();
setFeatured(GAMES[0]);

playFeatured.addEventListener('click', () => openGame(featuredGame.id));
featuredPreview.addEventListener('click', () => openGame(featuredGame.id));

grid.addEventListener('pointerover', event => {
  const card = event.target.closest('[data-game-id]');
  if (!card) return;
  const game = GAMES.find(item => item.id === card.dataset.gameId);
  if (game) setFeatured(game);
});

grid.addEventListener('click', event => {
  const play = event.target.closest('[data-play]');
  if (play) return openGame(play.dataset.play);
  const card = event.target.closest('[data-game-id]');
  if (card) openGame(card.dataset.gameId);
});

grid.addEventListener('keydown', event => {
  const card = event.target.closest('[data-game-id]');
  if (!card || !['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  openGame(card.dataset.gameId);
});

closeGameBtn.addEventListener('click', () => closeGame());
reloadGameBtn.addEventListener('click', () => {
  if (!activeGame) return;
  frameLoader.classList.remove('is-hidden');
  const separator = activeGame.path.includes('?') ? '&' : '?';
  gameFrame.src = `${activeGame.path}${separator}r=${Date.now()}`;
});
fullscreenBtn.addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) await gameShell.requestFullscreen?.();
    else await document.exitFullscreen?.();
  } catch (error) {
    console.warn('Fullscreen unavailable', error);
  }
});

gameFrame.addEventListener('load', () => {
  if (gameFrame.src === 'about:blank') return;
  frameLoader.classList.add('is-hidden');
  try { gameFrame.contentWindow?.focus(); } catch {}
});

window.addEventListener('message', event => {
  const data = event.data;
  if (!data || data.type !== 'sod-game-event') return;
  if (['game-over', 'record', 'level-complete'].includes(data.event)) {
    updateLocalStats();
  }
});

window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && activeGame && !document.fullscreenElement) closeGame();
});
window.addEventListener('popstate', syncFromUrl);
window.addEventListener('storage', updateLocalStats);
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateLocalStats(); });
document.addEventListener('fullscreenchange', () => {
  fullscreenBtn.textContent = document.fullscreenElement ? 'SALIR DE FULLSCREEN' : 'PANTALLA COMPLETA';
});

syncFromUrl();

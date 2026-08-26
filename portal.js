import { GAMES, FUTURE_SLOTS } from './catalog.js';
const $ = s => document.querySelector(s);
const grid=$('#gameGrid'), futureGrid=$('#futureGrid'), shell=$('#gameShell'), frame=$('#gameFrame'), loader=$('#frameLoader');
let activeGame=null, previousOverflow='';
const escapeHtml=v=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const safeNumber=k=>{try{return Number(localStorage.getItem(k)||0)||0}catch{return 0}};
const pad=v=>Math.max(0,Math.floor(v)).toString().padStart(5,'0');

function renderGames(){
  $('#activeCount').textContent=String(GAMES.length).padStart(2,'0');
  grid.innerHTML=GAMES.map(game=>`<article class="game-card accent-${escapeHtml(game.accent)}" data-game-id="${game.id}" tabindex="0">
    <div class="game-art"><img src="${game.art}" alt="Arte de ${escapeHtml(game.name)}" loading="lazy"><span class="game-number">${game.number}</span><span class="live"><i></i>${game.status}</span><span class="art-play">▶</span></div>
    <div class="game-info"><div class="game-family">${game.family}</div><h3>${escapeHtml(game.name)}</h3><p>${escapeHtml(game.description)}</p>
    <div class="tags">${game.tags.map(t=>`<span>${t}</span>`).join('')}</div><div class="game-bottom"><div><small>RÉCORD LOCAL</small><strong>${pad(safeNumber(game.recordKey))}</strong></div><button type="button" data-play="${game.id}">JUGAR <b>→</b></button></div></div>
  </article>`).join('');
}
function renderFuture(){futureGrid.innerHTML=FUTURE_SLOTS.map((s,i)=>`<article class="future-card" style="--pos:${s.position}"><div class="future-art"></div><span>0${i+3}</span><div><small>PRÓXIMAMENTE</small><h3>${s.family}</h3><p>${s.label}</p></div></article>`).join('')}
function openGame(id,{updateUrl=true}={}){const game=GAMES.find(g=>g.id===id);if(!game)return;activeGame=game;$('#shellName').textContent=game.name;$('#shellFamily').textContent=game.family;loader.classList.remove('is-hidden');frame.src=game.path;shell.classList.add('is-open');shell.setAttribute('aria-hidden','false');previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';if(updateUrl){const url=new URL(location.href);url.searchParams.set('game',id);history.pushState({game:id},'',url)}setTimeout(()=>$('#closeGame').focus(),120)}
function closeGame({updateUrl=true}={}){if(!shell.classList.contains('is-open'))return;shell.classList.remove('is-open');shell.setAttribute('aria-hidden','true');document.body.style.overflow=previousOverflow;activeGame=null;frame.src='about:blank';loader.classList.remove('is-hidden');renderGames();if(updateUrl){const url=new URL(location.href);url.searchParams.delete('game');history.pushState({},'',url)}}
function sync(){const id=new URL(location.href).searchParams.get('game');if(GAMES.some(g=>g.id===id))openGame(id,{updateUrl:false});else closeGame({updateUrl:false})}
renderGames();renderFuture();
$('#playFeatured').addEventListener('click',()=>openGame('runner'));$('#featuredPreview').addEventListener('click',()=>openGame('runner'));
grid.addEventListener('click',e=>{const target=e.target.closest('[data-play],[data-game-id]');if(target)openGame(target.dataset.play||target.dataset.gameId)});
grid.addEventListener('keydown',e=>{const card=e.target.closest('[data-game-id]');if(card&&['Enter',' '].includes(e.key)){e.preventDefault();openGame(card.dataset.gameId)}});
$('#closeGame').addEventListener('click',()=>closeGame());$('#reloadGame').addEventListener('click',()=>{if(activeGame){loader.classList.remove('is-hidden');frame.src=`${activeGame.path}&r=${Date.now()}`} });
$('#fullscreenGame').addEventListener('click',async()=>{try{if(!document.fullscreenElement)await shell.requestFullscreen?.();else await document.exitFullscreen?.()}catch(e){console.warn('Fullscreen unavailable',e)}});
frame.addEventListener('load',()=>{if(frame.src!=='about:blank'){loader.classList.add('is-hidden');try{frame.contentWindow?.focus()}catch{}}});
window.addEventListener('message',e=>{if(!e.data||e.data.type !== 'sod-game-event')return;if(['game-over','record','level-complete'].includes(e.data.event))renderGames()});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&activeGame&&!document.fullscreenElement)closeGame()});window.addEventListener('popstate',sync);window.addEventListener('storage',renderGames);document.addEventListener('fullscreenchange',()=>{$('#fullscreenGame span').textContent=document.fullscreenElement?'SALIR':'PANTALLA COMPLETA'});sync();

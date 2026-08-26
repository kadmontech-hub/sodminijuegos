export const GAMES = [
  { id:'runner', name:'SØD Runner', family:'FLOW', number:'01', short:'Dominá la altura.', description:'Impulsos infinitos, velocidad creciente y decisiones en una fracción de segundo.', path:'/games/runner/?embed=1', standalonePath:'/games/runner/', status:'JUGABLE', controls:'Tap · Click · Espacio', session:'30s—3m', accent:'cyan', art:'/public/assets/v3/runner-key-art.png', recordKey:'sod-runner-record-v1', tags:['Arcade','Reflejos','Flow'] },
  { id:'maze', name:'SØD Maze', family:'INSIGHT', number:'02', short:'Leé el sistema.', description:'Trazá tu ruta, activá Claridad y convertí la persecución en ventaja.', path:'/games/maze/?embed=1', standalonePath:'/games/maze/', status:'JUGABLE', controls:'Flechas · WASD · Swipe', session:'2—6m', accent:'violet', art:'/public/assets/v3/maze-key-art.png', recordKey:'sod-maze-record-v1', tags:['Arcade','Estrategia','Ruta'] }
];
export const FUTURE_SLOTS = [
  { family:'FOCUS', label:'Precisión', position:'0% 0%' }, { family:'MEMORY', label:'Recuerdo', position:'50% 0%' }, { family:'RHYTHM', label:'Pulso', position:'100% 0%' },
  { family:'STRATEGY', label:'Decisión', position:'0% 100%' }, { family:'BALANCE', label:'Control', position:'50% 100%' }, { family:'WILL', label:'Presión', position:'100% 100%' }
];

export const GAMES = [
  {
    id: 'runner',
    name: 'SØD Runner',
    family: 'FLOW',
    eyebrow: 'FLOW · REFLEJOS · PRECISIÓN',
    short: 'Dominá el pulso.',
    description: 'Un arcade de altura y lectura instantánea. Encadená impulsos, atravesá interferencias y sostené el ritmo mientras la velocidad escala.',
    path: '/games/runner/?embed=1',
    standalonePath: '/games/runner/',
    status: 'JUGABLE',
    controls: 'Tap · Click · Espacio',
    session: '30s–3m',
    difficulty: 'DINÁMICA',
    accent: 'cyan',
    visual: 'runner',
    recordKey: 'sod-runner-record-v1',
    tags: ['Arcade', 'Reflejos', 'Flow']
  },
  {
    id: 'maze',
    name: 'SØD Maze',
    family: 'INSIGHT',
    eyebrow: 'INSIGHT · ESTRATEGIA · RUTA',
    short: 'Leé el sistema.',
    description: 'Un laberinto de decisión continua. Recolectá fragmentos, activá Claridad y convertí la persecución en ventaja sin perder la ruta.',
    path: '/games/maze/?embed=1',
    standalonePath: '/games/maze/',
    status: 'JUGABLE',
    controls: 'Flechas · WASD · Swipe',
    session: '2–6m',
    difficulty: 'PROGRESIVA',
    accent: 'gold',
    visual: 'maze',
    recordKey: 'sod-maze-record-v1',
    tags: ['Arcade', 'Estrategia', 'Ruta']
  }
];

export const FUTURE_SLOTS = [
  { family: 'FOCUS', label: 'Precisión' },
  { family: 'BALANCE', label: 'Riesgo / control' },
  { family: 'WILL', label: 'Presión' },
  { family: 'CONNECTION', label: 'Cooperación' }
];

# Minijuegos SØD — PRIME

Portal arcade web del universo SØD. Esta versión reestructura el portal alrededor de una idea simple: **entrar y jugar rápido**.

## Juegos incluidos

- **SØD Runner** — FLOW / reflejos / precisión. Impulsos aéreos sin límite artificial, lectura de obstáculos y velocidad creciente.
- **SØD Maze** — INSIGHT / ruta / estrategia. Laberinto, persecución, Semillas que invierten temporalmente la relación cazador-presa.

## Arquitectura

```text
/
├── index.html
├── styles.css
├── portal.js
├── catalog.js
├── build.mjs
├── tests.mjs
├── package.json
├── vercel.json
├── public/assets/
└── games/
    ├── runner/
    └── maze/
```

Cada juego se carga de forma independiente dentro del portal mediante iframe same-origin. Los juegos emiten eventos livianos al portal con `postMessage`, y el portal puede leer los récords locales sin crear todavía un backend o metaeconomía innecesaria.

## Agregar un nuevo juego

1. Crear `games/<id>/index.html`, `styles.css` y `game.js`.
2. Registrar el juego en `catalog.js`.
3. Ejecutar `npm run verify`.
4. Deployar.

El build deriva la lista de juegos desde `catalog.js`, evitando mantener listas duplicadas.

## Validación

```bash
npm run verify
```

## Vercel

- Build command: `npm run build`
- Output directory: `dist`
- No variables de entorno requeridas.

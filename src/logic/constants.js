export const ROYALE_DEFAULT_SIZE = 80;
export const ROYALE_MIN_SIZE = 30;
export const ROYALE_MAX_SIZE = 120;
export const ROYALE_VIEW_SIZE = 10;
export const ROYALE_GIANT_SIZE = 5;
export const ROYALE_MAX_CARDS = 6;
export const ROYALE_BASIC_PIECES = ['K', 'Q', 'R', 'B', 'N'];
export const ROYALE_IMPROVED_PIECES = ['K', 'Q', 'R', 'B', 'N'];
export const ROYALE_TACTIC_CARDS = ['reveal', 'fog', 'scorched', 'wall', 'secondChance'];
export const ROYALE_SOUNDS = {
  battleMusic: '/sounds/royale-battle.mp3',
  gameStart: '/sounds/royale-start.mp3',
  gameEnd: '/sounds/royale-end.mp3',
  move: '/sounds/royale-move.mp3',
  giantMove: '/sounds/royale-giant.mp3',
  kill: '/sounds/royale-kill.mp3',
  death: '/sounds/royale-death.mp3',
};
export const ROYALE_TACTIC_META = {
  reveal: { label: 'Vision', symbol: '\u25C9', target: false },
  fog: { label: 'Niebla de Guerra', symbol: '\u2593', target: false },
  scorched: { label: 'Tierra Quemada', symbol: '\u2622', target: true },
  wall: { label: 'Muro de Peones', symbol: '\u265F', target: true },
  secondChance: { label: 'Segunda Oportunidad', symbol: '\u267B', target: false },
};
export const ROYALE_GIANT_PIECES = [
  { id: 'giant-knight', type: 'N', name: 'Caballo gigante', color: '#9ad7ff' },
  { id: 'giant-king', type: 'K', name: 'Rey gigante', color: '#f0cf5a' },
  { id: 'giant-bishop', type: 'B', name: 'Alfil gigante', color: '#c792ea' },
];
export const ROYALE_PLAYERS = [
  { id: 'p1', name: 'Jugador 1', color: '#f7f0d2', pieceColor: 'w' },
  { id: 'p2', name: 'Jugador 2', color: '#77d8ff', pieceColor: 'b' },
  { id: 'p3', name: 'Jugador 3', color: '#ff7676', pieceColor: 'b' },
  { id: 'p4', name: 'Jugador 4', color: '#8cff9c', pieceColor: 'b' },
  { id: 'p5', name: 'Jugador 5', color: '#ffb86b', pieceColor: 'b' },
  { id: 'p6', name: 'Jugador 6', color: '#c792ea', pieceColor: 'b' },
  { id: 'p7', name: 'Jugador 7', color: '#80cbc4', pieceColor: 'b' },
  { id: 'p8', name: 'Jugador 8', color: '#f78fb3', pieceColor: 'b' },
];

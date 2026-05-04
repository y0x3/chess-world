/**
 * Motor compartido ChessRoyale: estado inicial y reducers usados por cliente y servidor.
 * El RNG se inyecta (Math.random en cliente, servidor autoritativo).
 */
import { PIECES } from '../shared/pieces.js';
import {
  makeRoyaleCard,
  getRoyaleCardLabel,
  addRoyaleCards,
  createWallPawns as createWallPawnsBase,
  createScorchedArea as createScorchedAreaBase,
  applyTargetedTactic as applyTargetedTacticBase,
  playRoyaleCardState as playRoyaleCardStateBase,
  applyGiantPieceDamage as applyGiantPieceDamageBase,
  applyGiantMove as applyGiantMoveBase,
  moveRoyalePlayer as moveRoyalePlayerBase,
  applyRoyaleRolloff as applyRoyaleRolloffBase,
} from './actions.js';
import {
  royaleKey,
  clampRoyaleMapSize,
  clampRoyaleLives,
  defaultRoyaleMapSize,
  getRoyaleSize,
  inRoyaleBounds,
  royaleDistance,
  royaleZoneDistance,
  getRoyaleViewOrigin,
} from './geometry.js';
import {
  getGiantPieceAt,
  giantPieceCells,
  isGiantPlacementClear,
  getGiantLegalMoves as getGiantLegalMovesBase,
  isGiantMoveValid,
  isInGiantPiece,
  getRoyalePlayerAt,
  getNeutralPawnAt,
  getRadioactiveCellAt,
  isRoyaleLineBlocked,
  isRoyaleMoveValid as isRoyaleMoveValidBase,
  getRoyaleLegalMoves as getRoyaleLegalMovesBase,
} from './movements.js';
import {
  ROYALE_DEFAULT_SIZE,
  ROYALE_VIEW_SIZE,
  ROYALE_GIANT_SIZE,
  ROYALE_MAX_CARDS,
  ROYALE_BASIC_PIECES,
  ROYALE_IMPROVED_PIECES,
  ROYALE_TACTIC_CARDS,
  ROYALE_TACTIC_META,
  ROYALE_GIANT_PIECES,
  ROYALE_PLAYERS,
} from './constants.js';

export const keepRoyaleEvents = events => events.slice(-40);

function royaleStartRadius(size) {
  return Math.ceil((size - 1) * 0.72);
}
function royaleMinRadius(size) {
  return Math.max(5, Math.floor(size * 0.1));
}
function royaleShrinkPerRound(size) {
  return Math.max(1, Math.round(size / 40));
}
function royaleSpawnDistance(size) {
  return Math.max(8, Math.floor(size * 0.35));
}

function getDefaultRoyaleSpecialCounts(size) {
  const areaScale = (size * size) / (80 * 80);
  return {
    basic: Math.max(20, Math.round(120 * areaScale)),
    improved: Math.max(10, Math.round(56 * areaScale)),
    reveal: Math.max(8, Math.round(44 * areaScale)),
    special: Math.max(6, Math.round(32 * areaScale)),
  };
}

function getRoyaleSpecialCounts(size, counts = {}) {
  const defaults = getDefaultRoyaleSpecialCounts(size);
  return {
    basic: Math.max(0, Number.isFinite(Number(counts.basic)) ? Math.floor(Number(counts.basic)) : defaults.basic),
    improved: Math.max(0, Number.isFinite(Number(counts.improved)) ? Math.floor(Number(counts.improved)) : defaults.improved),
    reveal: Math.max(0, Number.isFinite(Number(counts.reveal)) ? Math.floor(Number(counts.reveal)) : defaults.reveal),
    special: Math.max(0, Number.isFinite(Number(counts.special)) ? Math.floor(Number(counts.special)) : defaults.special),
  };
}

function buildRoyaleZone(size, center, radius) {
  const closedCells = {};
  let closedCount = 0;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (royaleZoneDistance(row, col, center) > radius) {
        closedCells[royaleKey(row, col)] = true;
        closedCount++;
      }
    }
  }
  return { closedCells, closedCount };
}

export function transferEliminatedCards(players, killerId, victimId, stolenCards = []) {
  const cards = stolenCards.filter(Boolean);
  return players.map(player => {
    if (player.id === victimId) return { ...player, cards: [] };
    if (cards.length && player.id === killerId && player.alive) {
      return { ...player, cards: addRoyaleCards(player.cards || [], cards) };
    }
    return player;
  });
}

export function nextAliveTurnIndex(players, turnOrder, currentTurnIndex) {
  for (let i = 1; i <= turnOrder.length; i++) {
    const nextIndex = (currentTurnIndex + i) % turnOrder.length;
    const nextPlayer = players.find(p => p.id === turnOrder[nextIndex]);
    if (nextPlayer?.alive) return nextIndex;
  }
  return currentTurnIndex;
}

export function getTurnsUntilPlayer(gs, playerId) {
  if (gs.phase !== 'battle' || !gs.turnOrder.length) return 0;
  for (let i = 0; i < gs.turnOrder.length; i++) {
    const index = (gs.currentTurnIndex + i) % gs.turnOrder.length;
    const player = gs.players.find(p => p.id === gs.turnOrder[index]);
    if (!player?.alive) continue;
    if (player.id === playerId) return i;
  }
  return 0;
}

function applyRoyaleSpecial(player, specialType, randomInt) {
  if (specialType === 'basic') {
    const type = ROYALE_BASIC_PIECES[randomInt(ROYALE_BASIC_PIECES.length)];
    const card = makeRoyaleCard(specialType, type);
    const cards = player.cards || [];
    if (cards.length >= ROYALE_MAX_CARDS) return { player, text: 'Casilla basica: mano llena, no puedes tomar mas cartas.', card: null };
    return {
      player: { ...player, cards: addRoyaleCards(cards, [card]) },
      text: `Casilla basica: robaste carta de ${PIECES[type].label}.`,
      card,
    };
  }
  if (specialType === 'improved') {
    const type = ROYALE_IMPROVED_PIECES[randomInt(ROYALE_IMPROVED_PIECES.length)];
    const card = makeRoyaleCard(specialType, type);
    const cards = player.cards || [];
    if (cards.length >= ROYALE_MAX_CARDS) return { player, text: 'Casilla mejorada: mano llena, no puedes tomar mas cartas.', card: null };
    return {
      player: { ...player, cards: addRoyaleCards(cards, [card]) },
      text: `Casilla mejorada: robaste carta de ${PIECES[type].label} mejorada.`,
      card,
    };
  }
  if (specialType === 'reveal') {
    const effect = ROYALE_TACTIC_CARDS[randomInt(ROYALE_TACTIC_CARDS.length)];
    const card = makeRoyaleCard(specialType, null, effect);
    const cards = player.cards || [];
    if (cards.length >= ROYALE_MAX_CARDS) return { player, text: 'Casilla tactica: mano llena, no puedes tomar mas cartas.', card: null };
    return {
      player: { ...player, cards: addRoyaleCards(cards, [card]) },
      text: `Casilla tactica: robaste ${getRoyaleCardLabel(card)}.`,
      card,
    };
  }
  if (specialType === 'special') {
    return { player, text: 'Casilla especial: puedes mover una pieza gigante.' };
  }
  return { player, text: '' };
}

function shrinkRoyaleZone(gs) {
  const size = getRoyaleSize(gs);
  const nextRadius = Math.max(royaleMinRadius(size), gs.zoneRadius - royaleShrinkPerRound(size));
  const nextZone = buildRoyaleZone(size, gs.zoneCenter, nextRadius);
  return {
    zoneRadius: nextRadius,
    closedCells: nextZone.closedCells,
    closedCount: nextZone.closedCount,
    added: Math.max(0, nextZone.closedCount - gs.closedCount),
  };
}

function applyClosedZoneDamage(players, closedCells, turnInfo = {}, randomInt) {
  const size = turnInfo.mapSize || ROYALE_DEFAULT_SIZE;
  let message = '';
  const events = [];
  const giantPieces = turnInfo.giantPieces || [];
  const occupied = occupiedSquaresWithGiants(
    players.filter(p => !closedCells[royaleKey(p.row, p.col)]),
    giantPieces
  );
  const updated = players.map(player => {
    if (!player.alive || !closedCells[royaleKey(player.row, player.col)]) return player;
    const lives = player.lives - 1;
    message += ` ${player.name} quedo en zona cerrada y pierde una vida.`;
    if (lives <= 0) {
      if (player.secondChance) {
        const edge = randomRoyaleEdgeSquare(size, occupied, closedCells, randomInt);
        if (edge) {
          occupied.add(royaleKey(edge.row, edge.col));
          message += ` ${player.name} activo Segunda Oportunidad y reaparece en el borde.`;
          return { ...player, lives: 1, row: edge.row, col: edge.col, type: 'K', boosted: false, temporaryPower: false, pendingPower: null, cards: [], revealEnemies: false, secondChance: false };
        }
      }
      events.push({
        id: `zone-${Date.now()}-${player.id}-${turnInfo.turn || 0}`,
        type: 'zone-death',
        text: `${player.name} murio por la zona.`,
        victimId: player.id,
        victimName: player.name,
        at: { row: player.row, col: player.col },
        turn: turnInfo.turn,
        radius: turnInfo.radius,
        mapSize: size,
      });
      return { ...player, lives: 0, alive: false, cards: [] };
    }
    const respawn = randomRoyaleSquare(size, occupied, closedCells, randomInt);
    occupied.add(royaleKey(respawn.row, respawn.col));
    return { ...player, lives, row: respawn.row, col: respawn.col, type: 'K', boosted: false, temporaryPower: false, pendingPower: null, cards: [], revealEnemies: false };
  });
  return { players: updated, message, events };
}

function randomRoyaleSquare(size = ROYALE_DEFAULT_SIZE, occupied = new Set(), closedCells = {}, randomInt) {
  for (let i = 0; i < 1000; i++) {
    const row = randomInt(size);
    const col = randomInt(size);
    const key = royaleKey(row, col);
    if (!occupied.has(key) && !closedCells[key]) return { row, col };
  }
  return { row: randomInt(size), col: randomInt(size) };
}

function randomRoyaleEdgeSquare(size, occupied = new Set(), closedCells = {}, randomInt) {
  const edges = [];
  for (let i = 0; i < size; i++) {
    edges.push({ row: 0, col: i }, { row: size - 1, col: i }, { row: i, col: 0 }, { row: i, col: size - 1 });
  }
  const available = edges.filter(pos => !occupied.has(royaleKey(pos.row, pos.col)) && !closedCells[royaleKey(pos.row, pos.col)]);
  if (!available.length) return null;
  return available[randomInt(available.length)];
}

function randomSeparatedRoyaleSquare(size, existingPlayers, occupied, randomInt) {
  const minDistance = royaleSpawnDistance(size);
  for (let i = 0; i < 2000; i++) {
    const pos = randomRoyaleSquare(size, occupied, {}, randomInt);
    if (existingPlayers.every(player => royaleDistance(player, pos) >= minDistance)) return pos;
  }
  return randomRoyaleSquare(size, occupied, {}, randomInt);
}

function generateRoyaleSpecials(size, playerPositions = [], blockedPositions = [], counts = null, randomInt) {
  const specials = {};
  const occupied = new Set(playerPositions.map(p => royaleKey(p.row, p.col)));
  blockedPositions.forEach(pos => occupied.add(royaleKey(pos.row, pos.col)));
  const specialCounts = getRoyaleSpecialCounts(size, counts);
  const addCells = (type, count) => {
    const safeCount = Math.min(count, Math.max(0, size * size - occupied.size));
    for (let i = 0; i < safeCount; i++) {
      const pos = randomRoyaleSquare(size, occupied, {}, randomInt);
      const key = royaleKey(pos.row, pos.col);
      specials[key] = type;
      occupied.add(key);
    }
  };
  addCells('basic', specialCounts.basic);
  addCells('improved', specialCounts.improved);
  addCells('reveal', specialCounts.reveal);
  addCells('special', specialCounts.special);
  return specials;
}

function randomGiantSquare(size, occupied = new Set(), closedCells = {}, giantPieces = [], randomInt) {
  const maxAnchor = size - ROYALE_GIANT_SIZE + 1;
  for (let i = 0; i < 1500; i++) {
    const row = randomInt(maxAnchor);
    const col = randomInt(maxAnchor);
    const candidate = { row, col };
    const cells = giantPieceCells(candidate);
    if (cells.every(cell => !occupied.has(royaleKey(cell.row, cell.col))) && isGiantPlacementClear(size, candidate, closedCells, giantPieces)) {
      return candidate;
    }
  }
  return { row: randomInt(maxAnchor), col: randomInt(maxAnchor) };
}

function generateRoyaleGiantPieces(size, players, closedCells = {}, randomInt) {
  const occupied = new Set(players.map(player => royaleKey(player.row, player.col)));
  return ROYALE_GIANT_PIECES.reduce((acc, template) => {
    const pos = randomGiantSquare(size, occupied, closedCells, acc, randomInt);
    const piece = { ...template, ...pos };
    giantPieceCells(piece).forEach(cell => occupied.add(royaleKey(cell.row, cell.col)));
    acc.push(piece);
    return acc;
  }, []);
}

export function occupiedSquaresWithGiants(players, giantPieces, exceptPlayerId = null) {
  const occupied = new Set(players.filter(p => p.alive && p.id !== exceptPlayerId).map(p => royaleKey(p.row, p.col)));
  giantPieces.forEach(piece => giantPieceCells(piece).forEach(cell => occupied.add(royaleKey(cell.row, cell.col))));
  return occupied;
}

/**
 * @param {(max: number) => number} randomInt entero en [0, max)
 */
export function createRoyaleEngine(randomInt) {
  const isRoyaleMoveValid = (type, from, to, distance, boosted, size = getRoyaleSize(from)) =>
    isRoyaleMoveValidBase(type, from, to, distance, boosted, size);

  const getRoyaleLegalMoves = (gs, player, roll) => getRoyaleLegalMovesBase(gs, player, roll, getRoyaleViewOrigin);

  const getGiantLegalMoves = (gs, giant) => getGiantLegalMovesBase(gs, giant);

  const createWallPawns = (gs, playerId, center) =>
    createWallPawnsBase(gs, playerId, center, { getRoyaleSize, occupiedSquaresWithGiants, royaleKey, inRoyaleBounds, randomInt });

  const createScorchedArea = (gs, playerId, target) =>
    createScorchedAreaBase(gs, playerId, target, { getRoyaleSize, inRoyaleBounds, royaleKey, randomInt });

  const applyTargetedTactic = (gs, playerId, card, target) =>
    applyTargetedTacticBase(gs, playerId, card, target, {
      createScorchedArea,
      createWallPawns,
      royaleKey,
      nextAliveTurnIndex,
    });

  const playRoyaleCardState = (gs, playerId, cardId) =>
    playRoyaleCardStateBase(gs, playerId, cardId, { applyTargetedTacticMeta: ROYALE_TACTIC_META, getRoyaleCardLabel });

  const applyGiantPieceDamage = (players, giantPieces, movedGiant, closedCells, mapSize, actor = {}) =>
    applyGiantPieceDamageBase(players, giantPieces, movedGiant, closedCells, mapSize, actor, {
      giantPieceCells,
      royaleKey,
      randomRoyaleEdgeSquare: (size, occ, closed) => randomRoyaleEdgeSquare(size, occ, closed, randomInt),
      randomRoyaleSquare: (size, occ, closed) => randomRoyaleSquare(size, occ, closed, randomInt),
      occupiedSquaresWithGiants,
      transferEliminatedCards,
    });

  const applyGiantMove = (gs, actorId, giantId, destination) =>
    applyGiantMoveBase(gs, actorId, giantId, destination, {
      getRoyaleSize,
      isGiantMoveValid,
      isGiantPlacementClear,
      applyGiantPieceDamage,
    });

  const applyRoyaleSpecialBound = (player, specialType) => applyRoyaleSpecial(player, specialType, randomInt);

  const chooseRandomMovableGiant = gs => {
    const movable = (gs.giantPieces || []).filter(giant => getGiantLegalMoves(gs, giant).length);
    if (!movable.length) return null;
    return movable[randomInt(movable.length)];
  };

  const chooseAutomaticGiantMove = gs => {
    const giant = chooseRandomMovableGiant(gs);
    if (!giant) return null;
    const options = getGiantLegalMoves(gs, giant).map(move => ({ giant, move }));
    if (!options.length) return null;
    const attackOptions = options.filter(option => {
      const moved = { ...option.giant, ...option.move };
      return gs.players.some(player => player.alive && isInGiantPiece(moved, player.row, player.col));
    });
    const pool = attackOptions.length ? attackOptions : options;
    return pool[randomInt(pool.length)];
  };

  const moveRoyalePlayer = (gs, destination) =>
    moveRoyalePlayerBase(gs, destination, {
      getRoyaleSize,
      royaleKey,
      getGiantPieceAt,
      getNeutralPawnAt,
      isRoyaleLineBlocked,
      isRoyaleMoveValid,
      occupiedSquaresWithGiants,
      getRoyalePlayerAt,
      randomRoyaleEdgeSquare: (size, occ, closed) => randomRoyaleEdgeSquare(size, occ, closed, randomInt),
      randomRoyaleSquare: (size, occ, closed) => randomRoyaleSquare(size, occ, closed, randomInt),
      transferEliminatedCards,
      applyRoyaleSpecial: applyRoyaleSpecialBound,
      chooseAutomaticGiantMove,
      applyGiantMove,
      chooseRandomMovableGiant,
      getRadioactiveCellAt,
      nextAliveTurnIndex,
      shrinkRoyaleZone,
      applyClosedZoneDamage: (players, closedCells, turnInfo) => applyClosedZoneDamage(players, closedCells, turnInfo, randomInt),
      keepRoyaleEvents,
    });

  const applyRoyaleRolloff = (gs, playerId, forcedRoll = null) =>
    applyRoyaleRolloffBase(gs, playerId, forcedRoll, { randomInt });

  function initChessRoyale(config = {}) {
    const playerCount = Math.max(2, Math.min(ROYALE_PLAYERS.length, Number(config.playerCount) || 4));
    const mapSize = clampRoyaleMapSize(config.mapSize || defaultRoyaleMapSize(playerCount));
    const zoneStartRadius = royaleStartRadius(mapSize);
    const vsBots = Boolean(config.vsBots);
    const debugMode = Boolean(config.debugMode);
    const initialLives = clampRoyaleLives(config.initialLives);
    const humanName = config.humanName?.trim() || 'Tu';
    const playerNames = Array.isArray(config.playerNames) ? config.playerNames : null;
    const specialCounts = getRoyaleSpecialCounts(mapSize, config.specialCounts);
    const playerTemplates = ROYALE_PLAYERS.slice(0, playerCount).map((player, index) => ({
      ...player,
      name: playerNames?.[index] ?? (index === 0 ? humanName : `Bot ${index + 1}`),
      isBot: vsBots && index !== 0,
      isHuman: !vsBots || index === 0,
    }));
    const occupied = new Set();
    const zoneCenter = { row: (mapSize - 1) / 2, col: (mapSize - 1) / 2 };
    const initialZone = buildRoyaleZone(mapSize, zoneCenter, zoneStartRadius);
    const players = playerTemplates.reduce((acc, player) => {
      const pos = randomSeparatedRoyaleSquare(mapSize, acc, occupied, randomInt);
      occupied.add(royaleKey(pos.row, pos.col));
      acc.push({
        ...player,
        ...pos,
        lives: initialLives,
        alive: true,
        type: 'K',
        boosted: false,
        temporaryPower: false,
        pendingPower: null,
        cards: [],
        revealEnemies: false,
        secondChance: false,
        lastRoll: null,
        trappedTurns: 0,
      });
      return acc;
    }, []);
    const giantPieces = generateRoyaleGiantPieces(mapSize, players, initialZone.closedCells, randomInt);

    return {
      phase: 'rolloff',
      config: { playerCount, vsBots, humanName, mapSize, initialLives, debugMode, specialCounts, playerNames: playerNames || undefined },
      mapSize,
      players,
      giantPieces,
      neutralPawns: [],
      fogZones: [],
      radioactiveCells: [],
      specials: generateRoyaleSpecials(mapSize, players, giantPieces.flatMap(giantPieceCells), specialCounts, randomInt),
      zoneCenter,
      zoneRadius: zoneStartRadius,
      closedCells: initialZone.closedCells,
      closedCount: initialZone.closedCount,
      roundsCompleted: 0,
      roundMoves: [],
      rolloff: {},
      turnOrder: [],
      currentTurnIndex: 0,
      currentRoll: null,
      cardUsedThisTurn: false,
      vsBots,
      debugMode,
      humanPlayerId: 'p1',
      botThinkingPlayerId: null,
      minimapPlayerId: null,
      selectedPlayerId: null,
      pendingTacticCard: null,
      giantMove: null,
      events: [],
      lastDeathEvent: null,
      message: 'Tira el dado por cada jugador. El mayor inicia la partida.',
      winner: null,
    };
  }

  function applyBattleRoll(gs, roll) {
    const current = gs.players.find(p => p.id === gs.turnOrder[gs.currentTurnIndex]);
    const rollText = current?.boosted ? `${roll} con dado mejorado` : roll;
    return {
      ...gs,
      currentRoll: roll,
      minimapPlayerId: roll > ROYALE_VIEW_SIZE ? current?.id : null,
      selectedPlayerId: current?.id,
      players: gs.players.map(p => p.id === current?.id ? { ...p, lastRoll: roll } : p),
      message: `${current?.name} saco ${rollText}. Elige una casilla iluminada.`,
    };
  }

  function mergeGiantMoveOutcome(prevGs, result) {
    const events = keepRoyaleEvents([...(prevGs.events || []), ...result.events]);
    const lastDeathEvent =
      result.events.find(event => event.victimId === prevGs.humanPlayerId && event.type === 'giant-death') || prevGs.lastDeathEvent;
    const alive = result.players.filter(player => player.alive);
    const human = prevGs.vsBots ? result.players.find(player => player.id === prevGs.humanPlayerId) : null;

    if (prevGs.vsBots && human && !human.alive) {
      return {
        ...prevGs,
        players: result.players,
        giantPieces: result.giantPieces,
        events,
        lastDeathEvent,
        phase: 'result',
        winner: alive[0]?.id || null,
        giantMove: null,
        minimapPlayerId: null,
        selectedPlayerId: null,
        currentRoll: null,
        botThinkingPlayerId: null,
        message: 'Has sido eliminado por una pieza gigante.',
      };
    }

    if (alive.length === 1) {
      return {
        ...prevGs,
        players: result.players,
        giantPieces: result.giantPieces,
        events,
        lastDeathEvent,
        phase: 'result',
        winner: alive[0].id,
        giantMove: null,
        minimapPlayerId: null,
        selectedPlayerId: null,
        currentRoll: null,
        message: `${alive[0].name} gana ChessRoyale.`,
      };
    }

    return {
      ...prevGs,
      players: result.players,
      giantPieces: result.giantPieces,
      events,
      lastDeathEvent,
      giantMove: null,
      minimapPlayerId: null,
      selectedPlayerId: null,
      message: result.message,
    };
  }

  return {
    randomInt,
    initChessRoyale,
    moveRoyalePlayer,
    applyGiantMove,
    applyGiantPieceDamage,
    playRoyaleCardState,
    applyTargetedTactic,
    applyRoyaleRolloff,
    applyBattleRoll,
    mergeGiantMoveOutcome,
    getRoyaleLegalMoves,
    getGiantLegalMoves,
    chooseAutomaticGiantMove,
    chooseRandomMovableGiant,
    isRoyaleMoveValid,
    getRoyaleViewOrigin,
    royaleKey,
    keepRoyaleEvents,
  };
}

const browserRandom = max => Math.floor(Math.random() * max);
export const royaleEngineBrowser = createRoyaleEngine(browserRandom);

export const initChessRoyale = config => royaleEngineBrowser.initChessRoyale(config);
export const moveRoyalePlayer = (gs, d) => royaleEngineBrowser.moveRoyalePlayer(gs, d);
export const applyGiantMove = (gs, a, g, d) => royaleEngineBrowser.applyGiantMove(gs, a, g, d);
export const playRoyaleCardState = (gs, p, c) => royaleEngineBrowser.playRoyaleCardState(gs, p, c);
export const applyTargetedTactic = (gs, p, card, t) => royaleEngineBrowser.applyTargetedTactic(gs, p, card, t);
export const applyRoyaleRolloff = (gs, p, f) => royaleEngineBrowser.applyRoyaleRolloff(gs, p, f);
export const applyBattleRoll = (gs, r) => royaleEngineBrowser.applyBattleRoll(gs, r);
export const mergeGiantMoveOutcome = (prev, r) => royaleEngineBrowser.mergeGiantMoveOutcome(prev, r);

export const getRoyaleLegalMoves = (gs, player, roll) => royaleEngineBrowser.getRoyaleLegalMoves(gs, player, roll);
export const getGiantLegalMoves = (gs, giant) => royaleEngineBrowser.getGiantLegalMoves(gs, giant);
export const chooseAutomaticGiantMove = gs => royaleEngineBrowser.chooseAutomaticGiantMove(gs);
export const chooseRandomMovableGiant = gs => royaleEngineBrowser.chooseRandomMovableGiant(gs);

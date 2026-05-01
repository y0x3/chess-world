import { useEffect, useRef, useState } from 'react';
import { PIECES } from './shared/pieces';
import { chooseBotRoyaleMove as chooseBotRoyaleMoveBase, chooseBotRoyaleCard as chooseBotRoyaleCardBase } from './ai/botBrain';
import RoyaleBoard from './components/RoyaleBoard';
import RoyaleMinimap, { RoyaleClosingMinimap, RoyaleGiantMinimap } from './components/RoyaleMinimap';
import {
  ROYALE_DEFAULT_SIZE,
  ROYALE_MIN_SIZE,
  ROYALE_MAX_SIZE,
  ROYALE_VIEW_SIZE,
  ROYALE_GIANT_SIZE,
  ROYALE_MAX_CARDS,
  ROYALE_BASIC_PIECES,
  ROYALE_IMPROVED_PIECES,
  ROYALE_TACTIC_CARDS,
  ROYALE_SOUNDS,
  ROYALE_TACTIC_META,
  ROYALE_GIANT_PIECES,
  ROYALE_PLAYERS,
} from './logic/constants';
import {
  makeRoyaleCard,
  getRoyaleCardLabel,
  getRoyaleCardSymbol,
  getRoyaleCardKind,
  addRoyaleCards,
  playRoyaleSound,
  createWallPawns as createWallPawnsBase,
  createScorchedArea as createScorchedAreaBase,
  applyTargetedTactic as applyTargetedTacticBase,
  playRoyaleCardState as playRoyaleCardStateBase,
  applyGiantPieceDamage as applyGiantPieceDamageBase,
  applyGiantMove as applyGiantMoveBase,
  moveRoyalePlayer as moveRoyalePlayerBase,
  applyRoyaleRolloff as applyRoyaleRolloffBase,
} from './logic/actions';
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
  isInsideRoyaleView,
} from './logic/geometry';
import {
  royalePieceSymbol,
  getGiantPieceAt,
  giantPieceCells,
  isGiantPlacementClear,
  getGiantLegalMoves as getGiantLegalMovesBase,
  isGiantMoveValid,
  isInGiantPiece,
  getRoyalePlayerAt,
  getNeutralPawnAt,
  getRadioactiveCellAt,
  getFogZoneAt,
  isRoyaleLineBlocked,
  isRoyaleMoveValid as isRoyaleMoveValidBase,
  getRoyaleVisibleMoves as getRoyaleVisibleMovesBase,
  getRoyaleLegalMoves as getRoyaleLegalMovesBase,
} from './logic/movements';

const randomInt = max => Math.floor(Math.random() * max);
const keepRoyaleEvents = events => events.slice(-40);
const isRoyaleMoveValid = (type, from, to, distance, boosted, size = getRoyaleSize(from)) =>
  isRoyaleMoveValidBase(type, from, to, distance, boosted, size);
const getRoyaleVisibleMoves = (gs, player) => getRoyaleVisibleMovesBase(gs, player, getRoyaleViewOrigin);
const getRoyaleLegalMoves = (gs, player, roll) => getRoyaleLegalMovesBase(gs, player, roll, getRoyaleViewOrigin);
const getGiantLegalMoves = (gs, giant) => getGiantLegalMovesBase(gs, giant);
const createWallPawns = (gs, playerId, center) =>
  createWallPawnsBase(gs, playerId, center, { getRoyaleSize, occupiedSquaresWithGiants, royaleKey, inRoyaleBounds, randomInt });
const createScorchedArea = (gs, playerId, target) =>
  createScorchedAreaBase(gs, playerId, target, { getRoyaleSize, inRoyaleBounds, royaleKey, randomInt });
const applyTargetedTactic = (gs, playerId, card, target) =>
  applyTargetedTacticBase(gs, playerId, card, target, { createScorchedArea, createWallPawns, royaleKey });
const playRoyaleCardState = (gs, playerId, cardId) =>
  playRoyaleCardStateBase(gs, playerId, cardId, { applyTargetedTacticMeta: ROYALE_TACTIC_META, getRoyaleCardLabel });
const applyGiantPieceDamage = (players, giantPieces, movedGiant, closedCells, mapSize, actor = {}) =>
  applyGiantPieceDamageBase(players, giantPieces, movedGiant, closedCells, mapSize, actor, {
    giantPieceCells,
    royaleKey,
    randomRoyaleEdgeSquare,
    randomRoyaleSquare,
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
    randomRoyaleEdgeSquare,
    randomRoyaleSquare,
    transferEliminatedCards,
    applyRoyaleSpecial,
    chooseAutomaticGiantMove,
    applyGiantMove,
    chooseRandomMovableGiant,
    getRadioactiveCellAt,
    nextAliveTurnIndex,
    shrinkRoyaleZone,
    applyClosedZoneDamage,
    keepRoyaleEvents,
  });
const applyRoyaleRolloff = (gs, playerId, forcedRoll = null) =>
  applyRoyaleRolloffBase(gs, playerId, forcedRoll, { randomInt });
const chooseBotRoyaleMove = (gs, player, roll) =>
  chooseBotRoyaleMoveBase(gs, player, roll, { getRoyaleLegalMoves, getRoyalePlayerAt, royaleKey, royaleZoneDistance, randomInt });
const chooseBotRoyaleCard = (gs, player) =>
  chooseBotRoyaleCardBase(gs, player, { getRoyaleLegalMoves, getRoyalePlayerAt, royaleKey, royaleZoneDistance });
const royaleStartRadius = size => Math.ceil((size - 1) * 0.72);
const royaleMinRadius = size => Math.max(5, Math.floor(size * 0.1));
const royaleShrinkPerRound = size => Math.max(1, Math.round(size / 40));
const royaleSpawnDistance = size => Math.max(8, Math.floor(size * 0.35));
const getDefaultRoyaleSpecialCounts = size => {
  const areaScale = (size * size) / (ROYALE_DEFAULT_SIZE * ROYALE_DEFAULT_SIZE);
  return {
    basic: Math.max(20, Math.round(120 * areaScale)),
    improved: Math.max(10, Math.round(56 * areaScale)),
    reveal: Math.max(8, Math.round(44 * areaScale)),
    special: Math.max(6, Math.round(32 * areaScale)),
  };
};
const getRoyaleSpecialCounts = (size, counts = {}) => {
  const defaults = getDefaultRoyaleSpecialCounts(size);
  return {
    basic: Math.max(0, Number.isFinite(Number(counts.basic)) ? Math.floor(Number(counts.basic)) : defaults.basic),
    improved: Math.max(0, Number.isFinite(Number(counts.improved)) ? Math.floor(Number(counts.improved)) : defaults.improved),
    reveal: Math.max(0, Number.isFinite(Number(counts.reveal)) ? Math.floor(Number(counts.reveal)) : defaults.reveal),
    special: Math.max(0, Number.isFinite(Number(counts.special)) ? Math.floor(Number(counts.special)) : defaults.special),
  };
};
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

function randomRoyaleSquare(size = ROYALE_DEFAULT_SIZE, occupied = new Set(), closedCells = {}) {
  for (let i = 0; i < 1000; i++) {
    const row = randomInt(size);
    const col = randomInt(size);
    const key = royaleKey(row, col);
    if (!occupied.has(key) && !closedCells[key]) return { row, col };
  }
  return { row: randomInt(size), col: randomInt(size) };
}

function randomRoyaleEdgeSquare(size, occupied = new Set(), closedCells = {}) {
  const edges = [];
  for (let i = 0; i < size; i++) {
    edges.push({ row: 0, col: i }, { row: size - 1, col: i }, { row: i, col: 0 }, { row: i, col: size - 1 });
  }
  const available = edges.filter(pos => !occupied.has(royaleKey(pos.row, pos.col)) && !closedCells[royaleKey(pos.row, pos.col)]);
  if (!available.length) return null;
  return available[randomInt(available.length)];
}

function randomSeparatedRoyaleSquare(size, existingPlayers, occupied) {
  const minDistance = royaleSpawnDistance(size);
  for (let i = 0; i < 2000; i++) {
    const pos = randomRoyaleSquare(size, occupied);
    if (existingPlayers.every(player => royaleDistance(player, pos) >= minDistance)) return pos;
  }
  return randomRoyaleSquare(size, occupied);
}

function generateRoyaleSpecials(size, playerPositions = [], blockedPositions = [], counts = null) {
  const specials = {};
  const occupied = new Set(playerPositions.map(p => royaleKey(p.row, p.col)));
  blockedPositions.forEach(pos => occupied.add(royaleKey(pos.row, pos.col)));
  const specialCounts = getRoyaleSpecialCounts(size, counts);
  const addCells = (type, count) => {
    const safeCount = Math.min(count, Math.max(0, size * size - occupied.size));
    for (let i = 0; i < safeCount; i++) {
      const pos = randomRoyaleSquare(size, occupied);
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

function randomGiantSquare(size, occupied = new Set(), closedCells = {}, giantPieces = []) {
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

function generateRoyaleGiantPieces(size, players, closedCells = {}) {
  const occupied = new Set(players.map(player => royaleKey(player.row, player.col)));
  return ROYALE_GIANT_PIECES.reduce((acc, template) => {
    const pos = randomGiantSquare(size, occupied, closedCells, acc);
    const piece = { ...template, ...pos };
    giantPieceCells(piece).forEach(cell => occupied.add(royaleKey(cell.row, cell.col)));
    acc.push(piece);
    return acc;
  }, []);
}

function occupiedSquaresWithGiants(players, giantPieces, exceptPlayerId = null) {
  const occupied = new Set(players.filter(p => p.alive && p.id !== exceptPlayerId).map(p => royaleKey(p.row, p.col)));
  giantPieces.forEach(piece => giantPieceCells(piece).forEach(cell => occupied.add(royaleKey(cell.row, cell.col))));
  return occupied;
}

function initChessRoyale(config = {}) {
  const playerCount = Math.max(2, Math.min(ROYALE_PLAYERS.length, Number(config.playerCount) || 4));
  const mapSize = clampRoyaleMapSize(config.mapSize || defaultRoyaleMapSize(playerCount));
  const zoneStartRadius = royaleStartRadius(mapSize);
  const vsBots = Boolean(config.vsBots);
  const debugMode = Boolean(config.debugMode);
  const initialLives = clampRoyaleLives(config.initialLives);
  const humanName = config.humanName?.trim() || 'Tu';
  const specialCounts = getRoyaleSpecialCounts(mapSize, config.specialCounts);
  const playerTemplates = ROYALE_PLAYERS.slice(0, playerCount).map((player, index) => ({
    ...player,
    name: index === 0 ? humanName : `Bot ${index + 1}`,
    isBot: vsBots && index !== 0,
    isHuman: !vsBots || index === 0,
  }));
  const occupied = new Set();
  const zoneCenter = { row: (mapSize - 1) / 2, col: (mapSize - 1) / 2 };
  const initialZone = buildRoyaleZone(mapSize, zoneCenter, zoneStartRadius);
  const players = playerTemplates.reduce((acc, player) => {
    const pos = randomSeparatedRoyaleSquare(mapSize, acc, occupied);
    occupied.add(royaleKey(pos.row, pos.col));
    acc.push({ ...player, ...pos, lives: initialLives, alive: true, type: 'K', boosted: false, temporaryPower: false, pendingPower: null, cards: [], revealEnemies: false, secondChance: false, lastRoll: null });
    return acc;
  }, []);
  const giantPieces = generateRoyaleGiantPieces(mapSize, players, initialZone.closedCells);

  return {
    phase: 'rolloff',
    config: { playerCount, vsBots, humanName, mapSize, initialLives, debugMode, specialCounts },
    mapSize,
    players,
    giantPieces,
    neutralPawns: [],
    fogZones: [],
    radioactiveCells: [],
    specials: generateRoyaleSpecials(mapSize, players, giantPieces.flatMap(giantPieceCells), specialCounts),
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

function canSeeRoyalePlayer(observer, target, gs) {
  if (!observer?.alive || !target?.alive || observer.id === target.id) return false;
  if (!isInsideRoyaleView(observer, target.row, target.col, getRoyaleSize(gs))) return false;
  const fogZone = getFogZoneAt(gs.fogZones || [], target.row, target.col);
  return !fogZone || fogZone.ownerId === observer.id;
}

function transferEliminatedCards(players, killerId, victimId, stolenCards = []) {
  const cards = stolenCards.filter(Boolean);
  return players.map(player => {
    if (player.id === victimId) return { ...player, cards: [] };
    if (cards.length && player.id === killerId && player.alive) {
      return { ...player, cards: addRoyaleCards(player.cards || [], cards) };
    }
    return player;
  });
}

function getTurnsUntilPlayer(gs, playerId) {
  if (gs.phase !== 'battle' || !gs.turnOrder.length) return 0;
  for (let i = 0; i < gs.turnOrder.length; i++) {
    const index = (gs.currentTurnIndex + i) % gs.turnOrder.length;
    const player = gs.players.find(p => p.id === gs.turnOrder[index]);
    if (!player?.alive) continue;
    if (player.id === playerId) return i;
  }
  return 0;
}

function applyRoyaleSpecial(player, specialType) {
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

function nextAliveTurnIndex(players, turnOrder, currentTurnIndex) {
  for (let i = 1; i <= turnOrder.length; i++) {
    const nextIndex = (currentTurnIndex + i) % turnOrder.length;
    const nextPlayer = players.find(p => p.id === turnOrder[nextIndex]);
    if (nextPlayer?.alive) return nextIndex;
  }
  return currentTurnIndex;
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

function applyClosedZoneDamage(players, closedCells, turnInfo = {}) {
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
        const edge = randomRoyaleEdgeSquare(size, occupied, closedCells);
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
    const respawn = randomRoyaleSquare(size, occupied, closedCells);
    occupied.add(royaleKey(respawn.row, respawn.col));
    return { ...player, lives, row: respawn.row, col: respawn.col, type: 'K', boosted: false, temporaryPower: false, pendingPower: null, cards: [], revealEnemies: false };
  });

  return { players: updated, message, events };
}

function chooseAutomaticGiantMove(gs) {
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
}

function chooseRandomMovableGiant(gs) {
  const movable = (gs.giantPieces || []).filter(giant => getGiantLegalMoves(gs, giant).length);
  if (!movable.length) return null;
  return movable[randomInt(movable.length)];
}

// Ã¢â€â‚¬Ã¢â€â‚¬ INIT STATE Ã¢â€â‚¬Ã¢â€â‚¬
function ChessRoyaleGame({ initialState, onBack }) {
  const [gs, setGs] = useState(initialState);
  const [diceRolling, setDiceRolling] = useState(false);
  const [diceRevealing, setDiceRevealing] = useState(false);
  const [displayedDice, setDisplayedDice] = useState(1);
  const [rolloffDice, setRolloffDice] = useState({ playerId: null, value: 1, revealing: false });
  const diceRevealTimer = useRef(null);
  const rolloffRevealTimer = useRef(null);
  const soundStateRef = useRef({ phase: initialState.phase, eventIds: new Set((initialState.events || []).map(event => event.id)) });
  const battleMusicRef = useRef(null);
  const activeId = gs.turnOrder[gs.currentTurnIndex];
  const activePlayer = gs.players.find(p => p.id === activeId) || gs.players.find(p => p.alive);
  const humanPlayer = gs.players.find(p => p.id === gs.humanPlayerId) || gs.players.find(p => !p.isBot) || gs.players[0];
  const giantMovePlayer = gs.players.find(p => p.id === gs.giantMove?.playerId);
  const isBotMatch = Boolean(gs.vsBots);
  const isHumanTurn = !isBotMatch || activePlayer?.id === humanPlayer?.id;
  const boardPlayer = giantMovePlayer || (isBotMatch && !isHumanTurn ? humanPlayer : activePlayer);
  const visibleMoves = boardPlayer && isHumanTurn && !gs.giantMove ? getRoyaleVisibleMoves(gs, boardPlayer) : [];
  const winner = gs.players.find(p => p.id === gs.winner);
  const minimapPlayer = gs.players.find(p => p.id === gs.minimapPlayerId);
  const pendingTacticCard = activePlayer?.cards?.find(card => card.id === gs.pendingTacticCard?.cardId);
  const selectedGiant = gs.giantPieces?.find(piece => piece.id === gs.giantMove?.selectedId);
  const giantLegalMoves = selectedGiant ? getGiantLegalMoves(gs, selectedGiant) : [];
  const turnsUntilHuman = getTurnsUntilPlayer(gs, humanPlayer?.id);
  const activePlayerId = activePlayer?.id;
  const activePlayerBoosted = activePlayer?.boosted;
  const isHumanDiceStage = isHumanTurn && gs.phase === 'battle' && !gs.currentRoll && !gs.giantMove && !gs.pendingTacticCard;
  const canSeeActiveRival = isBotMatch && !isHumanTurn && canSeeRoyalePlayer(humanPlayer, activePlayer, gs);
  const visibleRivalRoll = gs.botRevealedRoll?.playerId === activePlayer?.id ? gs.botRevealedRoll.value : null;
  const importantEvents = (gs.events || []).filter(event => event.type === 'kill' || event.type === 'zone-death' || event.type === 'giant-death' || event.type === 'giant-hit' || event.type === 'radioactive-death').slice(-4).reverse();
  const humanLost = gs.vsBots && gs.phase === 'result' && gs.lastDeathEvent?.victimId === gs.humanPlayerId;
  const mapSize = getRoyaleSize(gs);
  const debugEnabled = Boolean(gs.debugMode || gs.config?.debugMode);
  const activeCards = activePlayer?.cards || [];

  useEffect(() => {
    if (typeof Audio === 'undefined') return undefined;
    if (!battleMusicRef.current) {
      battleMusicRef.current = new Audio(ROYALE_SOUNDS.battleMusic);
      battleMusicRef.current.loop = true;
      battleMusicRef.current.volume = 0.28;
    }

    const music = battleMusicRef.current;
    if (gs.phase === 'battle') {
      music.play().catch(() => {});
    } else {
      music.pause();
      music.currentTime = 0;
    }

    return () => {
      music.pause();
    };
  }, [gs.phase]);

  useEffect(() => {
    const previous = soundStateRef.current;
    if (previous.phase !== 'battle' && gs.phase === 'battle') playRoyaleSound('gameStart');
    if (previous.phase !== 'result' && gs.phase === 'result') playRoyaleSound('gameEnd');

    const events = gs.events || [];
    const newEvents = events.filter(event => !previous.eventIds.has(event.id));
    const hasKill = newEvents.some(event => event.type === 'kill');
    const hasDeath = newEvents.some(event => event.type === 'zone-death' || event.type === 'giant-death' || event.type === 'radioactive-death');
    const hasGiantMove = newEvents.some(event => event.type === 'giant-move');
    const hasMove = newEvents.some(event => event.type === 'move');

    if (hasKill) playRoyaleSound('kill');
    else if (hasDeath) playRoyaleSound('death');
    else if (hasGiantMove) playRoyaleSound('giantMove');
    else if (hasMove) playRoyaleSound('move');

    soundStateRef.current = { phase: gs.phase, eventIds: new Set(events.map(event => event.id)) };
  }, [gs.phase, gs.events]);

  useEffect(() => {
    if (!diceRolling || !activePlayerId) return undefined;
    const timer = setInterval(() => {
      setDisplayedDice(activePlayerBoosted ? 10 + randomInt(71) : 1 + randomInt(6));
    }, 90);
    return () => clearInterval(timer);
  }, [diceRolling, activePlayerId, activePlayerBoosted]);

  useEffect(() => {
    if (gs.phase !== 'rolloff' || !rolloffDice.playerId || rolloffDice.revealing) return undefined;
    const timer = setInterval(() => {
      setRolloffDice(prev => ({ ...prev, value: 1 + randomInt(10) }));
    }, 90);
    return () => clearInterval(timer);
  }, [gs.phase, rolloffDice.playerId, rolloffDice.revealing]);

  useEffect(() => {
    if (isHumanDiceStage && !diceRevealing) {
      setDiceRolling(true);
      return;
    }
    setDiceRolling(false);
  }, [isHumanDiceStage, diceRevealing]);

  useEffect(() => {
    if (!gs.giantMove) return;
    if (selectedGiant && giantLegalMoves.length) return;

    setGs(prev => {
      if (!prev.giantMove) return prev;
      const giant = prev.giantPieces?.find(piece => piece.id === prev.giantMove.selectedId);
      const legalMoves = giant ? getGiantLegalMoves(prev, giant) : [];
      if (giant && legalMoves.length) return prev;

      return {
        ...prev,
        giantMove: null,
        minimapPlayerId: null,
        selectedPlayerId: null,
    botThinkingPlayerId: null,
    botRevealedRoll: null,
    botPendingCardText: null,
        message: giant
          ? `${giant.name} no tiene movimiento disponible. Se cancela el movimiento gigante.`
          : 'La pieza gigante seleccionada ya no esta disponible. Se cancela el movimiento gigante.',
      };
    });
  }, [gs.giantMove, selectedGiant, giantLegalMoves.length]);

  useEffect(() => () => {
    if (diceRevealTimer.current) clearTimeout(diceRevealTimer.current);
    if (rolloffRevealTimer.current) clearTimeout(rolloffRevealTimer.current);
  }, []);

  useEffect(() => {
    if (!gs.vsBots || gs.phase !== 'rolloff') return undefined;
    const nextBot = gs.players.find(player => player.isBot && !gs.rolloff[player.id]);
    if (!nextBot) return undefined;

    const timer = setTimeout(() => setGs(prev => applyRoyaleRolloff(prev, nextBot.id)), 650);
    return () => clearTimeout(timer);
  }, [gs.vsBots, gs.phase, gs.rolloff, gs.players]);

  useEffect(() => {
    if (gs.giantMove || !gs.vsBots || gs.phase !== 'battle' || !activePlayer?.isBot || gs.botThinkingPlayerId) return undefined;

    setGs(prev => ({
      ...prev,
      botThinkingPlayerId: activePlayer.id,
      currentRoll: null,
      botRevealedRoll: null,
      botPendingCardText: null,
      minimapPlayerId: null,
      selectedPlayerId: null,
      pendingTacticCard: null,
      message: `${activePlayer.name} tirando. Faltan ${getTurnsUntilPlayer(prev, prev.humanPlayerId)} turnos para ti.`,
    }));
    return undefined;
  }, [gs.giantMove, gs.vsBots, gs.phase, activePlayer?.id, activePlayer?.isBot, activePlayer?.name, gs.botThinkingPlayerId]);

  useEffect(() => {
    if (gs.giantMove || !gs.vsBots || gs.phase !== 'battle' || !activePlayer?.isBot || gs.botThinkingPlayerId !== activePlayer.id) return undefined;

    const timer = setTimeout(() => {
      setGs(prev => {
        const bot = prev.players.find(p => p.id === prev.turnOrder[prev.currentTurnIndex]);
        if (!bot?.isBot) return prev;

        if (!prev.currentRoll) {
          const card = chooseBotRoyaleCard(prev, bot);
          const cardState = card ? playRoyaleCardState(prev, bot.id, card.id) : prev;
          const activeBot = cardState.players.find(p => p.id === cardState.turnOrder[cardState.currentTurnIndex]);
          const roll = activeBot.boosted ? 10 + randomInt(71) : 1 + randomInt(6);
          const human = cardState.players.find(p => p.id === cardState.humanPlayerId);
          const canSeeRoll = canSeeRoyalePlayer(human, activeBot, cardState);
          const cardText = card ? ` uso ${getRoyaleCardLabel(card)}${card.boosted ? ' mejorada' : ''} y` : '';
          return {
            ...cardState,
            currentRoll: roll,
            botThinkingPlayerId: activeBot.id,
            botRevealedRoll: canSeeRoll ? { playerId: activeBot.id, value: roll } : null,
            botPendingCardText: cardText,
            players: cardState.players.map(player => player.id === activeBot.id ? { ...player, lastRoll: roll } : player),
            message: canSeeRoll
              ? `${activeBot.name}${cardText} esta en tu vision: saco ${roll}.`
              : `${activeBot.name}${cardText} tiro. No puedes ver su dado desde tu posicion.`,
          };
        }

        const roll = prev.currentRoll;
        const move = chooseBotRoyaleMove(prev, bot, roll);
        if (!move) {
          return { ...prev, botThinkingPlayerId: null, botRevealedRoll: null, botPendingCardText: null, currentRoll: null, message: `${bot.name} no encontro movimiento disponible.` };
        }

        const moved = moveRoyalePlayer({ ...prev, currentRoll: roll, botThinkingPlayerId: null }, move);
        if (moved.phase === 'result') return moved;

        const nextTurns = getTurnsUntilPlayer(moved, moved.humanPlayerId);
        const nextActive = moved.players.find(p => p.id === moved.turnOrder[moved.currentTurnIndex]);
        const cardText = prev.botPendingCardText || '';
        return {
          ...moved,
          botRevealedRoll: null,
          botPendingCardText: null,
          message: nextActive?.id === moved.humanPlayerId
            ? `Es tu turno. ${bot.name}${cardText} ya tiro.`
            : `${bot.name}${cardText} tiro y movio. Faltan ${nextTurns} turnos para ti.`,
        };
      });
    }, gs.currentRoll ? 1250 : 700);

    return () => clearTimeout(timer);
  }, [gs.giantMove, gs.vsBots, gs.phase, gs.currentRoll, activePlayer?.id, activePlayer?.isBot, gs.botThinkingPlayerId]);

  function rollForPlayer(playerId) {
    if (gs.phase !== 'rolloff' || gs.rolloff[playerId]) return;
    if (rolloffDice.playerId && rolloffDice.playerId !== playerId) return;
    if (!rolloffDice.playerId) {
      setRolloffDice({ playerId, value: 1 + randomInt(10), revealing: false });
      return;
    }

    const roll = 1 + randomInt(10);
    setRolloffDice({ playerId, value: roll, revealing: true });
    if (rolloffRevealTimer.current) clearTimeout(rolloffRevealTimer.current);
    rolloffRevealTimer.current = setTimeout(() => {
      setGs(prev => applyRoyaleRolloff(prev, playerId, roll));
      setRolloffDice({ playerId: null, value: 1, revealing: false });
    }, 900);
  }

  function applyHumanRoll(roll) {
    setGs(prev => {
      const current = prev.players.find(p => p.id === prev.turnOrder[prev.currentTurnIndex]);
      const rollText = current?.boosted ? `${roll} con dado mejorado` : roll;
      return {
        ...prev,
        currentRoll: roll,
        minimapPlayerId: roll > ROYALE_VIEW_SIZE ? current?.id : null,
        selectedPlayerId: current?.id,
        players: prev.players.map(p => p.id === current?.id ? { ...p, lastRoll: roll } : p),
        message: `${current?.name} saco ${rollText}. Elige una casilla iluminada.`,
      };
    });
  }

  function handleDiceClick() {
    if (!isHumanDiceStage || diceRevealing) return;
    const roll = activePlayer?.boosted ? 10 + randomInt(71) : 1 + randomInt(6);
    setDisplayedDice(roll);
    setDiceRolling(false);
    setDiceRevealing(true);
    if (diceRevealTimer.current) clearTimeout(diceRevealTimer.current);
    diceRevealTimer.current = setTimeout(() => {
      applyHumanRoll(roll);
      setDiceRevealing(false);
    }, 1800);
  }

  function closeMinimap() {
    setGs(prev => ({ ...prev, minimapPlayerId: null, pendingTacticCard: null }));
  }

  function playCard(cardId) {
    if (!activePlayer || !isHumanTurn || gs.currentRoll || gs.giantMove || gs.pendingTacticCard) return;
    setGs(prev => playRoyaleCardState(prev, activePlayer.id, cardId));
  }

  function moveTo(row, col) {
    if (gs.giantMove || gs.phase !== 'battle' || !activePlayer || !gs.currentRoll || !isHumanTurn) return;
    const isVisibleMove = visibleMoves.some(([r, c]) => r === row && c === col);
    if (!isVisibleMove) return;
    setGs(prev => moveRoyalePlayer(prev, { row, col }));
  }

  function moveFromMinimap(row, col) {
    if (gs.pendingTacticCard && activePlayer?.id === gs.pendingTacticCard.playerId && pendingTacticCard) {
      setGs(prev => applyTargetedTactic(prev, activePlayer.id, pendingTacticCard, { row, col }));
      return;
    }
    if (gs.giantMove || !activePlayer || !gs.currentRoll || !activePlayer.boosted || !isHumanTurn) return;
    const destination = { row, col };
    if (gs.closedCells[royaleKey(row, col)]) return;
    if (getGiantPieceAt(gs.giantPieces, row, col)) return;
    if (getNeutralPawnAt(gs.neutralPawns || [], row, col)) return;
    if ((activePlayer.type === 'Q' || activePlayer.type === 'R' || activePlayer.type === 'B') && isRoyaleLineBlocked(gs, activePlayer, destination, activePlayer.id)) return;
    if (!isRoyaleMoveValid(activePlayer.type, activePlayer, destination, gs.currentRoll, true, mapSize)) return;
    setGs(prev => ({ ...moveRoyalePlayer(prev, destination), minimapPlayerId: null }));
  }

  function moveGiantPiece(row, col) {
    setGs(prev => {
      if (!prev.giantMove?.selectedId) return prev;
      const result = applyGiantMove(prev, prev.giantMove.playerId, prev.giantMove.selectedId, { row, col });
      if (!result) {
        const giant = prev.giantPieces?.find(piece => piece.id === prev.giantMove.selectedId);
        return {
          ...prev,
          giantMove: null,
          minimapPlayerId: null,
          selectedPlayerId: null,
          message: giant
            ? `${giant.name} no tiene movimiento disponible. Se cancela el movimiento gigante.`
            : 'La pieza gigante seleccionada ya no esta disponible. Se cancela el movimiento gigante.',
        };
      }

      const events = keepRoyaleEvents([...(prev.events || []), ...result.events]);
      const lastDeathEvent = result.events.find(event => event.victimId === prev.humanPlayerId && event.type === 'giant-death') || prev.lastDeathEvent;
      const alive = result.players.filter(player => player.alive);
      const human = prev.vsBots ? result.players.find(player => player.id === prev.humanPlayerId) : null;

      if (prev.vsBots && human && !human.alive) {
        return {
          ...prev,
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
          ...prev,
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
        ...prev,
        players: result.players,
        giantPieces: result.giantPieces,
        events,
        lastDeathEvent,
        giantMove: null,
        minimapPlayerId: null,
        selectedPlayerId: null,
        message: result.message,
      };
    });
  }

  function debugStartBattle() {
    setGs(prev => ({
      ...prev,
      phase: 'battle',
      turnOrder: prev.turnOrder.length ? prev.turnOrder : prev.players.map(player => player.id),
      currentTurnIndex: Math.max(0, (prev.turnOrder.length ? prev.turnOrder : prev.players.map(player => player.id)).indexOf(prev.humanPlayerId)),
      rolloff: prev.players.reduce((acc, player, index) => ({ ...acc, [player.id]: prev.players.length - index }), {}),
      currentRoll: null,
      cardUsedThisTurn: false,
      botThinkingPlayerId: null,
      minimapPlayerId: null,
      selectedPlayerId: null,
      giantMove: null,
      message: 'Debug: batalla iniciada y turno humano preparado.',
    }));
  }

  function debugGiveHumanTurn() {
    setGs(prev => {
      const turnOrder = prev.turnOrder.length ? prev.turnOrder : prev.players.map(player => player.id);
      return {
        ...prev,
        phase: 'battle',
        turnOrder,
        currentTurnIndex: Math.max(0, turnOrder.indexOf(prev.humanPlayerId)),
        currentRoll: null,
        cardUsedThisTurn: false,
        botThinkingPlayerId: null,
        minimapPlayerId: null,
        selectedPlayerId: null,
        giantMove: null,
        message: 'Debug: turno humano listo.',
      };
    });
  }

  function debugPlaceSpecialUnderHuman(specialType = 'special') {
    setGs(prev => {
      const human = prev.players.find(player => player.id === prev.humanPlayerId);
      if (!human) return prev;
      return {
        ...prev,
        specials: { ...prev.specials, [royaleKey(human.row, human.col)]: specialType },
        message: `Debug: casilla ${specialType} creada en ${human.row + 1}, ${human.col + 1}.`,
      };
    });
  }

  function debugGiveHumanCards() {
    setGs(prev => {
      const human = prev.players.find(player => player.id === prev.humanPlayerId);
      if (!human) return prev;
      const cards = [
        makeRoyaleCard('basic', 'Q'),
        makeRoyaleCard('improved', 'Q'),
        makeRoyaleCard('reveal', null, 'reveal'),
        makeRoyaleCard('reveal', null, 'fog'),
        makeRoyaleCard('reveal', null, 'scorched'),
        makeRoyaleCard('reveal', null, 'wall'),
        makeRoyaleCard('reveal', null, 'secondChance'),
      ];
      return {
        ...prev,
        players: prev.players.map(player => player.id === human.id ? { ...player, cards: addRoyaleCards(player.cards || [], cards) } : player),
        message: 'Debug: cartas de pieza y tacticas agregadas a tu mano.',
      };
    });
  }

  function debugMoveNextToEnemy() {
    setGs(prev => {
      const human = prev.players.find(player => player.id === prev.humanPlayerId);
      const enemy = prev.players.find(player => player.alive && player.id !== prev.humanPlayerId);
      if (!human || !enemy) return { ...prev, message: 'Debug: no hay enemigo vivo para acercarte.' };

      const occupied = occupiedSquaresWithGiants(prev.players.filter(player => player.id !== human.id), prev.giantPieces || []);
      (prev.neutralPawns || []).forEach(pawn => occupied.add(royaleKey(pawn.row, pawn.col)));
      const candidates = [
        { row: enemy.row, col: enemy.col - 1 },
        { row: enemy.row, col: enemy.col + 1 },
        { row: enemy.row - 1, col: enemy.col },
        { row: enemy.row + 1, col: enemy.col },
        { row: enemy.row - 1, col: enemy.col - 1 },
        { row: enemy.row - 1, col: enemy.col + 1 },
        { row: enemy.row + 1, col: enemy.col - 1 },
        { row: enemy.row + 1, col: enemy.col + 1 },
      ];
      const spot = candidates.find(pos =>
        inRoyaleBounds(pos.row, pos.col, getRoyaleSize(prev)) &&
        !prev.closedCells[royaleKey(pos.row, pos.col)] &&
        !occupied.has(royaleKey(pos.row, pos.col))
      );
      if (!spot) return { ...prev, message: `Debug: no hay casilla libre junto a ${enemy.name}.` };

      const turnOrder = prev.turnOrder.length ? prev.turnOrder : prev.players.map(player => player.id);
      return {
        ...prev,
        phase: 'battle',
        turnOrder,
        currentTurnIndex: Math.max(0, turnOrder.indexOf(human.id)),
        currentRoll: null,
        cardUsedThisTurn: false,
        botThinkingPlayerId: null,
        botRevealedRoll: null,
        botPendingCardText: null,
        minimapPlayerId: null,
        selectedPlayerId: null,
        pendingTacticCard: null,
        giantMove: null,
        players: prev.players.map(player => player.id === human.id ? { ...player, row: spot.row, col: spot.col, alive: true } : player),
        message: `Debug: te movi junto a ${enemy.name}. Ahora puedes probar vision, dado rival y ataques.`,
      };
    });
  }

  function debugPrepareKill() {
    setGs(prev => {
      const human = prev.players.find(player => player.id === prev.humanPlayerId);
      const enemy = prev.players.find(player => player.alive && player.id !== prev.humanPlayerId);
      if (!human || !enemy) return { ...prev, message: 'Debug: no hay enemigo vivo para preparar asesinato.' };
      return {
        ...prev,
        phase: 'battle',
        players: prev.players.map(player => player.id === enemy.id ? { ...player, lives: 1, cards: addRoyaleCards(player.cards || [], [makeRoyaleCard('basic', 'R')]) } : player),
        message: `Debug: ${enemy.name} quedo con 1 vida y una carta para probar asesinato y robo.`,
      };
    });
  }

  function debugTriggerGiantMove() {
    setGs(prev => {
      const human = prev.players.find(player => player.id === prev.humanPlayerId);
      const selected = chooseRandomMovableGiant(prev);
      if (!human || !selected) return { ...prev, message: 'Debug: no hay pieza gigante con movimiento valido.' };
      return {
        ...prev,
        phase: 'battle',
        giantMove: { playerId: human.id, selectedId: selected.id },
        minimapPlayerId: null,
        selectedPlayerId: null,
        botThinkingPlayerId: null,
        message: `Debug: prueba de ${selected.name}. Elige destino 5 x 5 en el minimapa grande.`,
      };
    });
  }

  function debugPlaySound(name) {
    playRoyaleSound(name);
    setGs(prev => ({ ...prev, message: `Debug: sonido ${name} reproducido.` }));
  }

  function restart() {
    setGs(initChessRoyale(gs.config));
  }

  return (
    <div className="royale-screen">
      <div className="royale-topbar">
        <div>
          <div className="game-logo">ChessRoyale</div>
          <div className="royale-subtitle">Mapa {mapSize} x {mapSize} Â· Vision 10 x 10</div>
        </div>
        <div className="royale-living">
          {gs.players.map(player => (
            <div key={player.id} className={`royale-player-pill ${!player.alive ? 'is-dead' : ''} ${activeId === player.id ? 'is-active' : ''}`}>
              <span className="royale-dot" style={{ background: player.color }} />
              <span>{player.name}</span>
              <span>{'\u2665'.repeat(player.lives)}</span>
              <span>{royalePieceSymbol(player.type)}</span>
            </div>
          ))}
        </div>
        <button className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '4px 12px' }} onClick={onBack}>Menu</button>
      </div>

      {importantEvents.length > 0 && (
        <div className="royale-notification-bar">
          {importantEvents.map(event => (
            <div key={event.id} className={`royale-notice ${event.type}`}>
              {event.text}
            </div>
          ))}
        </div>
      )}

      {gs.phase === 'result' && (
        <div className="result-overlay">
          <div className="result-card">
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{'\u265B'}</div>
            <div className="result-title">{humanLost ? 'Has caido en ChessRoyale' : `${winner?.name || 'Ganador'} domina ChessRoyale`}</div>
            <div className="result-sub">{gs.message}</div>
            {humanLost && <RoyaleDeathSummary event={gs.lastDeathEvent} />}
            <div className="result-btns">
              <button className="btn btn-primary" onClick={restart}>Nueva partida</button>
              <button className="btn btn-ghost" onClick={onBack}>Menu Principal</button>
            </div>
          </div>
        </div>
      )}

      <div className="royale-layout">
        <div className="royale-panel">
          <div className="panel-box">
            <div className="panel-title">Estado</div>
            <div className="royale-message">{gs.message}</div>
          </div>

          {debugEnabled && (
            <div className="panel-box royale-debug-panel">
              <div className="panel-title">Admin Debug</div>
              <div className="royale-debug-label">Partida</div>
              <div className="royale-debug-grid">
                <button className="btn btn-ghost" onClick={debugStartBattle}>Saltar sorteo</button>
                <button className="btn btn-ghost" onClick={debugGiveHumanTurn}>Turno humano</button>
                <button className="btn btn-ghost" onClick={debugMoveNextToEnemy}>Junto a enemigo</button>
                <button className="btn btn-ghost" onClick={debugPrepareKill}>Preparar kill</button>
              </div>
              <div className="royale-debug-label">Casillas</div>
              <div className="royale-debug-grid">
                <button className="btn btn-ghost" onClick={() => debugPlaceSpecialUnderHuman('basic')}>Basica aqui</button>
                <button className="btn btn-ghost" onClick={() => debugPlaceSpecialUnderHuman('improved')}>Mejorada aqui</button>
                <button className="btn btn-ghost" onClick={() => debugPlaceSpecialUnderHuman('reveal')}>Tactica aqui</button>
                <button className="btn btn-ghost" onClick={() => debugPlaceSpecialUnderHuman('special')}>Especial aqui</button>
              </div>
              <div className="royale-debug-label">Cartas y gigantes</div>
              <div className="royale-debug-grid">
                <button className="btn btn-ghost" onClick={debugGiveHumanCards}>Dar cartas</button>
                <button className="btn btn-ghost" onClick={debugTriggerGiantMove}>Probar gigante</button>
              </div>
              <div className="royale-debug-label">Sonidos</div>
              <div className="royale-debug-grid royale-debug-sounds">
                <button className="btn btn-ghost" onClick={() => debugPlaySound('gameStart')}>Inicio</button>
                <button className="btn btn-ghost" onClick={() => debugPlaySound('move')}>Movimiento</button>
                <button className="btn btn-ghost" onClick={() => debugPlaySound('giantMove')}>Gigante</button>
                <button className="btn btn-ghost" onClick={() => debugPlaySound('kill')}>Asesinato</button>
                <button className="btn btn-ghost" onClick={() => debugPlaySound('death')}>Muerte</button>
                <button className="btn btn-ghost" onClick={() => debugPlaySound('gameEnd')}>Final</button>
              </div>
            </div>
          )}

          {gs.giantMove && (
            <div className="panel-box royale-giant-control">
              <div className="panel-title">Pieza gigante</div>
              <div className="royale-stat-line">{giantMovePlayer?.name} activo una casilla especial.</div>
              <div className="royale-giant-list">
                {selectedGiant && (
                  <div className="royale-giant-btn is-selected">
                    <span style={{ color: selectedGiant.color }}>{royalePieceSymbol(selectedGiant.type)}</span>
                    <strong>{selectedGiant.name}</strong>
                    <small>{selectedGiant.row + 1}, {selectedGiant.col + 1}</small>
                  </div>
                )}
              </div>
              <div className="royale-dice-hint">
                La pieza fue seleccionada al azar. Elige un destino verde en el minimapa grande.
              </div>
            </div>
          )}

          {gs.phase === 'rolloff' && (
            <div className="panel-box">
              <div className="panel-title">Tirada inicial</div>
              <div className="royale-roll-list">
                {gs.players.map(player => (
                  (() => {
                    const isRollingPlayer = rolloffDice.playerId === player.id;
                    return (
                  <button
                    key={player.id}
                    className={`royale-roll-row ${isRollingPlayer && !rolloffDice.revealing ? 'is-rolling' : ''} ${isRollingPlayer && rolloffDice.revealing ? 'is-revealed' : ''}`}
                    disabled={Boolean(gs.rolloff[player.id]) || (gs.vsBots && player.isBot) || (rolloffDice.playerId && !isRollingPlayer)}
                    onClick={() => rollForPlayer(player.id)}
                  >
                    <span>{player.name}</span>
                    <strong>
                      {isRollingPlayer
                        ? rolloffDice.value
                        : gs.rolloff[player.id] || (gs.vsBots && player.isBot ? 'Auto' : 'Tirar')}
                    </strong>
                    {isRollingPlayer && <small>{rolloffDice.revealing ? 'Tu tirada' : 'Detener'}</small>}
                  </button>
                    );
                  })()
                ))}
              </div>
            </div>
          )}

          {gs.phase === 'battle' && activePlayer && (
            <>
              <div className="panel-box">
                <div className="panel-title">Turno actual</div>
                {isHumanTurn ? (
                  <>
                    <div className="royale-turn-alert">Es tu turno</div>
                    <div className="royale-active-name" style={{ color: activePlayer.color }}>{activePlayer.name}</div>
                    <div className="royale-stat-line">Pieza: {PIECES[activePlayer.type]?.label}</div>
                    <div className="royale-stat-line">Posicion: {activePlayer.row + 1}, {activePlayer.col + 1}</div>
                    <div className="royale-stat-line">Dado: {gs.currentRoll || '-'}</div>
                    {activePlayer.secondChance && <div className="royale-stat-line">Seguro: Segunda Oportunidad activa</div>}
                    <div className="royale-hand">
                      <div className="royale-hand-head">
                        <span>Cartas</span>
                        <strong>{activeCards.length}/{ROYALE_MAX_CARDS}</strong>
                      </div>
                      {activeCards.length ? (
                        <div className="royale-card-list">
                          {activeCards.map(card => (
                            <button
                              key={card.id}
                              className={`royale-card ${card.boosted ? 'is-boosted' : ''} ${card.effect !== 'piece' ? 'is-reveal' : ''}`}
                              disabled={Boolean(gs.currentRoll) || Boolean(gs.giantMove) || Boolean(gs.pendingTacticCard) || Boolean(gs.cardUsedThisTurn)}
                              onClick={() => playCard(card.id)}
                              title={gs.cardUsedThisTurn ? 'Ya usaste una carta este turno.' : gs.pendingTacticCard ? 'Termina de elegir el objetivo de tu carta.' : gs.currentRoll ? 'Solo puedes usar cartas antes de tirar el dado.' : `Usar ${getRoyaleCardLabel(card)}`}
                            >
                              <span>{getRoyaleCardSymbol(card)}</span>
                              <b>{getRoyaleCardLabel(card)}</b>
                              <small>{getRoyaleCardKind(card)}</small>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="royale-empty-hand">Pisa casillas verdes, doradas o violetas para robar cartas.</div>
                      )}
                    </div>
                    {!gs.currentRoll && <div className="royale-dice-hint">Usa el dado del centro del tablero.</div>}
                    {activePlayer.boosted && gs.currentRoll && (
                      <button className="btn btn-ghost royale-fog-btn" onClick={() => setGs(prev => ({ ...prev, minimapPlayerId: activePlayer.id }))}>
                        Tirar en minimapa
                      </button>
                    )}
                    {activePlayer.revealEnemies && (
                      <button className="btn btn-ghost royale-fog-btn" onClick={() => setGs(prev => ({ ...prev, minimapPlayerId: activePlayer.id }))}>
                        Ver enemigos
                      </button>
                    )}
                  </>
                ) : (
                  <div className="royale-wait-box">
                    <div className="royale-wait-name">{activePlayer.name} tirando</div>
                    <div className="royale-wait-sub">
                      {canSeeActiveRival
                        ? 'Esta dentro de tu vision: puedes ver su dado antes de que se mueva.'
                        : 'No puedes ver su tirada ni su posicion.'}
                    </div>
                    {visibleRivalRoll !== null && (
                      <div className="royale-rival-roll">
                        <span>Dado rival</span>
                        <strong>{visibleRivalRoll}</strong>
                      </div>
                    )}
                    <div className="royale-countdown">Faltan {turnsUntilHuman} turnos para ti</div>
                  </div>
                )}
              </div>

              <div className="panel-box">
                <div className="panel-title">Casillas</div>
                <div className="royale-legend"><span className="special-mark basic" /> Basica: carta de pieza</div>
                <div className="royale-legend"><span className="special-mark improved" /> Mejorada: carta + dado grande</div>
                <div className="royale-legend"><span className="special-mark reveal" /> Tactica: cartas moradas</div>
                <div className="royale-legend"><span className="special-mark special" /> Especial: mueve pieza gigante</div>
              </div>
            </>
          )}
        </div>

        <div className="royale-board-wrap">
          {activePlayer ? (
            <>
              <div className={`royale-board-stage ${isHumanDiceStage ? 'is-hidden' : ''}`}>
                <RoyaleBoard
                  gs={gs}
                  activePlayer={boardPlayer}
                  visibleMoves={visibleMoves}
                  onCellClick={moveTo}
                  helpers={{ getRoyaleViewOrigin, getRoyaleSize, getGiantPieceAt, getNeutralPawnAt, getRadioactiveCellAt, getFogZoneAt, getRoyalePlayerAt, royalePieceSymbol }}
                  constants={{ ROYALE_VIEW_SIZE, ROYALE_GIANT_SIZE }}
                />
              </div>
              {isHumanDiceStage && (
                <button className={`royale-center-die ${diceRolling ? 'is-rolling' : ''} ${diceRevealing ? 'is-revealed' : ''}`} onClick={handleDiceClick}>
                  <span className="royale-die-number">{displayedDice}</span>
                  <span className="royale-die-label">{diceRevealing ? 'Tu tirada' : 'Detener'}</span>
                </button>
              )}
            </>
          ) : null}
        </div>

        <aside className="royale-side">
          <RoyaleClosingMinimap
            closedCells={gs.closedCells}
            closedCount={gs.closedCount}
            roundsCompleted={gs.roundsCompleted}
            zoneCenter={gs.zoneCenter}
            zoneRadius={gs.zoneRadius}
            mapSize={mapSize}
            humanPlayer={humanPlayer}
            helpers={{ clampRoyaleMapSize }}
          />
          {minimapPlayer && (
            <RoyaleMinimap
              gs={gs}
              focusPlayer={minimapPlayer}
              activePlayer={activePlayer}
              onClose={closeMinimap}
              onSelect={moveFromMinimap}
              helpers={{ getRoyaleSize, getRoyaleViewOrigin, isInsideRoyaleView, getGiantPieceAt, getNeutralPawnAt, getRadioactiveCellAt, getFogZoneAt, isRoyaleLineBlocked, isRoyaleMoveValid }}
              constants={{ ROYALE_VIEW_SIZE }}
            />
          )}
        </aside>
      </div>
      {gs.giantMove && (
        <RoyaleGiantMinimap
          gs={gs}
          selectedGiant={selectedGiant}
          legalMoves={giantLegalMoves}
          onSelect={moveGiantPiece}
          helpers={{ getRoyaleSize, giantPieceCells, getGiantPieceAt }}
        />
      )}
    </div>
  );
}

function RoyaleDeathSummary({ event }) {
  if (!event) return null;

  if (event.type === 'kill') {
    return (
      <div className="royale-death-summary">
        <div className="royale-death-title">Movimiento que te elimino</div>
        <RoyaleDeathReplay event={event} />
        <div>{event.killerName} te ataco con {royalePieceSymbol(event.piece)} usando una tirada de {event.roll}.</div>
        <div>Origen: {event.from.row + 1}, {event.from.col + 1}</div>
        <div>Destino: {event.to.row + 1}, {event.to.col + 1}</div>
      </div>
    );
  }

  if (event.type === 'giant-death') {
    return (
      <div className="royale-death-summary">
        <div className="royale-death-title">Te aplasto una pieza gigante</div>
        <RoyaleDeathReplay event={event} />
        <div>{event.killerName || 'Una casilla especial'} movio {event.giantName} sobre tu posicion.</div>
        <div>Tu posicion: {event.at.row + 1}, {event.at.col + 1}</div>
      </div>
    );
  }

  return (
    <div className="royale-death-summary">
      <div className="royale-death-title">La zona te elimino</div>
      <RoyaleDeathReplay event={event} />
      <div>Quedaste fuera de la zona segura cuando el radio bajo a {event.radius}.</div>
      <div>Tu posicion: {event.at.row + 1}, {event.at.col + 1}</div>
    </div>
  );
}

function getReplayBounds(event) {
  const size = getRoyaleSize(event);
  const points = event.type === 'kill' ? [event.from, event.to] : [event.at];
  const centerRow = Math.round(points.reduce((sum, point) => sum + point.row, 0) / points.length);
  const centerCol = Math.round(points.reduce((sum, point) => sum + point.col, 0) / points.length);

  return {
    startRow: Math.max(0, Math.min(size - 9, centerRow - 4)),
    startCol: Math.max(0, Math.min(size - 9, centerCol - 4)),
  };
}

function isReplayPath(row, col, from, to) {
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  const steps = Math.max(Math.abs(dr), Math.abs(dc));
  if (!steps) return false;

  for (let i = 0; i <= steps; i++) {
    const pathRow = Math.round(from.row + (dr * i) / steps);
    const pathCol = Math.round(from.col + (dc * i) / steps);
    if (pathRow === row && pathCol === col) return true;
  }

  return false;
}

function RoyaleDeathReplay({ event }) {
  const size = getRoyaleSize(event);
  const { startRow, startCol } = getReplayBounds(event);
  const cells = [];

  for (let vr = 0; vr < 9; vr++) {
    for (let vc = 0; vc < 9; vc++) {
      const row = startRow + vr;
      const col = startCol + vc;
      const isKillerFrom = event.type === 'kill' && row === event.from.row && col === event.from.col;
      const isVictim = row === (event.to?.row ?? event.at.row) && col === (event.to?.col ?? event.at.col);
      const isPath = event.type === 'kill' && isReplayPath(row, col, event.from, event.to);
      const zoneDistance = event.type === 'zone-death' ? Math.abs(royaleZoneDistance(row, col, { row: (size - 1) / 2, col: (size - 1) / 2 }) - event.radius) : null;
      const isZoneEdge = zoneDistance !== null && zoneDistance < 0.75;
      const cls = [
        'death-replay-cell',
        (row + col) % 2 === 0 ? 'light' : 'dark',
        isPath ? 'is-path' : '',
        isKillerFrom ? 'is-killer' : '',
        isVictim ? 'is-victim' : '',
        isZoneEdge ? 'is-zone-edge' : '',
      ].filter(Boolean).join(' ');

      cells.push(
        <span key={`${row}-${col}`} className={cls}>
          {isKillerFrom && <b>{royalePieceSymbol(event.piece)}</b>}
          {isVictim && <b>{event.type === 'kill' ? 'X' : '!'}</b>}
        </span>
      );
    }
  }

  return (
    <div className={`death-replay ${event.type}`}>
      <div className="death-replay-grid">{cells}</div>
      <div className="death-replay-caption">
        {event.type === 'kill' ? 'La pieza atacante avanza hasta tu casilla.' : 'Tu posicion quedo fuera del cierre.'}
      </div>
    </div>
  );
}

export {
  initChessRoyale,
  chooseBotRoyaleMove,
  chooseBotRoyaleCard,
  royalePieceSymbol,
  getRoyaleSize,
  getRoyaleViewOrigin,
  isInsideRoyaleView,
  isRoyaleMoveValid,
  getRoyaleVisibleMoves,
  getRoyaleLegalMoves,
  moveRoyalePlayer,
  applyRoyaleRolloff,
  applyGiantMove,
  playRoyaleCardState,
  applyTargetedTactic,
  chooseAutomaticGiantMove,
  chooseRandomMovableGiant,
  getGiantLegalMoves,
  playRoyaleSound,
  ROYALE_DEFAULT_SIZE,
  ROYALE_MIN_SIZE,
  ROYALE_MAX_SIZE,
  ROYALE_VIEW_SIZE,
  ROYALE_GIANT_SIZE,
  ROYALE_MAX_CARDS,
  ROYALE_BASIC_PIECES,
  ROYALE_IMPROVED_PIECES,
  ROYALE_TACTIC_CARDS,
  ROYALE_SOUNDS,
  ROYALE_TACTIC_META,
  ROYALE_GIANT_PIECES,
  ROYALE_PLAYERS,
};
export default ChessRoyaleGame;



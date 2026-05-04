import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
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
} from './logic/actions';
import {
  royaleEngineBrowser,
  initChessRoyale,
  nextAliveTurnIndex,
  getTurnsUntilPlayer,
  occupiedSquaresWithGiants,
  applyBattleRoll,
  mergeGiantMoveOutcome,
  chooseAutomaticGiantMove,
  chooseRandomMovableGiant,
} from './logic/royaleEngine';
import {
  royaleKey,
  clampRoyaleMapSize,
  getRoyaleSize,
  inRoyaleBounds,
  royaleZoneDistance,
  getRoyaleViewOrigin,
  isInsideRoyaleView,
} from './logic/geometry';
import {
  royalePieceSymbol,
  getGiantPieceAt,
  giantPieceCells,
  getRoyalePlayerAt,
  getNeutralPawnAt,
  getRadioactiveCellAt,
  getFogZoneAt,
  isRoyaleLineBlocked,
  isRoyaleMoveValid as isRoyaleMoveValidBase,
  getRoyaleVisibleMoves as getRoyaleVisibleMovesBase,
} from './logic/movements';

const {
  moveRoyalePlayer,
  applyGiantMove,
  playRoyaleCardState,
  applyTargetedTactic,
  applyRoyaleRolloff,
} = royaleEngineBrowser;

const randomInt = max => Math.floor(Math.random() * max);
const isRoyaleMoveValid = (type, from, to, distance, boosted, size = getRoyaleSize(from)) =>
  isRoyaleMoveValidBase(type, from, to, distance, boosted, size);
const getRoyaleVisibleMoves = (gs, player) => getRoyaleVisibleMovesBase(gs, player, getRoyaleViewOrigin);
const getRoyaleLegalMoves = (gs, player, roll) => royaleEngineBrowser.getRoyaleLegalMoves(gs, player, roll);
const getGiantLegalMoves = (gs, giant) => royaleEngineBrowser.getGiantLegalMoves(gs, giant);
const chooseBotRoyaleMove = (gs, player, roll) =>
  chooseBotRoyaleMoveBase(gs, player, roll, { getRoyaleLegalMoves, getRoyalePlayerAt, royaleKey, royaleZoneDistance, randomInt });
const chooseBotRoyaleCard = (gs, player) =>
  chooseBotRoyaleCardBase(gs, player, { getRoyaleLegalMoves, getRoyalePlayerAt, royaleKey, royaleZoneDistance });

function canSeeRoyalePlayer(observer, target, gs) {
  if (!observer?.alive || !target?.alive || observer.id === target.id) return false;
  if (!isInsideRoyaleView(observer, target.row, target.col, getRoyaleSize(gs))) return false;
  const fogZone = getFogZoneAt(gs.fogZones || [], target.row, target.col);
  return !fogZone || fogZone.ownerId === observer.id;
}

function ChessRoyaleGame({ initialState, onBack, online }) {
  const [trapMessage, setTrapMessage] = useState(null);
  const [debugCardPick, setDebugCardPick] = useState(null);
  const [gs, setGs] = useState(initialState);
  const [assignedPlayerId, setAssignedPlayerId] = useState(null);
  const [serverSynced, setServerSynced] = useState(!online);
  const [diceRolling, setDiceRolling] = useState(false);
  const [diceRevealing, setDiceRevealing] = useState(false);
  const [displayedDice, setDisplayedDice] = useState(1);
  const [rolloffDice, setRolloffDice] = useState({ playerId: null, value: 1, revealing: false });
  const diceRevealTimer = useRef(null);
  const rolloffRevealTimer = useRef(null);
  const socketRef = useRef(null);
  const soundStateRef = useRef({ phase: initialState.phase, eventIds: new Set((initialState.events || []).map(event => event.id)) });
  const battleMusicRef = useRef(null);
  const serverUrl = online ? (online.serverUrl || process.env.REACT_APP_SOCKET_URL || '') : '';
  const isNetworkGame = Boolean(serverUrl);
  const joinConfigRef = useRef(online?.config || { playerCount: 2, vsBots: false, mapSize: 60, initialLives: 3 });
  const activeId = gs.turnOrder[gs.currentTurnIndex];
  const activePlayer = gs.players.find(p => p.id === activeId) || gs.players.find(p => p.alive);
  const myPlayerId = assignedPlayerId ?? gs.humanPlayerId;
  const humanPlayer = gs.players.find(p => p.id === myPlayerId) || gs.players.find(p => !p.isBot) || gs.players[0];
  const giantMovePlayer = gs.players.find(p => p.id === gs.giantMove?.playerId);
  const isBotMatch = Boolean(gs.vsBots);
  const isHumanTurn = isNetworkGame ? activePlayer?.id === myPlayerId : (!isBotMatch || activePlayer?.id === humanPlayer?.id);
  // Online fairness: never render the board from rival perspective.
  // In network games we always anchor the camera to the local player.
  const boardPlayer = isNetworkGame
    ? humanPlayer
    : (giantMovePlayer || (isBotMatch && !isHumanTurn ? humanPlayer : activePlayer));
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
  const humanLost =
    gs.phase === 'result' &&
    gs.lastDeathEvent?.victimId === myPlayerId &&
    (gs.vsBots || isNetworkGame);
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
    if (!isNetworkGame) return undefined;
    const socket = io(serverUrl, { path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('assigned', ({ playerId }) => setAssignedPlayerId(playerId));
    socket.on('stateUpdate', next => {
      setGs(next);
      setServerSynced(true);
    });
    socket.emit('join', {
      playerName: online?.playerName?.trim() || 'Jugador',
      config: joinConfigRef.current,
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isNetworkGame, serverUrl, online?.playerName]);

  useEffect(() => {
    if (!diceRolling || !activePlayerId) return undefined;
    const timer = setInterval(() => {
      setDisplayedDice(activePlayerBoosted ? 10 + randomInt(71) : 1 + randomInt(10));
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
    if (isNetworkGame || !gs.vsBots || gs.phase !== 'rolloff') return undefined;
    const nextBot = gs.players.find(player => player.isBot && !gs.rolloff[player.id]);
    if (!nextBot) return undefined;

    const timer = setTimeout(() => setGs(prev => applyRoyaleRolloff(prev, nextBot.id)), 650);
    return () => clearTimeout(timer);
  }, [isNetworkGame, gs.vsBots, gs.phase, gs.rolloff, gs.players]);

  useEffect(() => {
    if (isNetworkGame || gs.giantMove || !gs.vsBots || gs.phase !== 'battle' || !activePlayer?.isBot || gs.botThinkingPlayerId) return undefined;

    setGs(prev => ({
      ...prev,
      botThinkingPlayerId: activePlayer.id,
      currentRoll: null,
      botRevealedRoll: null,
      botPendingCardText: null,
      minimapPlayerId: null,
      selectedPlayerId: null,
      pendingTacticCard: null,
      message: `${activePlayer.name} tirando. Faltan ${getTurnsUntilPlayer(prev, myPlayerId)} turnos para ti.`,
    }));
    return undefined;
  }, [isNetworkGame, myPlayerId, gs.giantMove, gs.vsBots, gs.phase, activePlayer?.id, activePlayer?.isBot, activePlayer?.name, gs.botThinkingPlayerId]);

  useEffect(() => {
    if (isNetworkGame || gs.giantMove || !gs.vsBots || gs.phase !== 'battle' || !activePlayer?.isBot || gs.botThinkingPlayerId !== activePlayer.id) return undefined;

    const timer = setTimeout(() => {
      setGs(prev => {
        const bot = prev.players.find(p => p.id === prev.turnOrder[prev.currentTurnIndex]);
        if (!bot?.isBot) return prev;
        if (bot.trappedTurns && bot.trappedTurns > 0) {
          return {
            ...prev,
            players: prev.players.map(p => p.id === bot.id ? { ...p, trappedTurns: p.trappedTurns - 1 } : p),
            currentTurnIndex: nextAliveTurnIndex(prev.players, prev.turnOrder, prev.currentTurnIndex),
            currentRoll: null,
            cardUsedThisTurn: false,
            botThinkingPlayerId: null,
            botRevealedRoll: null,
            botPendingCardText: null,
            message: `${bot.name} esta atrapado por el Cubo de Peones y pierde su turno.`,
          };
        }

        if (!prev.currentRoll) {
          const card = chooseBotRoyaleCard(prev, bot);
          const cardState = card ? playRoyaleCardState(prev, bot.id, card.id) : prev;
          const activeBot = cardState.players.find(p => p.id === cardState.turnOrder[cardState.currentTurnIndex]);
          const roll = activeBot.boosted ? 10 + randomInt(71) : 1 + randomInt(10);
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
  }, [isNetworkGame, gs.giantMove, gs.vsBots, gs.phase, gs.currentRoll, activePlayer?.id, activePlayer?.isBot, gs.botThinkingPlayerId]);

  function rollForPlayer(playerId) {
    if (isNetworkGame) {
      if (gs.phase !== 'rolloff' || gs.rolloff[playerId]) return;
      if (rolloffDice.playerId && rolloffDice.playerId !== playerId) return;
      if (!rolloffDice.playerId) {
        setRolloffDice({ playerId, value: 1 + randomInt(10), revealing: false });
        return;
      }
      socketRef.current?.emit('action', { type: 'rolloffRoll', playerId });
      setRolloffDice({ playerId: null, value: 1, revealing: false });
      return;
    }
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
    setGs(prev => applyBattleRoll(prev, roll));
  }

  function handleDiceClick() {
    if (!isHumanDiceStage || diceRevealing) return;
    if (activePlayer?.trappedTurns > 0) {
      setTrapMessage('Estas detenido por un turno — Cubo de Peones');
      setTimeout(() => setTrapMessage(null), 2500);
      if (isNetworkGame) {
        socketRef.current?.emit('action', { type: 'trappedSkip' });
        return;
      }
      setGs(prev => ({
        ...prev,
        players: prev.players.map(p => p.id === activePlayer.id ? { ...p, trappedTurns: p.trappedTurns - 1 } : p),
        currentTurnIndex: nextAliveTurnIndex(gs.players, gs.turnOrder, gs.currentTurnIndex),
        currentRoll: null,
        cardUsedThisTurn: false,
        message: `${activePlayer.name} esta atrapado por el Cubo de Peones y pierde su turno.`,
      }));
      return;
    }
    if (isNetworkGame) {
      socketRef.current?.emit('action', { type: 'battleRoll' });
      return;
    }
    const roll = activePlayer?.boosted ? 10 + randomInt(71) : 1 + randomInt(10);
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
    if (isNetworkGame) {
      socketRef.current?.emit('action', { type: 'closeMinimap' });
      return;
    }
    setGs(prev => ({ ...prev, minimapPlayerId: null, pendingTacticCard: null }));
  }

  function playCard(cardId) {
    if (!activePlayer || !isHumanTurn || gs.currentRoll || gs.giantMove || gs.pendingTacticCard) return;
    if (isNetworkGame) {
      socketRef.current?.emit('action', { type: 'playCard', cardId });
      return;
    }
    setGs(prev => playRoyaleCardState(prev, activePlayer.id, cardId));
  }

  function moveTo(row, col) {
    if (gs.giantMove || gs.phase !== 'battle' || !activePlayer || !gs.currentRoll || !isHumanTurn) return;
    const isVisibleMove = visibleMoves.some(([r, c]) => r === row && c === col);
    if (!isVisibleMove) return;
    if (isNetworkGame) {
      socketRef.current?.emit('action', { type: 'move', row, col });
      return;
    }
    setGs(prev => moveRoyalePlayer(prev, { row, col }));
  }

  function moveFromMinimap(row, col) {
    if (gs.pendingTacticCard && activePlayer?.id === gs.pendingTacticCard.playerId && pendingTacticCard) {
      if (isNetworkGame) {
        socketRef.current?.emit('action', { type: 'tacticTarget', row, col });
        return;
      }
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
    if (isNetworkGame) {
      socketRef.current?.emit('action', { type: 'boostedMove', row, col });
      return;
    }
    setGs(prev => ({ ...moveRoyalePlayer(prev, destination), minimapPlayerId: null }));
  }

  function moveGiantPiece(row, col) {
    if (isNetworkGame) {
      socketRef.current?.emit('action', { type: 'giantMove', row, col });
      return;
    }
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
      return mergeGiantMoveOutcome(prev, result);
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

function debugGiveHumanCard(specialType, type, effect) {
  setGs(prev => {
    const human = prev.players.find(player => player.id === prev.humanPlayerId);
    if (!human) return prev;
    const card = makeRoyaleCard(specialType, type === 'null' ? null : type, effect);
    return {
      ...prev,
      players: prev.players.map(player => player.id === human.id ? { ...player, cards: addRoyaleCards(player.cards || [], [card]) } : player),
      message: `Debug: carta ${getRoyaleCardLabel(card)} agregada a tu mano.`,
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
    if (isNetworkGame) {
      socketRef.current?.emit('action', { type: 'restart' });
      return;
    }
    setGs(initChessRoyale(gs.config));
  }

  const waitingOverlay = isNetworkGame && !serverSynced;

  return (
    <div className="royale-screen">
      {waitingOverlay && (
        <div className="result-overlay" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="result-card" style={{ maxWidth: 420 }}>
            <div className="result-title">Esperando jugadores</div>
            <div className="result-sub">La partida comenzara cuando se unan todos los jugadores al servidor.</div>
          </div>
        </div>
      )}
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

          {debugEnabled && !isNetworkGame && (
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
                <select
                    value={debugCardPick || ''}
                    onChange={e => setDebugCardPick(e.target.value || null)}
                    style={{ fontSize: '0.75rem', padding: '4px 6px' }}
                  >
                    <option value="">— Elegir carta —</option>
                    <optgroup label="Piezas básicas">
                      {ROYALE_BASIC_PIECES.map(type => (
                        <option key={`basic-${type}`} value={`basic|${type}|piece`}>
                          {PIECES[type]?.label} básica
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Piezas mejoradas">
                      {ROYALE_IMPROVED_PIECES.map(type => (
                        <option key={`improved-${type}`} value={`improved|${type}|piece`}>
                          {PIECES[type]?.label} mejorada
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Tácticas">
                      {ROYALE_TACTIC_CARDS.map(effect => (
                        <option key={`tactic-${effect}`} value={`reveal|null|${effect}`}>
                          {ROYALE_TACTIC_META[effect]?.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <button
                    className="btn btn-ghost"
                    disabled={!debugCardPick}
                    onClick={() => {
                      if (!debugCardPick) return;
                      const [specialType, type, effect] = debugCardPick.split('|');
                      debugGiveHumanCard(specialType, type, effect);
                    }}
                  >
                    Agregar
                  </button>
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
                    {activePlayer.trappedTurns > 0 && (
                      <div className="royale-turn-alert" style={{ background: '#ff7676', color: '#fff' }}>
                        Estas atrapado — pierdes este turno
                      </div>
                    )}
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
                      <button
                        className="btn btn-ghost royale-fog-btn"
                        onClick={() => {
                          if (isNetworkGame) socketRef.current?.emit('action', { type: 'openMinimap' });
                          else setGs(prev => ({ ...prev, minimapPlayerId: activePlayer.id }));
                        }}
                      >
                        Tirar en minimapa
                      </button>
                    )}
                    {activePlayer.revealEnemies && (
                      <button
                        className="btn btn-ghost royale-fog-btn"
                        onClick={() => {
                          if (isNetworkGame) socketRef.current?.emit('action', { type: 'openMinimap' });
                          else setGs(prev => ({ ...prev, minimapPlayerId: activePlayer.id }));
                        }}
                      >
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
      {trapMessage && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: '#ff7676',
          color: '#fff',
          fontWeight: 500,
          fontSize: '1.1rem',
          padding: '18px 32px',
          borderRadius: '12px',
          zIndex: 100,
          textAlign: 'center',
          pointerEvents: 'none',
          boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
        }}>
          ♟ {trapMessage}
        </div>
      )}
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



import { PIECES } from '../shared/pieces';
import { ROYALE_MAX_CARDS, ROYALE_SOUNDS, ROYALE_TACTIC_META } from './constants';
import { royalePieceSymbol } from './movements';

export const makeRoyaleCard = (specialType, type, effect = 'piece') => ({
  id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  type,
  effect,
  boosted: specialType === 'improved',
  source: specialType,
});

export const getRoyaleCardLabel = card => {
  if (card.effect !== 'piece') return ROYALE_TACTIC_META[card.effect]?.label || 'Tactica';
  return PIECES[card.type]?.label || 'Carta';
};

export const getRoyaleCardSymbol = card => {
  if (card.effect !== 'piece') return ROYALE_TACTIC_META[card.effect]?.symbol || '\u25C9';
  return royalePieceSymbol(card.type);
};

export const getRoyaleCardKind = card => {
  if (card.effect !== 'piece') return 'Tactica';
  return card.boosted ? 'Mejorada' : 'Basica';
};

export const addRoyaleCards = (cards = [], newCards = []) => [...cards, ...newCards].slice(0, ROYALE_MAX_CARDS);

export function playRoyaleSound(name) {
  const src = ROYALE_SOUNDS[name];
  if (!src || typeof Audio === 'undefined') return;
  const audio = new Audio(src);
  audio.volume = 0.72;
  audio.play().catch(() => {});
}

export function createWallPawns(gs, playerId, center, deps) {
  const { getRoyaleSize, occupiedSquaresWithGiants, royaleKey, inRoyaleBounds, randomInt } = deps;
  const size = getRoyaleSize(gs);
  const occupied = occupiedSquaresWithGiants(gs.players || [], gs.giantPieces || []);
  (gs.neutralPawns || []).forEach(pawn => occupied.add(royaleKey(pawn.row, pawn.col)));
  const isFree = pos =>
    inRoyaleBounds(pos.row, pos.col, size) &&
    !gs.closedCells[royaleKey(pos.row, pos.col)] &&
    !occupied.has(royaleKey(pos.row, pos.col));

  const buildCandidates = orientation => {
    const axis = orientation === 'horizontal' ? 'col' : 'row';
    const fixedAxis = orientation === 'horizontal' ? 'row' : 'col';
    const fixedValue = center[fixedAxis];
    const values = [];
    for (let delta = -9; delta <= 9; delta++) {
      const pos = orientation === 'horizontal'
        ? { row: fixedValue, col: center.col + delta }
        : { row: center.row + delta, col: fixedValue };
      if (isFree(pos)) values.push({ pos, value: pos[axis] });
    }
    values.sort((a, b) => a.value - b.value);
    return values;
  };
  const hasCenter = (items, orientation) => {
    const value = orientation === 'horizontal' ? center.col : center.row;
    return items.some(item => item.value === value);
  };
  const contiguousSegments = items => {
    const segments = [];
    let segment = [];
    for (let i = 0; i < items.length; i++) {
      if (!segment.length || items[i].value === segment[segment.length - 1].value + 1) {
        segment.push(items[i]);
      } else {
        segments.push(segment);
        segment = [items[i]];
      }
    }
    if (segment.length) segments.push(segment);
    return segments;
  };
  const bestSegment = ['horizontal', 'vertical']
    .map(orientation => contiguousSegments(buildCandidates(orientation))
      .filter(segment => hasCenter(segment, orientation))
      .sort((a, b) => b.length - a.length)[0]
      ? { orientation, segment: contiguousSegments(buildCandidates(orientation))
        .filter(segment => hasCenter(segment, orientation))
        .sort((a, b) => b.length - a.length)[0] }
      : null)
    .filter(Boolean)
    .sort((a, b) => b.segment.length - a.segment.length)[0];
  if (!bestSegment || bestSegment.segment.length < 3) return [];
  const maxLength = Math.min(10, bestSegment.segment.length);
  const targetLength = Math.min(maxLength, 3 + randomInt(8));
  const centerValue = bestSegment.orientation === 'horizontal' ? center.col : center.row;
  const centerIndex = bestSegment.segment.findIndex(item => item.value === centerValue);
  let start = Math.max(0, centerIndex - Math.floor(targetLength / 2));
  if (start + targetLength > bestSegment.segment.length) {
    start = bestSegment.segment.length - targetLength;
  }
  const line = bestSegment.segment.slice(start, start + targetLength).map(item => item.pos);
  return line.map((pos, index) => ({
    id: `wall-${Date.now()}-${playerId}-${index}`,
    ...pos,
    ownerId: playerId,
  }));
}

export function createScorchedArea(gs, playerId, target, deps) {
  const { getRoyaleSize, inRoyaleBounds, royaleKey, randomInt } = deps;
  const size = getRoyaleSize(gs);
  const side = 5 + randomInt(11);
  const half = Math.floor(side / 2);
  const cells = [];
  for (let row = target.row - half; row <= target.row + half; row++) {
    for (let col = target.col - half; col <= target.col + half; col++) {
      if (!inRoyaleBounds(row, col, size)) continue;
      if (gs.closedCells[royaleKey(row, col)]) continue;
      cells.push({
        id: `rad-${Date.now()}-${playerId}-${row}-${col}`,
        ownerId: playerId,
        row,
        col,
      });
    }
  }
  return { side, cells };
}

export function applyTargetedTactic(gs, playerId, card, target, deps) {
  const { createScorchedArea: createScorchedAreaFromDeps, createWallPawns: createWallPawnsFromDeps, royaleKey } = deps;
  if (!card || !ROYALE_TACTIC_META[card.effect]?.target) return gs;
  if (gs.phase !== 'battle' || gs.currentRoll || gs.giantMove || gs.turnOrder[gs.currentTurnIndex] !== playerId) return gs;
  if (gs.cardUsedThisTurn) return { ...gs, pendingTacticCard: null, minimapPlayerId: null, message: 'Ya usaste una carta este turno.' };

  const actor = gs.players.find(player => player.id === playerId);
  if (!actor) return gs;
  let message = '';
  let fogZones = gs.fogZones || [];
  let radioactiveCells = gs.radioactiveCells || [];
  let neutralPawns = gs.neutralPawns || [];

  if (card.effect === 'fog') {
    const enemyZones = (gs.players || [])
      .filter(player => player.alive && player.id !== playerId)
      .map((enemy, index) => ({
        id: `fog-${Date.now()}-${playerId}-${index}`,
        ownerId: playerId,
        row: enemy.row,
        col: enemy.col,
        turnsLeft: 2,
      }));
    if (!enemyZones.length) return { ...gs, pendingTacticCard: null, minimapPlayerId: null, message: 'No hay enemigos vivos para afectar con Niebla de Guerra.' };
    fogZones = [...fogZones, ...enemyZones];
    message = `${actor.name} activo Niebla de Guerra sobre todos los enemigos.`;
  }

  if (card.effect === 'scorched') {
    const { side, cells } = createScorchedAreaFromDeps(gs, playerId, target);
    const newKeys = new Set(cells.map(cell => royaleKey(cell.row, cell.col)));
    radioactiveCells = [
      ...radioactiveCells.filter(cell => !newKeys.has(royaleKey(cell.row, cell.col))),
      ...cells,
    ];
    message = `${actor.name} activo Tierra Quemada en un area de ${side} x ${side} casillas.`;
  }

  if (card.effect === 'wall') {
    const created = createWallPawnsFromDeps(gs, playerId, target);
    if (!created.length) return { ...gs, message: 'No hay casillas vacias suficientes para levantar el Muro de Peones.' };
    neutralPawns = [...neutralPawns, ...created];
    message = `${actor.name} levanto un Muro de Peones con ${created.length} obstaculo${created.length === 1 ? '' : 's'}.`;
  }

  return {
    ...gs,
    players: gs.players.map(player => player.id === playerId ? { ...player, cards: (player.cards || []).filter(item => item.id !== card.id) } : player),
    fogZones,
    radioactiveCells,
    neutralPawns,
    cardUsedThisTurn: true,
    pendingTacticCard: null,
    minimapPlayerId: null,
    message: `${message} Tira el dado y continua tu turno.`,
  };
}

export function playRoyaleCardState(gs, playerId, cardId, deps) {
  const { applyTargetedTacticMeta, getRoyaleCardLabel } = deps;
  if (gs.phase !== 'battle' || gs.currentRoll || gs.giantMove || gs.pendingTacticCard) return gs;
  const activeId = gs.turnOrder[gs.currentTurnIndex];
  if (activeId !== playerId) return gs;
  if (gs.cardUsedThisTurn) return { ...gs, message: 'Solo puedes usar 1 carta por turno.' };
  const active = gs.players.find(player => player.id === playerId);
  const selectedCard = active?.cards?.find(card => card.id === cardId);
  if (selectedCard && applyTargetedTacticMeta[selectedCard.effect]?.target) {
    return {
      ...gs,
      pendingTacticCard: { playerId, cardId },
      minimapPlayerId: playerId,
      message: `Elige casilla para ${getRoyaleCardLabel(selectedCard)} en el minimapa.`,
    };
  }

  let message = '';
  let nextFogZones = gs.fogZones || [];
  const players = gs.players.map(player => {
    if (player.id !== playerId || !player.alive) return player;
    const cards = player.cards || [];
    const card = cards.find(item => item.id === cardId);
    if (!card) return player;
    if (card.effect === 'reveal') {
      message = `${player.name} uso carta de Vision. Los enemigos quedan marcados este turno.`;
      return {
        ...player,
        cards: cards.filter(item => item.id !== cardId),
        revealEnemies: true,
      };
    }
    if (card.effect === 'secondChance') {
      message = `${player.name} preparo Segunda Oportunidad. Si recibe un golpe letal, reaparecera en el borde.`;
      return {
        ...player,
        cards: cards.filter(item => item.id !== cardId),
        secondChance: true,
      };
    }
    if (card.effect === 'fog') {
      const enemyZones = (gs.players || [])
        .filter(enemy => enemy.alive && enemy.id !== player.id)
        .map((enemy, index) => ({
          id: `fog-${Date.now()}-${player.id}-${index}`,
          ownerId: player.id,
          row: enemy.row,
          col: enemy.col,
          turnsLeft: 2,
        }));
      if (!enemyZones.length) return player;
      message = `${player.name} activo Niebla de Guerra sobre todos los enemigos.`;
      nextFogZones = [...nextFogZones, ...enemyZones];
      return {
        ...player,
        cards: cards.filter(item => item.id !== cardId),
      };
    }
    message = `${player.name} uso carta de ${PIECES[card.type].label}${card.boosted ? ' mejorada' : ''}.`;
    return {
      ...player,
      cards: cards.filter(item => item.id !== cardId),
      type: card.type,
      boosted: card.boosted,
      temporaryPower: true,
      pendingPower: null,
    };
  });

  if (!message) return gs;
  const revealPlayer = players.find(player => player.id === playerId && player.revealEnemies);
  return {
    ...gs,
    players,
    fogZones: nextFogZones,
    cardUsedThisTurn: true,
    minimapPlayerId: revealPlayer ? playerId : gs.minimapPlayerId,
    message: `${message} Tira el dado y elige tu movimiento.`,
  };
}

export function applyGiantPieceDamage(players, giantPieces, movedGiant, closedCells, mapSize, actor = {}, deps) {
  const {
    giantPieceCells,
    royaleKey,
    randomRoyaleEdgeSquare,
    randomRoyaleSquare,
    occupiedSquaresWithGiants,
    transferEliminatedCards,
  } = deps;
  let message = '';
  const events = [];
  const impactKeys = new Set(giantPieceCells(movedGiant).map(cell => royaleKey(cell.row, cell.col)));
  const hitPlayers = players.filter(player => player.alive && impactKeys.has(royaleKey(player.row, player.col)));
  const occupied = occupiedSquaresWithGiants(
    players.filter(player => player.alive && !impactKeys.has(royaleKey(player.row, player.col))),
    giantPieces
  );

  const updated = players.map(player => {
    if (!player.alive || !impactKeys.has(royaleKey(player.row, player.col))) return player;
    const lives = player.lives - 1;
    message += ` ${player.name} fue golpeado por ${movedGiant.name} y pierde una vida.`;
    if (lives <= 0) {
      if (player.secondChance) {
        const edge = randomRoyaleEdgeSquare(mapSize, occupied, closedCells);
        if (edge) {
          occupied.add(royaleKey(edge.row, edge.col));
          message += ` ${player.name} activo Segunda Oportunidad y reaparece en el borde.`;
          return { ...player, lives: 1, row: edge.row, col: edge.col, type: 'K', boosted: false, temporaryPower: false, pendingPower: null, cards: [], revealEnemies: false, secondChance: false };
        }
      }
      events.push({
        id: `giant-${Date.now()}-${movedGiant.id}-${player.id}`,
        type: 'giant-death',
        text: `${actor.name || 'Una pieza gigante'} elimino a ${player.name}.`,
        killerId: actor.id,
        killerName: actor.name,
        victimId: player.id,
        victimName: player.name,
        giantId: movedGiant.id,
        giantName: movedGiant.name,
        piece: movedGiant.type,
        at: { row: player.row, col: player.col },
        mapSize,
      });
      return { ...player, lives: 0, alive: false, cards: [] };
    }

    const respawn = randomRoyaleSquare(mapSize, occupied, closedCells);
    occupied.add(royaleKey(respawn.row, respawn.col));
    return { ...player, lives, row: respawn.row, col: respawn.col, type: 'K', boosted: false, temporaryPower: false, pendingPower: null, cards: [], revealEnemies: false };
  });

  if (hitPlayers.length) {
    events.push({
      id: `giant-hit-${Date.now()}-${movedGiant.id}`,
      type: 'giant-hit',
      text: `${movedGiant.name} golpeo a ${hitPlayers.map(player => player.name).join(', ')}.`,
      killerId: actor.id,
      killerName: actor.name,
      giantId: movedGiant.id,
      giantName: movedGiant.name,
      piece: movedGiant.type,
      mapSize,
    });
  }

  const playersWithLoot = events
    .filter(event => event.type === 'giant-death' && event.killerId)
    .reduce((acc, event) => {
      const victim = players.find(player => player.id === event.victimId);
      const stolenCards = victim?.cards || [];
      const killer = acc.find(player => player.id === event.killerId);
      const acceptedCards = stolenCards.slice(0, Math.max(0, ROYALE_MAX_CARDS - (killer?.cards?.length || 0)));
      if (acceptedCards.length) message += ` ${event.killerName} robo ${acceptedCards.length} carta${acceptedCards.length === 1 ? '' : 's'} de ${event.victimName}.`;
      return transferEliminatedCards(acc, event.killerId, event.victimId, acceptedCards);
    }, updated);

  return { players: playersWithLoot, message, events };
}

export function applyGiantMove(gs, actorId, giantId, destination, deps) {
  const {
    getRoyaleSize,
    isGiantMoveValid,
    isGiantPlacementClear,
    applyGiantPieceDamage,
  } = deps;
  const mapSize = getRoyaleSize(gs);
  const giant = gs.giantPieces?.find(piece => piece.id === giantId);
  const actor = gs.players.find(player => player.id === actorId);
  if (!giant || !actor) return null;
  const movedGiant = { ...giant, row: destination.row, col: destination.col };
  if (!isGiantMoveValid(giant.type, giant, destination)) return null;
  if (!isGiantPlacementClear(mapSize, movedGiant, gs.closedCells, gs.giantPieces, giant.id)) return null;

  const giantPieces = gs.giantPieces.map(piece => piece.id === giant.id ? movedGiant : piece);
  const damage = applyGiantPieceDamage(gs.players, giantPieces, movedGiant, gs.closedCells, mapSize, actor);
  const moveEvent = {
    id: `giant-move-${Date.now()}-${movedGiant.id}`,
    type: 'giant-move',
    text: `${actor.name} movio ${movedGiant.name}.`,
    playerId: actor.id,
    playerName: actor.name,
    giantId: movedGiant.id,
    giantName: movedGiant.name,
    from: { row: giant.row, col: giant.col },
    to: destination,
    piece: movedGiant.type,
    mapSize,
  };
  return {
    players: damage.players,
    giantPieces,
    events: [moveEvent, ...damage.events],
    message: `${actor.name} movio ${movedGiant.name}.${damage.message || ' No golpeo a nadie.'}`,
  };
}

export function moveRoyalePlayer(gs, destination, deps) {
  const {
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
  } = deps;
  const mapSize = getRoyaleSize(gs);
  const activeId = gs.turnOrder[gs.currentTurnIndex];
  const active = gs.players.find(p => p.id === activeId);
  if (!active || !active.alive || !gs.currentRoll) return gs;
  if (gs.closedCells[royaleKey(destination.row, destination.col)]) return gs;
  if (getGiantPieceAt(gs.giantPieces, destination.row, destination.col)) return gs;
  if (getNeutralPawnAt(gs.neutralPawns || [], destination.row, destination.col)) return gs;
  if ((active.type === 'Q' || active.type === 'R' || active.type === 'B') && isRoyaleLineBlocked(gs, active, destination, active.id)) return gs;
  if (!isRoyaleMoveValid(active.type, active, destination, gs.currentRoll, active.boosted, mapSize)) return gs;

  let message = `${active.name} avanzo ${gs.currentRoll}.`;
  const from = { row: active.row, col: active.col };
  const moveEvent = {
    id: `move-${Date.now()}-${active.id}-${gs.roundsCompleted}`,
    type: 'move',
    text: `${active.name} movio de ${from.row + 1},${from.col + 1} a ${destination.row + 1},${destination.col + 1}.`,
    playerId: active.id,
    playerName: active.name,
    from,
    to: destination,
    roll: gs.currentRoll,
    piece: active.type,
    turn: gs.roundsCompleted + 1,
    mapSize,
  };
  const events = [moveEvent];
  const occupied = occupiedSquaresWithGiants(gs.players, gs.giantPieces || [], active.id);
  const target = getRoyalePlayerAt(gs.players, destination.row, destination.col, active.id);
  let stolenCards = [];
  let players = gs.players.map(player => {
    if (player.id !== active.id) return player;
    return { ...player, row: destination.row, col: destination.col, type: 'K', boosted: false, temporaryPower: false, pendingPower: null, revealEnemies: false };
  });

  if (target) {
    players = players.map(player => {
      if (player.id !== target.id) return player;
      const lives = player.lives - 1;
      message = `${active.name} ataco a ${player.name}. ${player.name} pierde una vida.`;
      if (lives <= 0) {
        if (player.secondChance) {
          const edge = randomRoyaleEdgeSquare(mapSize, occupied, gs.closedCells);
          if (edge) {
            occupied.add(royaleKey(edge.row, edge.col));
            message = `${message} ${player.name} activo Segunda Oportunidad y reaparece en el borde.`;
            return { ...player, lives: 1, row: edge.row, col: edge.col, type: 'K', boosted: false, temporaryPower: false, pendingPower: null, cards: [], revealEnemies: false, secondChance: false };
          }
        }
        events.push({
          id: `kill-${Date.now()}-${active.id}-${player.id}-${gs.roundsCompleted}`,
          type: 'kill',
          text: `${active.name} elimino a ${player.name}.`,
          killerId: active.id,
          killerName: active.name,
          victimId: player.id,
          victimName: player.name,
          from,
          to: destination,
          roll: gs.currentRoll,
          piece: active.type,
          turn: gs.roundsCompleted + 1,
          mapSize,
        });
        stolenCards = (player.cards || []).slice(0, Math.max(0, ROYALE_MAX_CARDS - ((active.cards || []).length)));
        if (stolenCards.length) message = `${message} ${active.name} robo ${stolenCards.length} carta${stolenCards.length === 1 ? '' : 's'} de ${player.name}.`;
        return { ...player, lives: 0, alive: false, cards: [] };
      }
      const respawn = randomRoyaleSquare(mapSize, occupied, gs.closedCells);
      occupied.add(royaleKey(respawn.row, respawn.col));
      return { ...player, lives, row: respawn.row, col: respawn.col, type: 'K', boosted: false, temporaryPower: false, pendingPower: null, cards: [], revealEnemies: false };
    });
    if (stolenCards.length) {
      players = transferEliminatedCards(players, active.id, target.id, stolenCards);
    }
  }

  let giantPieces = gs.giantPieces || [];
  let giantMove = null;
  let specials = gs.specials;
  let neutralPawns = gs.neutralPawns || [];
  let radioactiveCells = gs.radioactiveCells || [];
  let fogZones = gs.fogZones || [];
  const moved = players.find(p => p.id === active.id);
  const specialType = gs.specials[royaleKey(moved.row, moved.col)];
  if (specialType) {
    const specialKey = royaleKey(moved.row, moved.col);
    const { [specialKey]: _claimedSpecial, ...remainingSpecials } = specials;
    specials = remainingSpecials;
    const special = applyRoyaleSpecial(moved, specialType);
    message = `${message} ${special.text}`;
    players = players.map(player => player.id === active.id ? special.player : player);
    if (specialType === 'special') {
      if (active.isBot) {
        const choice = chooseAutomaticGiantMove({ ...gs, players, giantPieces, closedCells: gs.closedCells, mapSize });
        const giantResult = choice ? applyGiantMove({ ...gs, players, giantPieces, closedCells: gs.closedCells, mapSize }, active.id, choice.giant.id, choice.move) : null;
        if (giantResult) {
          players = giantResult.players;
          giantPieces = giantResult.giantPieces;
          events.push(...giantResult.events);
          message = `${message} ${giantResult.message}`;
        } else {
          message = `${message} No hay movimiento gigante disponible.`;
        }
      } else {
        const selectedGiant = chooseRandomMovableGiant({ ...gs, players, giantPieces, closedCells: gs.closedCells, mapSize });
        if (selectedGiant) {
          giantMove = { playerId: active.id, selectedId: selectedGiant.id };
          message = `${message} Te toco ${selectedGiant.name}. Elige su destino en el minimapa grande.`;
        } else {
          message = `${message} No hay movimiento gigante disponible.`;
        }
      }
    }
  }

  const activeAfterMove = players.find(p => p.id === active.id);
  const radioactiveCell = activeAfterMove?.alive ? getRadioactiveCellAt(radioactiveCells, activeAfterMove.row, activeAfterMove.col) : null;
  if (radioactiveCell) {
    if (activeAfterMove.secondChance) {
      const occupiedForEdge = occupiedSquaresWithGiants(players.filter(player => player.alive && player.id !== active.id), giantPieces);
      neutralPawns.forEach(pawn => occupiedForEdge.add(royaleKey(pawn.row, pawn.col)));
      const edge = randomRoyaleEdgeSquare(mapSize, occupiedForEdge, gs.closedCells);
      if (edge) {
        players = players.map(player => player.id === active.id ? { ...player, lives: 1, row: edge.row, col: edge.col, type: 'K', boosted: false, temporaryPower: false, pendingPower: null, cards: [], revealEnemies: false, secondChance: false } : player);
        message = `${message} La Tierra Quemada se activo, pero Segunda Oportunidad salvo a ${activeAfterMove.name}.`;
      }
    } else {
      players = players.map(player => player.id === active.id ? { ...player, lives: 0, alive: false, cards: [], revealEnemies: false } : player);
      events.push({
        id: `rad-${Date.now()}-${active.id}-${gs.roundsCompleted}`,
        type: 'radioactive-death',
        text: `${active.name} fue eliminado por Tierra Quemada.`,
        victimId: active.id,
        victimName: active.name,
        at: { row: activeAfterMove.row, col: activeAfterMove.col },
        turn: gs.roundsCompleted + 1,
        mapSize,
      });
      message = `${message} ${active.name} termino en Tierra Quemada y fue eliminado.`;
    }
  }

  fogZones = fogZones
    .map(zone => zone.ownerId === active.id ? { ...zone, turnsLeft: zone.turnsLeft - 1 } : zone)
    .filter(zone => zone.turnsLeft > 0);

  let closedCells = gs.closedCells;
  let closedCount = gs.closedCount;
  let roundsCompleted = gs.roundsCompleted;
  let zoneRadius = gs.zoneRadius;
  let nextIndex = nextAliveTurnIndex(players, gs.turnOrder, gs.currentTurnIndex);
  let roundMoves = [...new Set([...(gs.roundMoves || []), active.id])];
  const aliveBeforeZone = players.filter(p => p.alive);
  const shouldShrinkZone = aliveBeforeZone.length > 1 && aliveBeforeZone.every(player => roundMoves.includes(player.id));

  if (shouldShrinkZone) {
    const closing = shrinkRoyaleZone({ ...gs, closedCount, zoneRadius, mapSize });
    closedCells = closing.closedCells;
    closedCount = closing.closedCount;
    zoneRadius = closing.zoneRadius;
    roundsCompleted++;
    roundMoves = [];
    message = `${message} Todos jugaron esta ronda. La zona se reduce a radio ${zoneRadius}. ${closing.added} casillas quedaron fuera.`;
    const zoneDamage = applyClosedZoneDamage(players, closedCells, { turn: roundsCompleted, radius: zoneRadius, mapSize, giantPieces });
    players = zoneDamage.players;
    events.push(...zoneDamage.events);
    message = `${message}${zoneDamage.message}`;
    nextIndex = nextAliveTurnIndex(players, gs.turnOrder, gs.currentTurnIndex);
  } else {
    const remaining = aliveBeforeZone.filter(player => !roundMoves.includes(player.id)).length;
    message = `${message} La zona se movera cuando ${remaining} jugador${remaining === 1 ? '' : 'es'} mas termine${remaining === 1 ? '' : 'n'} su turno.`;
  }

  const alive = players.filter(p => p.alive);
  const humanPlayer = gs.vsBots ? players.find(p => p.id === gs.humanPlayerId) : null;
  const nextEvents = keepRoyaleEvents([...(gs.events || []), ...events]);
  const lastDeathEvent = events.find(event => event.victimId === gs.humanPlayerId && (event.type === 'kill' || event.type === 'zone-death' || event.type === 'giant-death' || event.type === 'radioactive-death')) || gs.lastDeathEvent;
  if (gs.vsBots && humanPlayer && !humanPlayer.alive) {
    return { ...gs, players, giantPieces, neutralPawns, radioactiveCells, fogZones, specials, closedCells, closedCount, roundsCompleted, roundMoves, zoneRadius, events: nextEvents, lastDeathEvent, phase: 'result', winner: alive[0]?.id || null, currentRoll: null, botThinkingPlayerId: null, botRevealedRoll: null, botPendingCardText: null, minimapPlayerId: null, selectedPlayerId: null, pendingTacticCard: null, giantMove: null, message: 'Has sido eliminado de ChessRoyale.' };
  }

  if (alive.length === 1) {
    return { ...gs, players, giantPieces, neutralPawns, radioactiveCells, fogZones, specials, closedCells, closedCount, roundsCompleted, roundMoves, zoneRadius, events: nextEvents, lastDeathEvent, phase: 'result', winner: alive[0].id, currentRoll: null, botRevealedRoll: null, botPendingCardText: null, minimapPlayerId: null, selectedPlayerId: null, pendingTacticCard: null, giantMove: null, message: `${alive[0].name} gana ChessRoyale.` };
  }

  return {
    ...gs,
    players,
    giantPieces,
    neutralPawns,
    radioactiveCells,
    fogZones,
    specials,
    closedCells,
    closedCount,
    roundsCompleted,
    roundMoves,
    zoneRadius,
    events: nextEvents,
    lastDeathEvent,
    currentTurnIndex: nextIndex,
    currentRoll: null,
    cardUsedThisTurn: false,
    botRevealedRoll: null,
    botPendingCardText: null,
    minimapPlayerId: null,
    selectedPlayerId: null,
    pendingTacticCard: null,
    giantMove,
    message,
  };
}

export function applyRoyaleRolloff(gs, playerId, forcedRoll = null, deps) {
  const { randomInt } = deps;
  if (gs.phase !== 'rolloff' || gs.rolloff[playerId]) return gs;

  const roll = forcedRoll || 1 + randomInt(10);
  const rolloff = { ...gs.rolloff, [playerId]: roll };
  const allRolled = gs.players.every(p => rolloff[p.id]);
  if (!allRolled) {
    return { ...gs, rolloff, message: `${gs.players.find(p => p.id === playerId).name} saco ${roll}.` };
  }

  const ordered = [...gs.players]
    .sort((a, b) => rolloff[b.id] - rolloff[a.id] || a.id.localeCompare(b.id))
    .map(p => p.id);
  const top = rolloff[ordered[0]];
  const tied = ordered.filter(id => rolloff[id] === top);
  if (tied.length > 1) {
    return { ...gs, rolloff: {}, message: 'Empate en la tirada inicial. Vuelvan a tirar todos.' };
  }

  return {
    ...gs,
    phase: 'battle',
    rolloff,
    turnOrder: ordered,
    currentTurnIndex: 0,
    cardUsedThisTurn: false,
    message: `${gs.players.find(p => p.id === ordered[0]).name} inicia la partida.`,
  };
}

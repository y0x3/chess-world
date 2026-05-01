import { ROYALE_GIANT_SIZE, ROYALE_VIEW_SIZE } from './constants';
import { getRoyaleSize, inRoyaleBounds, royaleKey } from './geometry';

export const royalePieceSymbol = type => ({
  K: '\u265A',
  Q: '\u265B',
  R: '\u265C',
  B: '\u265D',
  N: '\u265E',
  P: '\u265F',
}[type] || '\u265A');

export function isInGiantPiece(piece, row, col) {
  return row >= piece.row && row < piece.row + ROYALE_GIANT_SIZE && col >= piece.col && col < piece.col + ROYALE_GIANT_SIZE;
}

export function getGiantPieceAt(giantPieces = [], row, col, exceptId = null) {
  return giantPieces.find(piece => piece.id !== exceptId && isInGiantPiece(piece, row, col));
}

export function giantPieceCells(piece) {
  const cells = [];
  for (let row = piece.row; row < piece.row + ROYALE_GIANT_SIZE; row++) {
    for (let col = piece.col; col < piece.col + ROYALE_GIANT_SIZE; col++) {
      cells.push({ row, col });
    }
  }
  return cells;
}

export function isGiantPlacementClear(size, piece, closedCells = {}, giantPieces = [], exceptId = null) {
  if (piece.row < 0 || piece.col < 0 || piece.row + ROYALE_GIANT_SIZE > size || piece.col + ROYALE_GIANT_SIZE > size) return false;
  return giantPieceCells(piece).every(cell => !closedCells[royaleKey(cell.row, cell.col)] && !getGiantPieceAt(giantPieces, cell.row, cell.col, exceptId));
}

export function isGiantMoveValid(type, from, to) {
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  const absDr = Math.abs(dr);
  const absDc = Math.abs(dc);
  if (dr === 0 && dc === 0) return false;

  switch (type) {
    case 'K': return Math.max(absDr, absDc) === ROYALE_GIANT_SIZE && (dr === 0 || dc === 0 || absDr === absDc);
    case 'B': return absDr === absDc && absDr % ROYALE_GIANT_SIZE === 0;
    case 'N': return (absDr === ROYALE_GIANT_SIZE * 2 && absDc === ROYALE_GIANT_SIZE) || (absDr === ROYALE_GIANT_SIZE && absDc === ROYALE_GIANT_SIZE * 2);
    default: return false;
  }
}

export function getGiantLegalMoves(gs, giant) {
  const size = getRoyaleSize(gs);
  const moves = [];
  for (let row = 0; row <= size - ROYALE_GIANT_SIZE; row++) {
    for (let col = 0; col <= size - ROYALE_GIANT_SIZE; col++) {
      const destination = { row, col };
      if (!isGiantMoveValid(giant.type, giant, destination)) continue;
      if (!isGiantPlacementClear(size, { ...giant, ...destination }, gs.closedCells, gs.giantPieces, giant.id)) continue;
      moves.push(destination);
    }
  }
  return moves;
}

export function getRoyalePlayerAt(players, row, col, exceptId = null) {
  return players.find(p => p.alive && p.id !== exceptId && p.row === row && p.col === col);
}

export function getNeutralPawnAt(neutralPawns = [], row, col) {
  return neutralPawns.find(pawn => pawn.row === row && pawn.col === col);
}

export function getRadioactiveCellAt(cells = [], row, col) {
  return cells.find(cell => cell.row === row && cell.col === col);
}

export function getFogZoneAt(fogZones = [], row, col) {
  return fogZones.find(zone => Math.abs(row - zone.row) <= 1 && Math.abs(col - zone.col) <= 1);
}

export function isRoyaleLineBlocked(gs, from, to, exceptPlayerId = null) {
  const dr = Math.sign(to.row - from.row);
  const dc = Math.sign(to.col - from.col);
  const steps = Math.max(Math.abs(to.row - from.row), Math.abs(to.col - from.col));
  if (steps <= 1) return false;

  for (let i = 1; i < steps; i++) {
    const row = from.row + dr * i;
    const col = from.col + dc * i;
    if (gs.closedCells?.[royaleKey(row, col)]) return true;
    if (getGiantPieceAt(gs.giantPieces || [], row, col)) return true;
    if (getNeutralPawnAt(gs.neutralPawns || [], row, col)) return true;
    if (getRoyalePlayerAt(gs.players || [], row, col, exceptPlayerId)) return true;
  }

  return false;
}

export function isRoyaleMoveValid(type, from, to, distance, boosted, size = getRoyaleSize(from)) {
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  const absDr = Math.abs(dr);
  const absDc = Math.abs(dc);
  const maxDelta = Math.max(absDr, absDc);

  if (!inRoyaleBounds(to.row, to.col, size)) return false;
  if (dr === 0 && dc === 0) return false;
  if (!boosted && (absDr > ROYALE_VIEW_SIZE - 1 || absDc > ROYALE_VIEW_SIZE - 1)) return false;

  switch (type) {
    case 'K': return maxDelta <= distance;
    case 'Q': return (dr === 0 || dc === 0 || absDr === absDc) && maxDelta <= distance;
    case 'R': return (dr === 0 || dc === 0) && maxDelta <= distance;
    case 'B': return absDr === absDc && absDr <= distance;
    case 'N': return absDr + absDc <= distance && absDr <= distance && absDc <= distance;
    case 'P': return absDr <= distance && dc === 0;
    default: return maxDelta <= distance;
  }
}

export function getRoyaleVisibleMoves(gs, player, getRoyaleViewOrigin) {
  if (!gs.currentRoll) return [];
  const origin = getRoyaleViewOrigin(player, getRoyaleSize(gs));
  const moves = [];
  for (let r = origin.row; r < origin.row + ROYALE_VIEW_SIZE; r++) {
    for (let c = origin.col; c < origin.col + ROYALE_VIEW_SIZE; c++) {
      if (gs.closedCells[royaleKey(r, c)]) continue;
      if (getGiantPieceAt(gs.giantPieces, r, c)) continue;
      if (getNeutralPawnAt(gs.neutralPawns || [], r, c)) continue;
      if ((player.type === 'Q' || player.type === 'R' || player.type === 'B') && isRoyaleLineBlocked(gs, player, { row: r, col: c }, player.id)) continue;
      if (isRoyaleMoveValid(player.type, player, { row: r, col: c }, gs.currentRoll, player.boosted, getRoyaleSize(gs))) {
        moves.push([r, c]);
      }
    }
  }
  return moves;
}

export function getRoyaleLegalMoves(gs, player, roll, getRoyaleViewOrigin) {
  const moves = [];
  const size = getRoyaleSize(gs);
  const origin = getRoyaleViewOrigin(player, size);
  const startRow = player.boosted ? 0 : origin.row;
  const startCol = player.boosted ? 0 : origin.col;
  const endRow = player.boosted ? size : startRow + ROYALE_VIEW_SIZE;
  const endCol = player.boosted ? size : startCol + ROYALE_VIEW_SIZE;

  for (let row = startRow; row < endRow; row++) {
    for (let col = startCol; col < endCol; col++) {
      if (gs.closedCells[royaleKey(row, col)]) continue;
      if (getGiantPieceAt(gs.giantPieces, row, col)) continue;
      if (getNeutralPawnAt(gs.neutralPawns || [], row, col)) continue;
      if ((player.type === 'Q' || player.type === 'R' || player.type === 'B') && isRoyaleLineBlocked(gs, player, { row, col }, player.id)) continue;
      if (isRoyaleMoveValid(player.type, player, { row, col }, roll, player.boosted, size)) {
        moves.push({ row, col });
      }
    }
  }

  return moves;
}

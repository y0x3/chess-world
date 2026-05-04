import {
  ROYALE_DEFAULT_SIZE,
  ROYALE_MIN_SIZE,
  ROYALE_MAX_SIZE,
  ROYALE_VIEW_SIZE,
} from './constants.js';

export const royaleKey = (row, col) => `${row},${col}`;
export const clampRoyaleMapSize = size => Math.max(ROYALE_MIN_SIZE, Math.min(ROYALE_MAX_SIZE, Number(size) || ROYALE_DEFAULT_SIZE));
export const clampRoyaleLives = lives => Math.max(1, Math.min(10, Number(lives) || 3));
export const defaultRoyaleMapSize = playerCount => Math.max(40, Math.min(96, 24 + (Number(playerCount) || 4) * 9));
export const getRoyaleSize = source => clampRoyaleMapSize(source?.mapSize || source?.config?.mapSize || ROYALE_DEFAULT_SIZE);
export const inRoyaleBounds = (row, col, size = ROYALE_DEFAULT_SIZE) => row >= 0 && row < size && col >= 0 && col < size;
export const royaleDistance = (a, b) => Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
export const royaleZoneDistance = (row, col, center) => Math.hypot(row - center.row, col - center.col);

export function getRoyaleViewOrigin(player, size = getRoyaleSize(player)) {
  const half = Math.floor(ROYALE_VIEW_SIZE / 2);
  return {
    row: Math.max(0, Math.min(size - ROYALE_VIEW_SIZE, player.row - half)),
    col: Math.max(0, Math.min(size - ROYALE_VIEW_SIZE, player.col - half)),
  };
}

export function isInsideRoyaleView(player, row, col, size = getRoyaleSize(player)) {
  const origin = getRoyaleViewOrigin(player, size);
  return row >= origin.row && row < origin.row + ROYALE_VIEW_SIZE && col >= origin.col && col < origin.col + ROYALE_VIEW_SIZE;
}

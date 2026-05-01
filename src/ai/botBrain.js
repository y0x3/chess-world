export function chooseBotRoyaleMove(gs, player, roll, deps) {
  const { getRoyaleLegalMoves, getRoyalePlayerAt, royaleKey, royaleZoneDistance, randomInt } = deps;
  const legalMoves = getRoyaleLegalMoves(gs, player, roll);
  if (!legalMoves.length) return null;

  const attackMoves = legalMoves.filter(move => getRoyalePlayerAt(gs.players, move.row, move.col, player.id));
  if (attackMoves.length) return attackMoves[randomInt(attackMoves.length)];

  const specialMoves = legalMoves.filter(move => gs.specials[royaleKey(move.row, move.col)]);
  if (specialMoves.length) return specialMoves[randomInt(specialMoves.length)];

  return legalMoves
    .map(move => ({ ...move, distanceToZone: royaleZoneDistance(move.row, move.col, gs.zoneCenter) }))
    .sort((a, b) => a.distanceToZone - b.distanceToZone)[0];
}

export function chooseBotRoyaleCard(gs, player, deps) {
  const { getRoyaleLegalMoves, getRoyalePlayerAt, royaleKey, royaleZoneDistance } = deps;
  const cards = player.cards || [];
  const pieceCards = cards.filter(card => card.effect === 'piece');
  if (!pieceCards.length) return null;

  const rollSamples = card => card.boosted ? [10, 24, 48, 80] : [1, 2, 3, 4, 5, 6];
  const scored = pieceCards.map(card => {
    let bestAttack = 0;
    let bestSpecial = 0;
    let bestZone = 0;
    rollSamples(card).forEach(roll => {
      const testPlayer = { ...player, type: card.type, boosted: card.boosted };
      const moves = getRoyaleLegalMoves(gs, testPlayer, roll);
      if (moves.some(move => getRoyalePlayerAt(gs.players, move.row, move.col, player.id))) bestAttack = Math.max(bestAttack, 100);
      if (moves.some(move => gs.specials[royaleKey(move.row, move.col)])) bestSpecial = Math.max(bestSpecial, 25);
      const currentDistance = royaleZoneDistance(player.row, player.col, gs.zoneCenter);
      const closest = moves.reduce((best, move) => Math.min(best, royaleZoneDistance(move.row, move.col, gs.zoneCenter)), currentDistance);
      bestZone = Math.max(bestZone, Math.max(0, currentDistance - closest));
    });
    return { card, score: bestAttack + bestSpecial + bestZone + (card.boosted ? 8 : 0) };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].card : null;
}

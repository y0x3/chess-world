const royaleKey = (row, col) => `${row},${col}`;

export function RoyaleMinimap({ gs, focusPlayer, activePlayer, onClose, onSelect, helpers, constants }) {
  const {
    getRoyaleSize,
    getRoyaleViewOrigin,
    isInsideRoyaleView,
    getGiantPieceAt,
    getNeutralPawnAt,
    getRadioactiveCellAt,
    getFogZoneAt,
    isRoyaleLineBlocked,
    isRoyaleMoveValid,
  } = helpers;
  const { ROYALE_VIEW_SIZE } = constants;
  const mapSize = getRoyaleSize(gs);
  const cells = [];
  const playerBySquare = new Map(gs.players.filter(p => p.alive).map(p => [royaleKey(p.row, p.col), p]));
  const canChooseDestination = activePlayer?.id === focusPlayer.id && activePlayer.boosted && gs.currentRoll;
  const canChooseTacticTarget = activePlayer?.id === focusPlayer.id && gs.pendingTacticCard?.playerId === focusPlayer.id;
  const canRevealEnemies = activePlayer?.id === focusPlayer.id && focusPlayer.revealEnemies;
  const viewOrigin = getRoyaleViewOrigin(focusPlayer, mapSize);
  const viewEndRow = viewOrigin.row + ROYALE_VIEW_SIZE - 1;
  const viewEndCol = viewOrigin.col + ROYALE_VIEW_SIZE - 1;

  for (let row = 0; row < mapSize; row++) {
    for (let col = 0; col < mapSize; col++) {
      const key = royaleKey(row, col);
      const isVisible = isInsideRoyaleView(focusPlayer, row, col, mapSize);
      const isClosed = gs.closedCells[key];
      const giant = getGiantPieceAt(gs.giantPieces, row, col);
      const neutralPawn = getNeutralPawnAt(gs.neutralPawns || [], row, col);
      const radioactive = getRadioactiveCellAt(gs.radioactiveCells || [], row, col);
      const fogZone = getFogZoneAt(gs.fogZones || [], row, col);
      const isLegalDestination = canChooseDestination &&
        !isClosed &&
        !neutralPawn &&
        !((focusPlayer.type === 'Q' || focusPlayer.type === 'R' || focusPlayer.type === 'B') && isRoyaleLineBlocked(gs, focusPlayer, { row, col }, focusPlayer.id)) &&
        isRoyaleMoveValid(focusPlayer.type, focusPlayer, { row, col }, gs.currentRoll, true, mapSize);
      const isTacticTarget = canChooseTacticTarget && !isClosed && !giant;
      const isFogHidden = fogZone && fogZone.ownerId !== focusPlayer.id;
      const player = (isVisible || canRevealEnemies) && !isFogHidden ? playerBySquare.get(key) : null;
      const special = isVisible ? gs.specials[key] : null;
      const cls = [
        'royale-mini-cell',
        isClosed ? 'is-closed' : '',
        giant ? 'has-giant-piece' : '',
        giant ? `giant-${giant.type}` : '',
        neutralPawn ? 'has-neutral-pawn' : '',
        radioactive ? 'is-radioactive' : '',
        isFogHidden ? 'is-war-fog' : '',
        !isVisible ? 'is-fog' : '',
        canRevealEnemies && player && player.id !== focusPlayer.id ? 'is-revealed-enemy' : '',
        isLegalDestination ? 'is-legal-destination' : '',
        isTacticTarget ? 'is-tactic-target' : '',
        special ? `special-${special}` : '',
        player && !giant ? 'has-player' : '',
        row === focusPlayer.row ? 'is-reference-row' : '',
        col === focusPlayer.col ? 'is-reference-col' : '',
        isVisible && row === viewOrigin.row ? 'is-view-top' : '',
        isVisible && row === viewEndRow ? 'is-view-bottom' : '',
        isVisible && col === viewOrigin.col ? 'is-view-left' : '',
        isVisible && col === viewEndCol ? 'is-view-right' : '',
        focusPlayer.row === row && focusPlayer.col === col ? 'is-focus' : '',
      ].filter(Boolean).join(' ');

      cells.push(
        <button
          key={key}
          className={cls}
          disabled={!(isLegalDestination || isTacticTarget) || Boolean(giant) || (isLegalDestination && Boolean(neutralPawn))}
          onClick={() => (isLegalDestination || isTacticTarget) && onSelect(row, col)}
          title={`${row + 1},${col + 1}${giant ? ` - ${giant.name}` : ''}${player ? ` - ${player.name}` : ''}${!isVisible && !player ? ' - niebla' : ''}`}
          style={player && !giant ? { background: player.color } : null}
        />
      );
    }
  }

  return (
    <div className="royale-minimap-panel">
      <div className="royale-minimap-card">
        <div className="royale-minimap-head">
          <div>
            <div className="result-title">Minimapa</div>
            <div className="result-sub">
              {canChooseDestination
                ? `Elige destino para ${focusPlayer.name}. Fuera del 10 x 10 tiras a ciegas.`
                : canChooseTacticTarget
                  ? 'Elige una casilla objetivo para tu carta tactica.'
                  : `Vista completa ${mapSize} x ${mapSize} para ${focusPlayer.name}`}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
        <div className="royale-minimap-reference">
          <span className="royale-ref-pill origin">Estas aqui: {focusPlayer.row + 1}, {focusPlayer.col + 1}</span>
          <span className="royale-ref-pill view">Marco dorado: vision 10 x 10</span>
          {canChooseDestination && <span className="royale-ref-pill move">Verde: destinos posibles</span>}
          {canChooseTacticTarget && <span className="royale-ref-pill tactic">Violeta: objetivo valido</span>}
          {canRevealEnemies && <span className="royale-ref-pill reveal">Violeta: enemigos revelados</span>}
        </div>
        <div className="royale-minimap-grid" style={{ gridTemplateColumns: `repeat(${mapSize}, 1fr)` }}>{cells}</div>
        <div className="royale-minimap-legend">
          <span><i className="royale-mini-swatch origin" /> Tu posicion</span>
          <span><i className="royale-mini-swatch move" /> Puedes moverte</span>
          <span><i className="royale-mini-swatch basic" /> Basica</span>
          <span><i className="royale-mini-swatch improved" /> Mejorada</span>
          <span><i className="royale-mini-swatch reveal" /> Vision</span>
          <span><i className="royale-mini-swatch special" /> Especial</span>
          <span><i className="royale-mini-swatch radioactive" /> Tierra Quemada</span>
          <span><i className="royale-mini-swatch neutral" /> Muro</span>
          <span><i className="royale-mini-swatch player" /> Jugador</span>
          <span><i className="royale-mini-swatch giant" /> Pieza gigante</span>
          <span><i className="royale-mini-swatch fog" /> Niebla</span>
        </div>
      </div>
    </div>
  );
}

export function RoyaleGiantMinimap({ gs, selectedGiant, legalMoves, onSelect, helpers }) {
  const { getRoyaleSize, giantPieceCells, getGiantPieceAt } = helpers;
  const mapSize = getRoyaleSize(gs);
  const legalAnchorByCell = new Map();
  legalMoves.forEach(move => {
    giantPieceCells(move).forEach(cell => {
      legalAnchorByCell.set(royaleKey(cell.row, cell.col), move);
    });
  });
  const cells = [];

  for (let row = 0; row < mapSize; row++) {
    for (let col = 0; col < mapSize; col++) {
      const key = royaleKey(row, col);
      const giant = getGiantPieceAt(gs.giantPieces, row, col);
      const isClosed = gs.closedCells[key];
      const legalAnchor = selectedGiant ? legalAnchorByCell.get(key) : null;
      const isLegalFootprint = Boolean(legalAnchor);
      const isLegalAnchor = legalAnchor && legalAnchor.row === row && legalAnchor.col === col;
      const isSelectedGiant = selectedGiant && giant?.id === selectedGiant.id;
      const cls = [
        'royale-mini-cell',
        isClosed ? 'is-closed' : '',
        giant ? 'has-giant-piece' : '',
        giant ? `giant-${giant.type}` : '',
        isSelectedGiant ? 'is-selected-giant' : '',
        isLegalFootprint ? 'is-legal-destination' : '',
        isLegalAnchor ? 'is-legal-anchor' : '',
      ].filter(Boolean).join(' ');

      cells.push(
        <button
          key={key}
          className={cls}
          disabled={!isLegalFootprint}
          onClick={() => legalAnchor && onSelect(legalAnchor.row, legalAnchor.col)}
          title={`${row + 1},${col + 1}${giant ? ` - ${giant.name}` : ''}`}
        />
      );
    }
  }

  return (
    <div className="royale-minimap-panel royale-giant-minimap">
      <div className="royale-minimap-card">
        <div className="royale-minimap-head">
          <div>
            <div className="result-title">Movimiento gigante</div>
            <div className="result-sub">
              {selectedGiant
                ? `${selectedGiant.name}: selecciona el ancla superior izquierda del nuevo 5 x 5.`
                : 'La casilla especial esta preparando una pieza gigante.'}
            </div>
          </div>
        </div>
        <div className="royale-minimap-grid" style={{ gridTemplateColumns: `repeat(${mapSize}, 1fr)` }}>{cells}</div>
        <div className="royale-minimap-legend">
          <span><i className="royale-mini-swatch move" /> Destino valido</span>
          <span><i className="royale-mini-swatch giant" /> Pieza gigante</span>
        </div>
      </div>
    </div>
  );
}

export function RoyaleClosingMinimap({ closedCells, closedCount, roundsCompleted, zoneCenter, zoneRadius, mapSize, humanPlayer, helpers }) {
  const { clampRoyaleMapSize } = helpers;
  const cells = [];
  const size = clampRoyaleMapSize(mapSize);
  const centerRow = Math.round(zoneCenter.row);
  const centerCol = Math.round(zoneCenter.col);

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const isClosed = closedCells[royaleKey(row, col)];
      const isCenter = row === centerRow && col === centerCol;
      const isHuman = humanPlayer?.alive && row === humanPlayer.row && col === humanPlayer.col;
      cells.push(<span key={`${row}-${col}`} className={`royale-closing-cell ${isClosed ? 'is-closed' : ''} ${isCenter ? 'is-zone-center' : ''} ${isHuman ? 'is-human-player' : ''}`} />);
    }
  }

  return (
    <div className="royale-closing-widget">
      <div className="royale-closing-title">Cierre</div>
      <div className="royale-closing-grid" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>{cells}</div>
      <div className="royale-closing-count">{closedCount} / {size * size}</div>
      {humanPlayer && <div className="royale-closing-rounds">Tu: {humanPlayer.row + 1}, {humanPlayer.col + 1}</div>}
      <div className="royale-closing-rounds">Radio: {zoneRadius}</div>
      <div className="royale-closing-rounds">Rondas: {roundsCompleted}</div>
    </div>
  );
}

export default RoyaleMinimap;


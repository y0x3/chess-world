const royaleKey = (row, col) => `${row},${col}`;

export function RoyaleBoard({
  gs,
  activePlayer,
  visibleMoves,
  onCellClick,
  helpers,
  constants,
}) {
  const {
    getRoyaleViewOrigin,
    getRoyaleSize,
    getGiantPieceAt,
    getNeutralPawnAt,
    getRadioactiveCellAt,
    getFogZoneAt,
    getRoyalePlayerAt,
    royalePieceSymbol,
  } = helpers;
  const { ROYALE_VIEW_SIZE, ROYALE_GIANT_SIZE } = constants;
  const origin = getRoyaleViewOrigin(activePlayer, getRoyaleSize(gs));
  const moveSet = new Set(visibleMoves.map(([r, c]) => royaleKey(r, c)));
  const cells = [];

  for (let vr = 0; vr < ROYALE_VIEW_SIZE; vr++) {
    for (let vc = 0; vc < ROYALE_VIEW_SIZE; vc++) {
      const row = origin.row + vr;
      const col = origin.col + vc;
      const isClosed = gs.closedCells[royaleKey(row, col)];
      const giant = getGiantPieceAt(gs.giantPieces, row, col);
      const isGiantCenter = giant && row === giant.row + Math.floor(ROYALE_GIANT_SIZE / 2) && col === giant.col + Math.floor(ROYALE_GIANT_SIZE / 2);
      const neutralPawn = getNeutralPawnAt(gs.neutralPawns || [], row, col);
      const radioactive = getRadioactiveCellAt(gs.radioactiveCells || [], row, col);
      const fogZone = getFogZoneAt(gs.fogZones || [], row, col);
      const isFogHidden = fogZone && fogZone.ownerId !== activePlayer.id;
      const player = getRoyalePlayerAt(gs.players, row, col);
      const special = gs.specials[royaleKey(row, col)];
      const isMove = moveSet.has(royaleKey(row, col));
      const isActive = player?.id === activePlayer.id;
      const isEnemy = player && player.id !== activePlayer.id;
      const cls = [
        'royale-cell',
        (row + col) % 2 === 0 ? 'light' : 'dark',
        isClosed ? 'is-closed' : '',
        giant ? 'has-giant-piece' : '',
        giant ? `giant-${giant.type}` : '',
        neutralPawn ? 'has-neutral-pawn' : '',
        radioactive ? 'is-radioactive' : '',
        isFogHidden ? 'is-war-fog' : '',
        special ? `special-${special}` : '',
        isMove ? 'is-move' : '',
        isEnemy && isMove ? 'is-attack' : '',
        isActive ? 'is-active-player' : '',
      ].filter(Boolean).join(' ');

      cells.push(
        <button key={`${row}-${col}`} className={cls} disabled={isClosed || Boolean(giant) || Boolean(neutralPawn)} onClick={() => onCellClick(row, col)}>
          {special && !isClosed && !giant && <span className="royale-special-dot" />}
          {radioactive && !isClosed && <span className="royale-radioactive-mark">{'\u2622'}</span>}
          {neutralPawn && !giant && (
            <span className="royale-neutral-pawn">{royalePieceSymbol('P')}</span>
          )}
          {giant && isGiantCenter && (
            <span className="royale-giant-piece" style={{ color: giant.color }}>
              {royalePieceSymbol(giant.type)}
            </span>
          )}
          {player && !giant && !neutralPawn && !isFogHidden && (
            <span className="royale-piece" style={{ color: player.color }}>
              {royalePieceSymbol(player.type)}
            </span>
          )}
          <span className="royale-coord">{row + 1},{col + 1}</span>
        </button>
      );
    }
  }

  return (
    <div className="royale-map-shell">
      <div className="royale-fog-edge top">NIEBLA</div>
      <div className="royale-fog-edge right">NIEBLA</div>
      <div className="royale-fog-edge bottom">NIEBLA</div>
      <div className="royale-fog-edge left">NIEBLA</div>
      <div className="royale-board">{cells}</div>
    </div>
  );
}

export default RoyaleBoard;


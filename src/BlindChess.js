import { useState, useEffect, useRef } from 'react';
import { PIECES } from './shared/pieces';

const PIECE_TYPES = ['K', 'Q', 'R', 'B', 'N', 'P'];
const BOT_BLIND_PIECE_TYPES = ['K', 'Q', 'R', 'B', 'N'];
const getBotPlacementOrder = (withoutPawns = false) =>
  withoutPawns ? ['N', 'B', 'R', 'Q', 'K'] : ['P', 'N', 'B', 'R', 'Q', 'K'];

const emptyBoard = () => Array(8).fill(null).map(() => Array(8).fill(null));
const makePiecePool = (pieceTypes = PIECE_TYPES) => {
  const pool = {};
  for (const t of pieceTypes) pool[t] = PIECES[t].count;
  return pool;
};

// â”€â”€ CHESS MOVE VALIDATION â”€â”€
function isValidMove(board, from, to, currentTurn) {
  const [fr, fc] = from;
  const [tr, tc] = to;
  const cell = board[fr][fc];
  if (!cell || cell.color !== currentTurn) return false;
  const target = board[tr][tc];
  if (target && target.color === currentTurn) return false;

  const dr = tr - fr, dc = tc - fc;
  const absDr = Math.abs(dr), absDc = Math.abs(dc);

  const isPathClear = (rs, cs) => {
    let r = fr + rs, c = fc + cs;
    while (r !== tr || c !== tc) {
      if (board[r][c]) return false;
      r += rs; c += cs;
    }
    return true;
  };

  switch (cell.type) {
    case 'P': {
      const dir = cell.color === 'w' ? -1 : 1;
      const startRow = cell.color === 'w' ? 6 : 1;
      if (dc === 0 && dr === dir && !target) return true;
      if (dc === 0 && dr === 2 * dir && fr === startRow && !target && !board[fr + dir][fc]) return true;
      if (absDc === 1 && dr === dir && target && target.color !== cell.color) return true;
      return false;
    }
    case 'N': return (absDr === 2 && absDc === 1) || (absDr === 1 && absDc === 2);
    case 'B':
      if (absDr !== absDc) return false;
      return isPathClear(dr > 0 ? 1 : -1, dc > 0 ? 1 : -1);
    case 'R':
      if (dr !== 0 && dc !== 0) return false;
      return isPathClear(dr === 0 ? 0 : dr > 0 ? 1 : -1, dc === 0 ? 0 : dc > 0 ? 1 : -1);
    case 'Q':
      if (dr === 0 || dc === 0)
        return isPathClear(dr === 0 ? 0 : dr > 0 ? 1 : -1, dc === 0 ? 0 : dc > 0 ? 1 : -1);
      if (absDr === absDc)
        return isPathClear(dr > 0 ? 1 : -1, dc > 0 ? 1 : -1);
      return false;
    case 'K': return absDr <= 1 && absDc <= 1;
    default: return false;
  }
}

function getValidMoves(board, row, col) {
  const cell = board[row][col];
  if (!cell) return [];
  const moves = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (isValidMove(board, [row, col], [r, c], cell.color))
        moves.push([r, c]);
  return moves;
}

function getLegalMoves(board, row, col) {
  const cell = board[row][col];
  if (!cell) return [];
  return getValidMoves(board, row, col).filter(([tr, tc]) => {
    const nb = board.map(boardRow => [...boardRow]);
    nb[tr][tc] = nb[row][col];
    nb[row][col] = null;
    return !isInCheck(nb, cell.color);
  });
}

function isInCheck(board, color) {
  let kr = -1, kc = -1;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.type === 'K' && board[r][c]?.color === color)
        { kr = r; kc = c; }
  if (kr === -1) return true;
  const opp = color === 'w' ? 'b' : 'w';
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.color === opp && isValidMove(board, [r, c], [kr, kc], opp))
        return true;
  return false;
}

function isCheckmate(board, color) {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.color === color) {
        const moves = getValidMoves(board, r, c);
        for (const [tr, tc] of moves) {
          const nb = board.map(row => [...row]);
          nb[tr][tc] = nb[r][c]; nb[r][c] = null;
          if (!isInCheck(nb, color)) return false;
        }
      }
  return true;
}

function posToLabel(r, c) { return `${String.fromCharCode(97 + c)}${8 - r}`; }

// â”€â”€ BOT PLACEMENTS â”€â”€
// Returns array of { type, color:'b', row, col, localOrder }
// Ordered: lowest value pieces first (Pâ†’Nâ†’Bâ†’Râ†’Qâ†’K), king is always last.
function generateBotPlacements(withoutPawns = false) {
  const placements = [];
  const used = new Set();
  const rand = () => {
    for (let i = 0; i < 300; i++) {
      const r = Math.floor(Math.random() * 8);
      const c = Math.floor(Math.random() * 8);
      const k = `${r},${c}`;
      if (!used.has(k)) { used.add(k); return [r, c]; }
    }
    return null;
  };
  let order = 1;
  for (const type of getBotPlacementOrder(withoutPawns)) {
    for (let i = 0; i < PIECES[type].count; i++) {
      const sq = rand();
      if (sq) placements.push({ type, color: 'b', row: sq[0], col: sq[1], localOrder: order++ });
    }
  }
  return placements;
}

// â”€â”€ MERGE BOARDS â”€â”€
// Both players place independently on their private boards.
// Their placements are interleaved by localOrder:
//   W[1], B[1], W[2], B[2], W[3], B[3], ...
// Global order: white piece i â†’ globalOrder = 2*(i-1)+1  (odd)
//               black piece i â†’ globalOrder = 2*(i-1)+2  (even)
// The piece with the HIGHER globalOrder wins any square conflict.
function mergeBoards(wLog, bLog) {
  // Assign global orders
  const allEntries = [];
  const maxLen = Math.max(wLog.length, bLog.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < wLog.length) allEntries.push({ ...wLog[i], globalOrder: 2 * i + 1 });
    if (i < bLog.length) allEntries.push({ ...bLog[i], globalOrder: 2 * i + 2 });
  }
  // Apply in ascending globalOrder â€” later one wins the square
  allEntries.sort((a, b) => a.globalOrder - b.globalOrder);

  const board = emptyBoard();
  const conflictLog = [];

  for (const entry of allEntries) {
    const { type, color, row, col, globalOrder } = entry;
    const existing = board[row][col];
    if (existing) {
      conflictLog.push({
        winner: color,
        winnerType: type,
        loser: existing.color,
        loserType: existing.type,
        pos: posToLabel(row, col),
        globalOrder,
      });
    }
    board[row][col] = { type, color, placementOrder: globalOrder };
  }

  return { board, conflictLog };
}

// â”€â”€ BOT BATTLE MOVE â”€â”€
function getBotMove(board, color) {
  const allMoves = [];
  const opponent = color === 'w' ? 'b' : 'w';
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.color === color) {
        for (const [tr, tc] of getLegalMoves(board, r, c)) {
          const nb = board.map(row => [...row]);
          const moved = nb[r][c];
          nb[tr][tc] = moved; nb[r][c] = null;
          if (moved.type === 'P' && (tr === 0 || tr === 7)) nb[tr][tc] = { ...moved, type: 'Q' };
          if (isInCheck(nb, color)) continue;
          const captured = board[tr][tc];
          const captureValue = captured ? (PIECES[captured.type]?.value ?? 0) : 0;
          const givesCheck = isInCheck(nb, opponent);
          const safety = getLegalMoves(nb, tr, tc).length;
          const centerBonus = 4 - Math.min(Math.abs(3.5 - tr), Math.abs(3.5 - tc));
          const score = captureValue * 100 + (givesCheck ? 25 : 0) + safety + centerBonus;
          allMoves.push({ from: [r, c], to: [tr, tc], score });
        }
      }

  if (!allMoves.length) return null;
  allMoves.sort((a, b) => b.score - a.score);
  const best = allMoves[0].score;
  const top = allMoves.filter(m => m.score === best);
  return top[Math.floor(Math.random() * top.length)];
}

// â”€â”€ CHESS ROYALE â”€â”€
function initBlindGame(cfg) {
  const pieceTypes = cfg.vsBot ? BOT_BLIND_PIECE_TYPES : PIECE_TYPES;
  return {
    phase: 'placement',      // placement | battle | result
    vsBot: cfg.vsBot || false,

    // â”€â”€ Placement phase â”€â”€
    // Each player has a PRIVATE board â€” they only see their own pieces while placing.
    // At reveal, both boards are merged into the battle board.
    boardW: emptyBoard(),    // white's private view
    boardB: emptyBoard(),    // black's private view (or bot's hidden board)
    pieceTypes,
    poolW: makePiecePool(pieceTypes),
    poolB: makePiecePool(pieceTypes),
    wLog: [],                // { type, color, row, col, localOrder }
    bLog: [],
    wLocalOrder: 0,
    bLocalOrder: 0,
    wDone: false,
    bDone: false,
    timerW: cfg.timeLimit,
    timerB: cfg.timeLimit,
    placementTurn: 'w',      // used only in 2-player mode for turn switching

    // Bot placements are pre-generated and hidden
    botPlacements: cfg.vsBot ? generateBotPlacements(true) : null,

    // â”€â”€ Battle phase â”€â”€
    battleBoard: null,
    currentTurn: 'w',
    selectedCell: null,
    validMoves: [],
    capturedW: [],
    capturedB: [],
    conflictLog: [],

    // â”€â”€ Result â”€â”€
    winner: null,
    winReason: '',
    showBanner: false,
    bannerText: '',
  };
}

function BlindChessGame({ initialState, config, onBack }) {
  const [gs, setGs] = useState(initialState);
  const [selectedType, setSelectedType] = useState(null);
  const timerRef = useRef(null);
  const botBattleRef = useRef(null);

  const wName = config.playerW || 'Blancas';
  const bName = gs.vsBot ? 'Bot' : (config.playerB || 'Negras');

  // â”€â”€ TIMER â€” only runs for the active human player â”€â”€
  useEffect(() => {
    if (gs.phase !== 'placement') { clearInterval(timerRef.current); return; }

    // In vsBot mode: only white has a timer; in 2P mode: active player's timer
    const activeColor = gs.vsBot ? 'w' : gs.placementTurn;
    const activeDone  = activeColor === 'w' ? gs.wDone : gs.bDone;
    if (activeDone) { clearInterval(timerRef.current); return; }

    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setGs(prev => {
        if (prev.phase !== 'placement') return prev;
        const key = activeColor === 'w' ? 'timerW' : 'timerB';
        const newTime = prev[key] - 1;
        if (newTime <= 0) {
          clearInterval(timerRef.current);
          return commitHumanDone({ ...prev, [key]: 0 }, activeColor);
        }
        return { ...prev, [key]: newTime };
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  // commitHumanDone is intentionally excluded: this timer effect depends only on game-state flags.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.phase, gs.placementTurn, gs.wDone, gs.bDone, gs.vsBot]);

  // â”€â”€ BOT BATTLE MOVE â”€â”€
  useEffect(() => {
    if (!gs.vsBot || gs.phase !== 'battle' || gs.currentTurn !== 'b' || gs.winner) return;
    clearTimeout(botBattleRef.current);
    botBattleRef.current = setTimeout(() => {
      setGs(prev => {
        if (prev.currentTurn !== 'b' || prev.phase !== 'battle') return prev;
        const move = getBotMove(prev.battleBoard, 'b');
        if (!move) {
          const botIsInCheck = isInCheck(prev.battleBoard, 'b');
          return {
            ...prev,
            phase: 'result',
            winner: botIsInCheck ? 'w' : 'draw',
            winReason: botIsInCheck ? 'Jaque mate' : 'Ahogado: el bot no tiene movimientos legales',
            selectedCell: null,
            validMoves: [],
          };
        }

        const { from: [sr, sc], to: [tr, tc] } = move;
        const nb = prev.battleBoard.map(r => [...r]);
        const moved = nb[sr][sc];
        const captured = nb[tr][tc];
        nb[tr][tc] = moved; nb[sr][sc] = null;
        if (moved.type === 'P' && (tr === 0 || tr === 7)) nb[tr][tc] = { ...moved, type: 'Q' };

        const newCapturedB = captured?.color === 'w' ? [...prev.capturedB, captured.type] : prev.capturedB;

        if (!nb.flat().some(c => c?.type === 'K' && c?.color === 'w'))
          return { ...prev, battleBoard: nb, capturedB: newCapturedB, phase: 'result', winner: 'b', winReason: 'Rey capturado en batalla', selectedCell: null, validMoves: [] };
        if (isCheckmate(nb, 'w'))
          return { ...prev, battleBoard: nb, capturedB: newCapturedB, phase: 'result', winner: 'b', winReason: 'Jaque mate', selectedCell: null, validMoves: [] };

        return { ...prev, battleBoard: nb, capturedB: newCapturedB, currentTurn: 'w', selectedCell: null, validMoves: [] };
      });
    }, 750);
    return () => clearTimeout(botBattleRef.current);
  }, [gs.vsBot, gs.phase, gs.currentTurn, gs.winner]);

  // â”€â”€ COMMIT HUMAN DONE â”€â”€
  // Called when human finishes placement (manual or timer). Handles both vsBot and 2P.
  function commitHumanDone(prev, color) {
    if (prev.vsBot) {
      // Bot mode: human is always white. As soon as white is done, merge immediately.
      // Bot's bLog is already fully pre-generated â€” use it directly.
      const bLog = prev.botPlacements; // already has { type, color:'b', row, col, localOrder }
      return resolveGame({ ...prev, wDone: true, bDone: true, bLog });
    } else {
      // 2-player mode: wait for both players
      const playerDone = color === 'w' ? { wDone: true } : { bDone: true };
      const otherDone  = color === 'w' ? prev.bDone : prev.wDone;
      if (otherDone) return resolveGame({ ...prev, ...playerDone });
      const nextTurn = color === 'w' ? 'b' : 'w';
      return { ...prev, ...playerDone, placementTurn: nextTurn };
    }
  }

  // â”€â”€ PLACE PIECE â”€â”€
  function placePiece(row, col) {
    if (gs.phase !== 'placement') return;
    if (!selectedType) return;

    // Determine which player is placing
    const color = gs.vsBot ? 'w' : gs.placementTurn;
    if (gs.vsBot && gs.wDone) return; // already done

    const poolKey  = color === 'w' ? 'poolW'       : 'poolB';
    const boardKey = color === 'w' ? 'boardW'      : 'boardB';
    const logKey   = color === 'w' ? 'wLog'        : 'bLog';
    const orderKey = color === 'w' ? 'wLocalOrder' : 'bLocalOrder';

    if ((gs[poolKey][selectedType] ?? 0) <= 0) return;
    if (gs[boardKey][row][col]) return;

    setGs(prev => {
      const newPool      = { ...prev[poolKey], [selectedType]: prev[poolKey][selectedType] - 1 };
      const newOrder     = prev[orderKey] + 1;
      const newBoard     = prev[boardKey].map(r => [...r]);
      newBoard[row][col] = { type: selectedType, color };

      const newLog = [...prev[logKey], { type: selectedType, color, row, col, localOrder: newOrder }];

      const updated = {
        ...prev,
        [poolKey]:  newPool,
        [boardKey]: newBoard,
        [logKey]:   newLog,
        [orderKey]: newOrder,
      };

      const remaining = Object.values(newPool).reduce((a, b) => a + b, 0);
      if (remaining === 0) return commitHumanDone(updated, color);
      return updated;
    });
    setSelectedType(null);
  }

  // â”€â”€ MANUAL DONE BUTTON â”€â”€
  function markDone() {
    setGs(prev => {
      const color = prev.vsBot ? 'w' : prev.placementTurn;
      return commitHumanDone(prev, color);
    });
    setSelectedType(null);
  }

  // â”€â”€ RESOLVE: merge both private boards into the battle board â”€â”€
  function resolveGame(prev) {
    const { board, conflictLog } = mergeBoards(prev.wLog, prev.bLog);

    let wKing = false, bKing = false;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        if (board[r][c]?.type === 'K' && board[r][c]?.color === 'w') wKing = true;
        if (board[r][c]?.type === 'K' && board[r][c]?.color === 'b') bKing = true;
      }

    if (!wKing && !bKing)
      return { ...prev, conflictLog, phase: 'result', winner: 'draw', winReason: 'Ambos reyes fueron capturados durante la colocaciÃ³n', showBanner: false };
    if (!wKing)
      return { ...prev, conflictLog, phase: 'result', winner: 'b', winReason: 'El Rey Blanco fue capturado durante la colocaciÃ³n', showBanner: false };
    if (!bKing)
      return { ...prev, conflictLog, phase: 'result', winner: 'w', winReason: 'El Rey Negro fue capturado durante la colocaciÃ³n', showBanner: false };

    const battleBoard = board.map(r => r.map(cell => cell ? { type: cell.type, color: cell.color } : null));
    return {
      ...prev,
      conflictLog,
      phase: 'battle',
      battleBoard,
      currentTurn: 'w',
      selectedCell: null,
      validMoves: [],
      showBanner: true,
      bannerText: 'QUE COMIENCE LA BATALLA',
    };
  }

  // â”€â”€ BATTLE: SELECT CELL â”€â”€
  function selectCell(row, col) {
    if (gs.phase !== 'battle') return;
    if (gs.vsBot && gs.currentTurn === 'b') return; // bot's turn
    const board = gs.battleBoard;
    const cell  = board[row][col];

    if (gs.selectedCell) {
      const [sr, sc] = gs.selectedCell;
      const isValid  = gs.validMoves.some(([r, c]) => r === row && c === col);

      if (isValid) {
        setGs(prev => {
          const nb = prev.battleBoard.map(r => [...r]);
          const moved    = nb[sr][sc];
          const captured = nb[row][col];
          nb[row][col] = moved; nb[sr][sc] = null;
          if (moved.type === 'P' && (row === 0 || row === 7)) nb[row][col] = { ...moved, type: 'Q' };

          const newCapturedW = captured?.color === 'b' ? [...prev.capturedW, captured.type] : prev.capturedW;
          const newCapturedB = captured?.color === 'w' ? [...prev.capturedB, captured.type] : prev.capturedB;
          const nextTurn     = prev.currentTurn === 'w' ? 'b' : 'w';

          if (!nb.flat().some(c => c?.type === 'K' && c?.color === nextTurn))
            return { ...prev, battleBoard: nb, capturedW: newCapturedW, capturedB: newCapturedB, phase: 'result', winner: prev.currentTurn, winReason: 'Rey capturado en batalla', selectedCell: null, validMoves: [] };
          if (isCheckmate(nb, nextTurn))
            return { ...prev, battleBoard: nb, capturedW: newCapturedW, capturedB: newCapturedB, phase: 'result', winner: prev.currentTurn, winReason: 'Jaque mate', selectedCell: null, validMoves: [] };

          return { ...prev, battleBoard: nb, capturedW: newCapturedW, capturedB: newCapturedB, currentTurn: nextTurn, selectedCell: null, validMoves: [] };
        });
        return;
      }
      if (cell?.color === gs.currentTurn) {
        setGs(prev => ({ ...prev, selectedCell: [row, col], validMoves: getLegalMoves(board, row, col) }));
        return;
      }
      setGs(prev => ({ ...prev, selectedCell: null, validMoves: [] }));
      return;
    }

    if (cell?.color === gs.currentTurn)
      setGs(prev => ({ ...prev, selectedCell: [row, col], validMoves: getLegalMoves(board, row, col) }));
  }

  const fmt = s => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const isPlacement = gs.phase === 'placement';
  const isBattle    = gs.phase === 'battle';
  const isResult    = gs.phase === 'result';
  const isBotTurn   = gs.vsBot && isBattle && gs.currentTurn === 'b';

  // During placement, each player only sees their own private board
  const humanColor    = gs.vsBot ? 'w' : gs.placementTurn;
  const visibleBoard  = isPlacement
    ? (humanColor === 'w' ? gs.boardW : gs.boardB)
    : gs.battleBoard;
  const humanPool     = humanColor === 'w' ? gs.poolW : gs.poolB;
  const humanDone     = humanColor === 'w' ? gs.wDone : gs.bDone;
  const showHumanTray = isPlacement && !humanDone && (gs.vsBot || gs.placementTurn === humanColor);

  return (
    <div className="game-screen">
      {gs.showBanner && (
        <div className="phase-banner" onClick={() => setGs(p => ({ ...p, showBanner: false }))}>
          <div className="phase-banner-text">{gs.bannerText}</div>
        </div>
      )}
      {isResult && (
        <ResultOverlay
          winner={gs.winner} reason={gs.winReason} wName={wName} bName={bName}
          onRematch={() => { setGs(initBlindGame(config)); setSelectedType(null); }}
          onMenu={onBack}
        />
      )}

      <div className="game-header">
        <div className="game-logo">Chess World</div>
        <div className={`phase-badge ${isPlacement ? 'phase-placement' : isBattle ? 'phase-battle' : 'phase-result'}`}>
          {isPlacement ? 'COLOCACIÃ“N DE PIEZAS' : isBattle ? 'BATALLA' : 'FIN DE PARTIDA'}
        </div>
        <button className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '4px 12px' }} onClick={onBack}>MenÃº</button>
      </div>

      <div className="game-body">

        {/* â”€â”€ LEFT PANEL: White â”€â”€ */}
        <div className="side-panel">
          <div className="panel-box">
            <div className={`active-player-label ${isPlacement && !gs.wDone ? 'active-white' : ''}`}>
              {wName} {gs.wDone && isPlacement ? 'âœ“ listo' : ''}
            </div>
            {isPlacement && (
              <>
                <div className="panel-title">Tiempo restante</div>
                <div className={`timer-display timer-white ${gs.timerW <= 10 ? 'timer-danger' : ''}`}>
                  {fmt(gs.timerW)}
                </div>
              </>
            )}
          </div>

          {showHumanTray && humanColor === 'w' && (
            <div className="panel-box">
              <div className="panel-title">Tus piezas (Blancas)</div>
              <PieceTray pool={humanPool} color="w" selected={selectedType} onSelect={setSelectedType} pieceTypes={gs.pieceTypes} />
              <button className="btn btn-ghost" style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.7rem' }} onClick={markDone}>
                Terminar colocaciÃ³n
              </button>
            </div>
          )}

          {isBattle && (
            <div className="panel-box">
              <div className="panel-title">Capturas de {wName}</div>
              <div className="captured-list">
                {gs.capturedW.map((t, i) => <span key={i} className="captured-piece">{PIECES[t].sym.b}</span>)}
              </div>
            </div>
          )}
        </div>

        {/* â”€â”€ BOARD â”€â”€ */}
        <div className="board-area">
          <div className="board-frame">
            <div className="rank-labels">
              {[8,7,6,5,4,3,2,1].map(n => (
                <div key={n} className="coord-label rank-label">{n}</div>
              ))}
            </div>
            <div>
              <Board
                board={visibleBoard}
                phase={gs.phase}
                selectedType={selectedType}
                selectedCell={gs.selectedCell}
                validMoves={gs.validMoves}
                humanDone={humanDone}
                onCellClick={isPlacement ? placePiece : selectCell}
                conflictCells={isBattle ? (gs.conflictLog?.map(e => {
                  for (let r = 0; r < 8; r++)
                    for (let c = 0; c < 8; c++)
                      if (posToLabel(r, c) === e.pos) return [r, c];
                  return null;
                }).filter(Boolean) ?? []) : []}
              />
              <div className="file-labels">
                {'abcdefgh'.split('').map(l => (
                  <div key={l} className="coord-label file-label">{l}</div>
                ))}
              </div>
            </div>
          </div>

          {isBattle && (
            <div className={`turn-bar ${isBotTurn ? 'turn-bar-bot' : ''}`}>
              <span className="turn-icon">{gs.currentTurn === 'w' ? 'â™”' : gs.vsBot ? 'ðŸ¤–' : 'â™š'}</span>
              <span className="turn-text">
                {isBotTurn ? 'Bot pensando...' : `Turno de ${gs.currentTurn === 'w' ? wName : bName}`}
              </span>
            </div>
          )}

          {isPlacement && (
            <div className="instructions">
              {gs.vsBot && !gs.wDone
                ? 'Coloca tus piezas sin peones. El bot colocarÃ¡ las suyas en secreto al mismo tiempo.'
                : !gs.vsBot && !humanDone
                ? 'Selecciona una pieza y luego una casilla para colocarla.'
                : null}
            </div>
          )}
        </div>

        {/* â”€â”€ RIGHT PANEL: Black / Bot â”€â”€ */}
        <div className="side-panel">
          <div className="panel-box">
            <div className={`active-player-label ${!gs.vsBot && isPlacement && gs.placementTurn === 'b' && !gs.bDone ? 'active-black' : ''}`}>
              {gs.vsBot ? 'ðŸ¤– ' : ''}{bName} {gs.bDone && isPlacement ? 'âœ“ listo' : ''}
            </div>
            {isPlacement && (
              gs.vsBot
                ? (
                  <div className="bot-status-box">
                    <span className="bot-status-thinking">Colocando en secreto...</span>
                  </div>
                ) : (
                  <>
                    <div className="panel-title">Tiempo restante</div>
                    <div className={`timer-display timer-black ${gs.timerB <= 10 ? 'timer-danger' : ''}`}>
                      {fmt(gs.timerB)}
                    </div>
                  </>
                )
            )}
          </div>

          {showHumanTray && humanColor === 'b' && !gs.vsBot && (
            <div className="panel-box">
              <div className="panel-title">Tus piezas (Negras)</div>
              <PieceTray pool={humanPool} color="b" selected={selectedType} onSelect={setSelectedType} pieceTypes={gs.pieceTypes} />
              <button className="btn btn-ghost" style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.7rem' }} onClick={markDone}>
                Terminar colocaciÃ³n
              </button>
            </div>
          )}

          {isBattle && (
            <div className="panel-box">
              <div className="panel-title">Capturas de {bName}</div>
              <div className="captured-list">
                {gs.capturedB.map((t, i) => <span key={i} className="captured-piece">{PIECES[t].sym.w}</span>)}
              </div>
            </div>
          )}

          {isBattle && gs.conflictLog?.length > 0 && (
            <div className="panel-box">
              <div className="panel-title">Conflictos de colocaciÃ³n</div>
              <div className="conflict-log">
                {gs.conflictLog.map((e, i) => (
                  <div key={i} className="conflict-entry">
                    <span>{PIECES[e.winnerType].sym[e.winner]}</span> desplazÃ³ a{' '}
                    <span>{PIECES[e.loserType].sym[e.loser]}</span> en <span>{e.pos}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// â”€â”€ CHESS ROYALE GAME â”€â”€
function Board({ board, phase, selectedType, selectedCell, validMoves, humanDone, onCellClick, conflictCells }) {
  return (
    <div className="board">
      {board.map((row, r) =>
        row.map((cell, c) => {
          const isLight       = (r + c) % 2 === 0;
          const isSelected    = selectedCell && selectedCell[0] === r && selectedCell[1] === c;
          const isValidMv     = validMoves.some(([vr, vc]) => vr === r && vc === c);
          const isValidCapture = isValidMv && cell !== null;
          const isValidEmpty  = isValidMv && cell === null;
          const isConflict    = conflictCells.some(([cr, cc]) => cr === r && cc === c);
          const canPlace      = phase === 'placement' && selectedType && !humanDone;

          let cls = `cell ${isLight ? 'light' : 'dark'}`;
          if (canPlace)       cls += ' placeable highlight-place';
          if (isConflict)     cls += ' conflict';
          if (isSelected)     cls += ' selected-cell';
          if (isValidEmpty)   cls += ' valid-move';
          if (isValidCapture) cls += ' valid-capture';

          return (
            <div key={`${r}-${c}`} className={cls} onClick={() => onCellClick(r, c)}>
              {cell && (
                <>
                  <span className={`piece-on-board piece-${cell.color}`}>{PIECES[cell.type]?.sym[cell.color] || '?'}</span>
                  {phase === 'placement' && cell.placementOrder && (
                    <span className="order-badge">{cell.placementOrder}</span>
                  )}
                </>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// â”€â”€ PIECE TRAY â”€â”€
function PieceTray({ pool, color, selected, onSelect, pieceTypes = PIECE_TYPES }) {
  return (
    <div className="pieces-tray">
      {pieceTypes.map(type => {
        const count = pool[type] || 0;
        const isUsed = count <= 0;
        return (
          <div
            key={type}
            className={`tray-piece tray-piece-${color}${selected === type ? ' selected' : ''}${isUsed ? ' used' : ''}`}
            onClick={() => !isUsed && onSelect(selected === type ? null : type)}
            title={`${PIECES[type].label} (${count} restante${count !== 1 ? 's' : ''})`}
          >
            {PIECES[type].sym[color]}
            <span className="tray-count">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

// â”€â”€ RESULT OVERLAY â”€â”€
function ResultOverlay({ winner, reason, wName, bName, onRematch, onMenu }) {
  const title = winner === 'draw' ? 'Empate' : winner === 'w' ? `Victoria de ${wName}` : `Victoria de ${bName}`;
  return (
    <div className="result-overlay">
      <div className="result-card">
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
          {winner === 'w' ? 'â™”' : winner === 'b' ? 'â™š' : 'â™ž'}
        </div>
        <div className="result-title">{title}</div>
        <div className="result-sub">{reason}</div>
        <div className="result-btns">
          <button className="btn btn-primary" onClick={onRematch}>Revancha</button>
          <button className="btn btn-ghost" onClick={onMenu}>MenÃº Principal</button>
        </div>
      </div>
    </div>
  );
}

export { initBlindGame };
export default BlindChessGame;


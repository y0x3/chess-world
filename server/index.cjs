const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { pathToFileURL } = require('url');

const PORT = Number(process.env.PORT) || 4000;

async function main() {
  const royaleUrl = pathToFileURL(path.join(__dirname, '..', 'src', 'logic', 'royaleEngine.js')).href;
  const { createRoyaleEngine, nextAliveTurnIndex } = await import(royaleUrl);

  const randomInt = max => Math.floor(Math.random() * max);
  const engine = createRoyaleEngine(randomInt);

  let gs = null;
  let lastInitConfig = null;
  const lobby = [];

  const app = express();
  app.use(cors({ origin: true, credentials: true }));

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: true, credentials: true },
  });

  app.get('/health', (_req, res) => res.json({ ok: true }));

  function broadcast() {
    io.emit('stateUpdate', gs);
  }

  function lobbyPlayerId(socketId) {
    return lobby.find(l => l.socketId === socketId)?.playerId;
  }

  io.on('connection', socket => {
    socket.on('join', ({ playerName, config } = {}) => {
      if (lobby.some(l => l.socketId === socket.id)) return;

      const pc = Math.min(8, Math.max(2, Number(config?.playerCount) || 2));
      if (lobby.length >= pc) {
        socket.emit('joinError', { message: 'La sala esta llena.' });
        return;
      }

      const playerId = `p${lobby.length + 1}`;
      lobby.push({
        socketId: socket.id,
        playerName: (playerName && String(playerName).trim()) || `Jugador ${lobby.length + 1}`,
        playerId,
      });
      socket.data.playerId = playerId;
      socket.emit('assigned', { playerId });

      if (lobby.length === pc) {
        const names = lobby.map(l => l.playerName);
        lastInitConfig = {
          ...config,
          vsBots: false,
          playerCount: pc,
          playerNames: names,
        };
        gs = engine.initChessRoyale(lastInitConfig);
        broadcast();
      }
    });

    socket.on('action', payload => {
      const pid = socket.data.playerId || lobbyPlayerId(socket.id);
      if (!pid || !gs || !payload?.type) return;

      switch (payload.type) {
        case 'rolloffRoll': {
          if (payload.playerId !== pid) return;
          if (gs.phase !== 'rolloff' || gs.rolloff[payload.playerId]) return;
          const roll = 1 + randomInt(10);
          gs = engine.applyRoyaleRolloff(gs, payload.playerId, roll);
          broadcast();
          break;
        }
        case 'battleRoll': {
          if (gs.turnOrder[gs.currentTurnIndex] !== pid) return;
          if (gs.phase !== 'battle' || gs.currentRoll || gs.giantMove || gs.pendingTacticCard) return;
          const active = gs.players.find(p => p.id === pid);
          if (!active?.alive) return;
          if (active.trappedTurns > 0) return;
          const roll = active.boosted ? 10 + randomInt(71) : 1 + randomInt(10);
          gs = engine.applyBattleRoll(gs, roll);
          broadcast();
          break;
        }
        case 'trappedSkip': {
          if (gs.turnOrder[gs.currentTurnIndex] !== pid) return;
          const active = gs.players.find(p => p.id === pid);
          if (!active || active.trappedTurns <= 0) return;
          gs = {
            ...gs,
            players: gs.players.map(p => (p.id === pid ? { ...p, trappedTurns: p.trappedTurns - 1 } : p)),
            currentTurnIndex: nextAliveTurnIndex(gs.players, gs.turnOrder, gs.currentTurnIndex),
            currentRoll: null,
            cardUsedThisTurn: false,
            message: `${active.name} esta atrapado por el Cubo de Peones y pierde su turno.`,
          };
          broadcast();
          break;
        }
        case 'playCard': {
          if (gs.turnOrder[gs.currentTurnIndex] !== pid) return;
          gs = engine.playRoyaleCardState(gs, pid, payload.cardId);
          broadcast();
          break;
        }
        case 'tacticTarget': {
          if (gs.turnOrder[gs.currentTurnIndex] !== pid) return;
          const pending = gs.pendingTacticCard;
          if (!pending || pending.playerId !== pid) return;
          const actor = gs.players.find(p => p.id === pid);
          const card = actor?.cards?.find(c => c.id === pending.cardId);
          if (!card) return;
          gs = engine.applyTargetedTactic(gs, pid, card, { row: payload.row, col: payload.col });
          broadcast();
          break;
        }
        case 'move': {
          if (gs.turnOrder[gs.currentTurnIndex] !== pid) return;
          gs = engine.moveRoyalePlayer(gs, { row: payload.row, col: payload.col });
          broadcast();
          break;
        }
        case 'boostedMove': {
          if (gs.turnOrder[gs.currentTurnIndex] !== pid) return;
          const active = gs.players.find(p => p.id === pid);
          if (!active?.boosted || !gs.currentRoll) return;
          gs = engine.moveRoyalePlayer(gs, { row: payload.row, col: payload.col });
          broadcast();
          break;
        }
        case 'giantMove': {
          if (!gs.giantMove || gs.giantMove.playerId !== pid) return;
          const result = engine.applyGiantMove(gs, gs.giantMove.playerId, gs.giantMove.selectedId, {
            row: payload.row,
            col: payload.col,
          });
          if (!result) return;
          gs = engine.mergeGiantMoveOutcome(gs, result);
          broadcast();
          break;
        }
        case 'closeMinimap': {
          gs = { ...gs, minimapPlayerId: null, pendingTacticCard: null };
          broadcast();
          break;
        }
        case 'openMinimap': {
          if (gs.turnOrder[gs.currentTurnIndex] !== pid) return;
          gs = { ...gs, minimapPlayerId: pid };
          broadcast();
          break;
        }
        case 'restart': {
          if (!lastInitConfig) return;
          gs = engine.initChessRoyale(lastInitConfig);
          broadcast();
          break;
        }
        default:
          break;
      }
    });

    socket.on('disconnect', () => {
      const idx = lobby.findIndex(l => l.socketId === socket.id);
      if (idx >= 0) lobby.splice(idx, 1);
      if (lobby.length === 0) {
        gs = null;
        lastInitConfig = null;
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`ChessRoyale server http://localhost:${PORT}`);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

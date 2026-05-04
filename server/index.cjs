const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { pathToFileURL } = require('url');

const PORT = Number(process.env.PORT) || 4000;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DISCONNECT_FORFEIT_MS = 60 * 1000;

function createRoomCode(existingCodes) {
  for (let tries = 0; tries < 3000; tries++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
    if (!existingCodes.has(code)) return code;
  }
  throw new Error('No se pudo generar codigo de sala');
}

async function main() {
  const royaleUrl = pathToFileURL(path.join(__dirname, '..', 'src', 'logic', 'royaleEngine.js')).href;
  const { createRoyaleEngine, nextAliveTurnIndex } = await import(royaleUrl);

  const randomInt = max => Math.floor(Math.random() * max);
  const engine = createRoyaleEngine(randomInt);

  const rooms = new Map();

  const app = express();
  app.use(cors({ origin: true, credentials: true }));

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: true, credentials: true },
  });

  app.get('/health', (_req, res) => res.json({ ok: true }));

  function publicRoomsSnapshot() {
    return [...rooms.values()]
      .filter(room => room.visibility === 'public' && room.status === 'waiting')
      .map(room => ({
        roomCode: room.code,
        playersJoined: room.lobby.length,
        playerCount: room.playerCount,
        mapSize: room.baseConfig?.mapSize,
      }))
      .sort((a, b) => a.roomCode.localeCompare(b.roomCode));
  }

  app.get('/rooms', (_req, res) => {
    res.json({ rooms: publicRoomsSnapshot() });
  });

  function getRoom(roomCode) {
    if (!roomCode) return null;
    return rooms.get(roomCode) || null;
  }

  function broadcastRoom(roomCode) {
    const room = getRoom(roomCode);
    if (!room || !room.gs) return;
    io.to(roomCode).emit('stateUpdate', room.gs);
  }

  function emitRoomInfo(roomCode) {
    const room = getRoom(roomCode);
    if (!room) return;
    io.to(roomCode).emit('roomInfo', {
      roomCode,
      playersJoined: room.lobby.length,
      playerCount: room.playerCount,
      status: room.status,
      visibility: room.visibility,
      disconnectedPlayers: [...room.disconnectDeadlines.entries()].map(([playerId, deadlineAt]) => ({
        playerId,
        deadlineAt,
      })),
    });
  }

  function emitRoomsUpdate() {
    io.emit('roomsUpdate', { rooms: publicRoomsSnapshot() });
  }

  function scheduleDisconnectForfeit(roomCode, playerId) {
    const room = getRoom(roomCode);
    if (!room) return;
    const existing = room.disconnectTimers.get(playerId);
    if (existing) clearTimeout(existing);

    const deadlineAt = Date.now() + DISCONNECT_FORFEIT_MS;
    room.disconnectDeadlines.set(playerId, deadlineAt);
    emitRoomInfo(roomCode);

    const timer = setTimeout(() => {
      const currentRoom = getRoom(roomCode);
      if (!currentRoom || currentRoom.status !== 'playing' || !currentRoom.gs) return;
      if (!currentRoom.disconnectedPlayerIds.has(playerId)) return;

      const target = currentRoom.gs.players.find(player => player.id === playerId);
      if (!target || !target.alive) return;

      const players = currentRoom.gs.players.map(player =>
        player.id === playerId ? { ...player, alive: false, lives: 0, cards: [] } : player
      );
      const alive = players.filter(player => player.alive);
      const nextTurn =
        currentRoom.gs.turnOrder[currentRoom.gs.currentTurnIndex] === playerId
          ? nextAliveTurnIndex(players, currentRoom.gs.turnOrder, currentRoom.gs.currentTurnIndex)
          : currentRoom.gs.currentTurnIndex;

      if (alive.length <= 1) {
        const winnerId = alive[0]?.id || null;
        const winnerName = winnerId ? players.find(player => player.id === winnerId)?.name : null;
        currentRoom.gs = {
          ...currentRoom.gs,
          players,
          phase: 'result',
          winner: winnerId,
          currentRoll: null,
          giantMove: null,
          pendingTacticCard: null,
          minimapPlayerId: null,
          message: winnerName
            ? `${target.name} se desconecto por mas de 60s. ${winnerName} gana la partida.`
            : `${target.name} se desconecto por mas de 60s. Partida finalizada.`,
        };
        currentRoom.status = 'finished';
      } else {
        currentRoom.gs = {
          ...currentRoom.gs,
          players,
          currentTurnIndex: nextTurn,
          currentRoll: null,
          giantMove: null,
          pendingTacticCard: null,
          minimapPlayerId: null,
          message: `${target.name} se desconecto por mas de 60s y queda eliminado por inactividad.`,
        };
      }

      currentRoom.disconnectedPlayerIds.delete(playerId);
      currentRoom.disconnectTimers.delete(playerId);
      currentRoom.disconnectDeadlines.delete(playerId);
      emitRoomInfo(roomCode);
      broadcastRoom(roomCode);
      emitRoomsUpdate();
    }, DISCONNECT_FORFEIT_MS);

    room.disconnectTimers.set(playerId, timer);
  }

  function registerPlayerToRoom(socket, roomCode, playerName, passwordAttempt = '') {
    const room = getRoom(roomCode);
    if (!room) return { ok: false, message: 'La sala no existe.' };
    if (room.status !== 'waiting') return { ok: false, message: 'La partida ya comenzo en esta sala.' };
    if (room.lobby.length >= room.playerCount) return { ok: false, message: 'La sala esta llena.' };
    if (room.lobby.some(entry => entry.socketId === socket.id)) return { ok: false, message: 'Ya estas en la sala.' };
    if (room.visibility === 'private' && room.password !== String(passwordAttempt || '')) {
      return { ok: false, message: 'Contrasena incorrecta para sala privada.' };
    }

    const playerId = `p${room.lobby.length + 1}`;
    const safeName = (playerName && String(playerName).trim()) || `Jugador ${room.lobby.length + 1}`;
    room.lobby.push({
      socketId: socket.id,
      playerName: safeName,
      playerId,
    });

    socket.data.roomCode = roomCode;
    socket.data.playerId = playerId;
    socket.join(roomCode);
    socket.emit('assigned', { playerId });
    room.disconnectedPlayerIds.delete(playerId);
    const pendingTimer = room.disconnectTimers.get(playerId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      room.disconnectTimers.delete(playerId);
    }
    room.disconnectDeadlines.delete(playerId);
    emitRoomInfo(roomCode);
    emitRoomsUpdate();

    if (room.lobby.length === room.playerCount) {
      const names = room.lobby.map(entry => entry.playerName);
      room.lastInitConfig = {
        ...room.baseConfig,
        vsBots: false,
        playerCount: room.playerCount,
        playerNames: names,
      };
      room.gs = engine.initChessRoyale(room.lastInitConfig);
      room.status = 'playing';
      emitRoomInfo(roomCode);
      emitRoomsUpdate();
      broadcastRoom(roomCode);
    }

    return { ok: true, roomCode };
  }

  io.on('connection', socket => {
    socket.on('createRoom', ({ playerName, config, visibility, password } = {}) => {
      const playerCount = Math.min(8, Math.max(2, Number(config?.playerCount) || 2));
      const roomVisibility = visibility === 'private' ? 'private' : 'public';
      const roomPassword = roomVisibility === 'private' ? String(password || '') : '';
      if (roomVisibility === 'private' && !roomPassword) {
        socket.emit('joinError', { message: 'La sala privada requiere contrasena.' });
        return;
      }
      const roomCode = createRoomCode(new Set(rooms.keys()));
      const room = {
        code: roomCode,
        playerCount,
        visibility: roomVisibility,
        password: roomPassword,
        baseConfig: { ...(config || {}), vsBots: false, playerCount },
        lobby: [],
        gs: null,
        lastInitConfig: null,
        status: 'waiting',
        disconnectTimers: new Map(),
        disconnectedPlayerIds: new Set(),
        disconnectDeadlines: new Map(),
      };
      rooms.set(roomCode, room);
      socket.emit('roomCreated', { roomCode });
      emitRoomsUpdate();
      const result = registerPlayerToRoom(socket, roomCode, playerName, roomPassword);
      if (!result.ok) socket.emit('joinError', { message: result.message });
    });

    socket.on('joinRoom', ({ roomCode, playerName, password } = {}) => {
      const cleanCode = String(roomCode || '').trim().toUpperCase();
      if (!cleanCode) {
        socket.emit('joinError', { message: 'Ingresa un codigo de sala valido.' });
        return;
      }
      const result = registerPlayerToRoom(socket, cleanCode, playerName, String(password || ''));
      if (!result.ok) socket.emit('joinError', { message: result.message });
    });

    socket.on('action', payload => {
      const roomCode = socket.data.roomCode;
      const room = getRoom(roomCode);
      const gs = room?.gs;
      const pid = socket.data.playerId;
      if (!room || !pid || !gs || !payload?.type) return;

      switch (payload.type) {
        case 'rolloffRoll': {
          if (payload.playerId !== pid) return;
          if (gs.phase !== 'rolloff' || gs.rolloff[payload.playerId]) return;
          const roll = 1 + randomInt(10);
          room.gs = engine.applyRoyaleRolloff(gs, payload.playerId, roll);
          broadcastRoom(roomCode);
          break;
        }
        case 'battleRoll': {
          if (gs.turnOrder[gs.currentTurnIndex] !== pid) return;
          if (gs.phase !== 'battle' || gs.currentRoll || gs.giantMove || gs.pendingTacticCard) return;
          const active = gs.players.find(p => p.id === pid);
          if (!active?.alive) return;
          if (active.trappedTurns > 0) return;
          const roll = active.boosted ? 10 + randomInt(71) : 1 + randomInt(10);
          room.gs = engine.applyBattleRoll(gs, roll);
          broadcastRoom(roomCode);
          break;
        }
        case 'trappedSkip': {
          if (gs.turnOrder[gs.currentTurnIndex] !== pid) return;
          const active = gs.players.find(p => p.id === pid);
          if (!active || active.trappedTurns <= 0) return;
          room.gs = {
            ...gs,
            players: gs.players.map(p => (p.id === pid ? { ...p, trappedTurns: p.trappedTurns - 1 } : p)),
            currentTurnIndex: nextAliveTurnIndex(gs.players, gs.turnOrder, gs.currentTurnIndex),
            currentRoll: null,
            cardUsedThisTurn: false,
            message: `${active.name} esta atrapado por el Cubo de Peones y pierde su turno.`,
          };
          broadcastRoom(roomCode);
          break;
        }
        case 'playCard': {
          if (gs.turnOrder[gs.currentTurnIndex] !== pid) return;
          room.gs = engine.playRoyaleCardState(gs, pid, payload.cardId);
          broadcastRoom(roomCode);
          break;
        }
        case 'tacticTarget': {
          if (gs.turnOrder[gs.currentTurnIndex] !== pid) return;
          const pending = gs.pendingTacticCard;
          if (!pending || pending.playerId !== pid) return;
          const actor = gs.players.find(p => p.id === pid);
          const card = actor?.cards?.find(c => c.id === pending.cardId);
          if (!card) return;
          room.gs = engine.applyTargetedTactic(gs, pid, card, { row: payload.row, col: payload.col });
          broadcastRoom(roomCode);
          break;
        }
        case 'move': {
          if (gs.turnOrder[gs.currentTurnIndex] !== pid) return;
          room.gs = engine.moveRoyalePlayer(gs, { row: payload.row, col: payload.col });
          broadcastRoom(roomCode);
          break;
        }
        case 'boostedMove': {
          if (gs.turnOrder[gs.currentTurnIndex] !== pid) return;
          const active = gs.players.find(p => p.id === pid);
          if (!active?.boosted || !gs.currentRoll) return;
          room.gs = engine.moveRoyalePlayer(gs, { row: payload.row, col: payload.col });
          broadcastRoom(roomCode);
          break;
        }
        case 'giantMove': {
          if (!gs.giantMove || gs.giantMove.playerId !== pid) return;
          const result = engine.applyGiantMove(gs, gs.giantMove.playerId, gs.giantMove.selectedId, {
            row: payload.row,
            col: payload.col,
          });
          if (!result) return;
          room.gs = engine.mergeGiantMoveOutcome(gs, result);
          broadcastRoom(roomCode);
          break;
        }
        case 'closeMinimap': {
          room.gs = { ...gs, minimapPlayerId: null, pendingTacticCard: null };
          broadcastRoom(roomCode);
          break;
        }
        case 'openMinimap': {
          if (gs.turnOrder[gs.currentTurnIndex] !== pid) return;
          room.gs = { ...gs, minimapPlayerId: pid };
          broadcastRoom(roomCode);
          break;
        }
        case 'restart': {
          if (!room.lastInitConfig) return;
          room.gs = engine.initChessRoyale(room.lastInitConfig);
          room.status = 'playing';
          emitRoomInfo(roomCode);
          broadcastRoom(roomCode);
          break;
        }
        default:
          break;
      }
    });

    socket.on('disconnect', () => {
      const roomCode = socket.data.roomCode;
      const room = getRoom(roomCode);
      if (!room) return;

      const idx = room.lobby.findIndex(entry => entry.socketId === socket.id);
      const removed = idx >= 0 ? room.lobby[idx] : null;
      if (idx >= 0) room.lobby.splice(idx, 1);

      if (room.status === 'playing' && removed?.playerId && room.gs) {
        const disconnectedPlayer = room.gs.players.find(player => player.id === removed.playerId);
        if (disconnectedPlayer?.alive) {
          room.disconnectedPlayerIds.add(removed.playerId);
          room.gs = {
            ...room.gs,
            message: `${disconnectedPlayer.name} se desconecto. Si no vuelve en 60s, perdera por inactividad.`,
          };
          emitRoomInfo(roomCode);
          broadcastRoom(roomCode);
          scheduleDisconnectForfeit(roomCode, removed.playerId);
        }
      }

      if (!room.lobby.length) {
        room.disconnectTimers.forEach(timer => clearTimeout(timer));
        rooms.delete(roomCode);
        emitRoomsUpdate();
        return;
      }

      // keep room joinable only if game hasn't started yet
      if (room.status === 'waiting') {
        emitRoomInfo(roomCode);
        emitRoomsUpdate();
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

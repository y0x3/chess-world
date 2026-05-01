import { useState } from 'react';
import './App.css';
import BlindChessGame, { initBlindGame } from './BlindChess';
import ChessRoyaleGame, { initChessRoyale } from './ChessRoyaleGame';

export default function App() {
  const [screen, setScreen] = useState('menu');
  const [config, setConfig] = useState({ timeLimit: 60, playerW: 'Jugador', playerB: 'Negras', vsBot: false });
  const [gameState, setGameState] = useState(null);

  function startBlindChess(cfg) {
    setConfig(cfg);
    setGameState(initBlindGame(cfg));
    setScreen('game');
  }

  function startChessRoyale(cfg) {
    setGameState(initChessRoyale(cfg));
    setScreen('royale');
  }

  if (screen === 'menu') return (
    <MenuScreen onSelect={mode => {
      if (mode === 'blind_human') setScreen('setup_human');
      if (mode === 'blind_bot') setScreen('setup_bot');
      if (mode === 'chess_royale') setScreen('setup_royale');
    }} />
  );

  if (screen === 'setup_human') return <SetupScreen vsBot={false} onBack={() => setScreen('menu')} onStart={startBlindChess} />;
  if (screen === 'setup_bot') return <SetupScreen vsBot={true} onBack={() => setScreen('menu')} onStart={startBlindChess} />;
  if (screen === 'setup_royale') return <RoyaleSetupScreen onBack={() => setScreen('menu')} onStart={startChessRoyale} />;
  if (screen === 'game') return <BlindChessGame initialState={gameState} config={config} onBack={() => setScreen('menu')} />;
  if (screen === 'royale') return <ChessRoyaleGame initialState={gameState} onBack={() => setScreen('menu')} />;
}

function MenuScreen({ onSelect }) {
  return (
    <div className="menu-screen">
      <div className="title-block">
        <div className="title-chess">CHESS</div>
        <div className="title-world">W O R L D</div>
        <div className="title-divider" />
      </div>

      <div className="menu-section-title">Ajedrez Clasico</div>
      <div className="menu-cards" style={{ marginBottom: '2rem' }}>
        <div className="mode-card disabled">
          <span className="badge-soon">PROXIMAMENTE</span>
          <div className="mode-icon">{'\u2659'}</div>
          <div className="mode-name">vs Jugador</div>
          <div className="mode-desc">Cara a cara en el mismo tablero.</div>
        </div>
        <div className="mode-card disabled">
          <span className="badge-soon">PROXIMAMENTE</span>
          <div className="mode-icon">{'\u25CE'}</div>
          <div className="mode-name">Online</div>
          <div className="mode-desc">Desafia rivales en todo el mundo.</div>
        </div>
        <div className="mode-card disabled">
          <span className="badge-soon">PROXIMAMENTE</span>
          <div className="mode-icon">{'\u2699'}</div>
          <div className="mode-name">vs Bot</div>
          <div className="mode-desc">Entrena contra la maquina.</div>
        </div>
      </div>

      <div className="menu-section-title">Ajedrez Ciego</div>
      <div className="menu-cards">
        <div className="mode-card" onClick={() => onSelect('blind_human')}>
          <div className="mode-icon">{'\u265E'}</div>
          <div className="mode-name">vs Jugador</div>
          <div className="mode-desc">Coloca tus piezas en secreto. Solo cuando ambos terminen, el tablero se revela y la batalla comienza.</div>
        </div>
        <div className="mode-card" onClick={() => onSelect('blind_bot')}>
          <div className="mode-badge-bot">BOT</div>
          <div className="mode-icon">{'\u2699'}</div>
          <div className="mode-name">vs Bot</div>
          <div className="mode-desc">El bot coloca sus piezas en secreto, de menor a mayor valor. Pon a prueba tu estrategia ciega.</div>
        </div>
        <div className="mode-card disabled">
          <span className="badge-soon">PROXIMAMENTE</span>
          <div className="mode-icon">{'\u25CE'}</div>
          <div className="mode-name">Online</div>
          <div className="mode-desc">Ajedrez ciego contra rivales en linea.</div>
        </div>
      </div>

      <div className="menu-section-title" style={{ marginTop: '2rem' }}>Modos Especiales</div>
      <div className="menu-cards">
        <div className="mode-card mode-card-royale" onClick={() => onSelect('chess_royale')}>
          <div className="mode-badge-bot">NEW</div>
          <div className="mode-icon">{'\u265B'}</div>
          <div className="mode-name">ChessRoyale</div>
          <div className="mode-desc">Reyes sobreviven en un mapa gigante con dados, niebla y casillas que entregan cartas de pieza para usar en el turno clave.</div>
        </div>
      </div>
    </div>
  );
}

function SetupScreen({ vsBot, onBack, onStart }) {
  const [playerW, setPlayerW] = useState('Jugador');
  const [playerB, setPlayerB] = useState('Negras');
  const [timeLimit, setTimeLimit] = useState(60);

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="setup-title">Ajedrez Ciego</div>
        <div className="setup-sub">{vsBot ? 'Tu (Blancas) vs Bot (Negras)' : 'Configura la partida antes de comenzar'}</div>

        <div className="form-group">
          <label className="form-label">Tu nombre</label>
          <input className="form-input" value={playerW} onChange={e => setPlayerW(e.target.value)} />
        </div>

        {!vsBot && (
          <div className="form-group">
            <label className="form-label">Nombre - Jugador Negras</label>
            <input className="form-input" value={playerB} onChange={e => setPlayerB(e.target.value)} />
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Tiempo para colocar piezas (segundos)</label>
          <input
            className="form-input"
            type="number"
            min={10}
            max={600}
            value={timeLimit}
            onChange={e => setTimeLimit(Math.max(10, Number(e.target.value)))}
          />
        </div>

        {vsBot && (
          <div className="bot-info-box">
            <div className="bot-info-icon">{'\u2699'}</div>
            <div>
              <div className="bot-info-title">Estrategia del Bot</div>
              <div className="bot-info-desc">
                El bot coloca sus piezas en secreto en el mismo tiempo que tu. En este modo no hay peones.
                Orden: Caballos {'\u2192'} Alfiles {'\u2192'} Torres {'\u2192'} Reina {'\u2192'} Rey.
                Sus posiciones se revelan al inicio de la batalla.
              </div>
            </div>
          </div>
        )}

        <button className="btn btn-primary" onClick={() => onStart({ playerW, playerB: vsBot ? 'Bot' : playerB, timeLimit, vsBot })}>
          Iniciar Partida
        </button>
        <div style={{ marginTop: '1rem' }}>
          <button className="btn btn-ghost" style={{ width: '100%' }} onClick={onBack}>Volver al Menu</button>
        </div>
      </div>
    </div>
  );
}

function RoyaleSetupScreen({ onBack, onStart }) {
  const [humanName, setHumanName] = useState('Tu');
  const [playerCount, setPlayerCount] = useState(4);
  const [mapSize, setMapSize] = useState(60);
  const [initialLives, setInitialLives] = useState(3);
  const [debugMode, setDebugMode] = useState(false);
  const suggestedMapSize = count => Math.max(40, Math.min(96, 24 + count * 9));
  const suggestedSpecialCounts = size => {
    const areaScale = (size * size) / (80 * 80);
    return {
      basic: Math.max(20, Math.round(120 * areaScale)),
      improved: Math.max(10, Math.round(56 * areaScale)),
      reveal: Math.max(8, Math.round(44 * areaScale)),
      special: Math.max(6, Math.round(32 * areaScale)),
    };
  };
  const [specialCounts, setSpecialCounts] = useState(() => suggestedSpecialCounts(60));
  const setSpecialCount = (type, value) => {
    const nextValue = Math.max(0, Math.floor(Number(value) || 0));
    setSpecialCounts(counts => ({ ...counts, [type]: nextValue }));
  };
  const setCountAndMap = count => {
    const nextCount = Math.max(2, Math.min(8, Number(count) || 2));
    const nextMapSize = suggestedMapSize(nextCount);
    setPlayerCount(nextCount);
    setMapSize(nextMapSize);
    setSpecialCounts(suggestedSpecialCounts(nextMapSize));
  };
  const setSizeAndSpecials = size => {
    const nextMapSize = Math.max(30, Math.min(120, Number(size) || 30));
    setMapSize(nextMapSize);
    setSpecialCounts(suggestedSpecialCounts(nextMapSize));
  };

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="setup-title">ChessRoyale</div>
        <div className="setup-sub">Configura tu partida contra bots antes de entrar al mapa.</div>

        <div className="form-group">
          <label className="form-label">Tu nombre</label>
          <input className="form-input" value={humanName} onChange={e => setHumanName(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Jugadores en la partida</label>
          <input
            className="form-input"
            type="number"
            min={2}
            max={8}
            value={playerCount}
            onChange={e => setCountAndMap(e.target.value)}
          />
        </div>

        <div className="royale-player-count">
          {[2, 3, 4, 5, 6, 7, 8].map(count => (
            <button
              key={count}
              className={`royale-count-btn ${playerCount === count ? 'is-selected' : ''}`}
              onClick={() => setCountAndMap(count)}
            >
              {count}
            </button>
          ))}
        </div>

        <div className="form-group">
          <label className="form-label">Tamano del mapa</label>
          <input
            className="form-input"
            type="number"
            min={30}
            max={120}
            value={mapSize}
            onChange={e => setSizeAndSpecials(e.target.value)}
          />
          <div className="setup-hint">Recomendado para {playerCount} jugadores: {suggestedMapSize(playerCount)} x {suggestedMapSize(playerCount)}.</div>
        </div>

        <div className="form-group">
          <label className="form-label">Vidas por jugador</label>
          <input
            className="form-input"
            type="number"
            min={1}
            max={10}
            value={initialLives}
            onChange={e => setInitialLives(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
          />
          <div className="setup-hint">Todos empiezan con esta cantidad de vidas.</div>
        </div>

        <div className="form-group">
          <label className="form-label">Casillas especiales del mapa</label>
          <div className="royale-special-counts">
            <label>
              <span><i className="royale-mini-swatch basic" /> Basicas</span>
              <input className="form-input" type="number" min={0} value={specialCounts.basic} onChange={e => setSpecialCount('basic', e.target.value)} />
            </label>
            <label>
              <span><i className="royale-mini-swatch improved" /> Mejoradas</span>
              <input className="form-input" type="number" min={0} value={specialCounts.improved} onChange={e => setSpecialCount('improved', e.target.value)} />
            </label>
            <label>
              <span><i className="royale-mini-swatch reveal" /> Tacticas</span>
              <input className="form-input" type="number" min={0} value={specialCounts.reveal} onChange={e => setSpecialCount('reveal', e.target.value)} />
            </label>
            <label>
              <span><i className="royale-mini-swatch special" /> Gigantes</span>
              <input className="form-input" type="number" min={0} value={specialCounts.special} onChange={e => setSpecialCount('special', e.target.value)} />
            </label>
          </div>
          <div className="setup-hint">Total: {specialCounts.basic + specialCounts.improved + specialCounts.reveal + specialCounts.special} casillas configuradas.</div>
        </div>

        <div className="bot-info-box">
          <div className="bot-info-icon">{'\u2699'}</div>
          <div>
            <div className="bot-info-title">Modo contra bots</div>
            <div className="bot-info-desc">
              Tu eres el Jugador 1. Los demas jugadores tiran y se mueven solos; durante sus turnos solo veras quien esta tirando y cuantos turnos faltan para volver a ti.
            </div>
          </div>
        </div>

        <label className="debug-toggle">
          <input type="checkbox" checked={debugMode} onChange={e => setDebugMode(e.target.checked)} />
          <span>
            <strong>Modo admin/debug</strong>
            <small>Agrega controles para probar zona, turnos, casillas especiales y piezas gigantes.</small>
          </span>
        </label>

        <button className="btn btn-primary" onClick={() => onStart({ humanName, playerCount, mapSize, initialLives, specialCounts, debugMode, vsBots: true })}>
          Iniciar ChessRoyale
        </button>
        <div style={{ marginTop: '1rem' }}>
          <button className="btn btn-ghost" style={{ width: '100%' }} onClick={onBack}>Volver al Menu</button>
        </div>
      </div>
    </div>
  );
}


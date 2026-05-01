export default function RoyaleDice({ rolling, revealing, displayedDice, onClick }) {
  return (
    <button className={`royale-center-die ${rolling ? 'is-rolling' : ''} ${revealing ? 'is-revealed' : ''}`} onClick={onClick}>
      <span className="royale-die-number">{displayedDice}</span>
      <span className="royale-die-label">{revealing ? 'Tu tirada' : 'Detener'}</span>
    </button>
  );
}

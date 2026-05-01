import { useCallback } from 'react';
import { playRoyaleSound } from '../logic/actions';

export default function useRoyaleSounds() {
  return useCallback((name) => playRoyaleSound(name), []);
}

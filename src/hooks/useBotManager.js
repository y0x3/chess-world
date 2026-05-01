import { useEffect } from 'react';

export default function useBotManager(callback, deps = []) {
  useEffect(() => {
    if (typeof callback !== 'function') return undefined;
    return callback();
  }, deps);
}

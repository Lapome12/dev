// Fin d'un geste continu (bouton tourné, pas dessinés, notes glissées) : referme l'étape
// d'annulation fusionnée, pour que le geste suivant en crée une nouvelle.

import type { Store } from '../project/store';

export function finGeste(store: Store): void {
  const s = store as Store & { endMerge?: () => void };
  if (typeof s.endMerge === 'function') s.endMerge();
}

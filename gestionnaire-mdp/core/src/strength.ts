// Estimation de la force d'un mot de passe avec zxcvbn-ts (dictionnaires communs + français).
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';
import * as fr from '@zxcvbn-ts/language-fr';

export interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  crackTime: string;
  warning?: string;
  suggestions: string[];
}

let factory: ZxcvbnFactory | null = null;

function zxcvbn(): ZxcvbnFactory {
  factory ??= new ZxcvbnFactory({
    dictionary: { ...common.dictionary, ...fr.dictionary },
    graphs: common.adjacencyGraphs,
    translations: fr.translations,
  });
  return factory;
}

/** zxcvbn devient très lent sur les entrées géantes : on n'analyse que le début. */
const MAX_ANALYSED = 100;

/**
 * Score de 0 (très faible) à 4 (très fort). `crackTime` suppose un vol du fichier
 * et une attaque hors ligne sur un hachage lent (10 000 essais par seconde).
 */
export function estimateStrength(pw: string, userInputs: string[] = []): Strength {
  if (pw.length === 0) return { score: 0, crackTime: 'immédiat', warning: 'Aucun mot de passe.', suggestions: [] };
  const r = zxcvbn().check(pw.slice(0, MAX_ANALYSED), userInputs);
  const result: Strength = {
    score: r.score,
    crackTime: r.crackTimes.offlineSlowHashingXPerSecond.display,
    suggestions: r.feedback.suggestions,
  };
  if (r.feedback.warning) result.warning = r.feedback.warning;
  return result;
}

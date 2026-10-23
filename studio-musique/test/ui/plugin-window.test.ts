import { describe, expect, it } from 'vitest';
import type { ParamDef } from '../../src/engine/params';
import { grouper, prefixeAdsr, valeurReglage } from '../../src/ui/views/plugin-window';
import { listPlugins } from '../../src/engine/params';

const n = (id: string, group?: string): ParamDef => ({ id, label: id, kind: 'number', min: 0, max: 10, default: 5, help: '', ...(group ? { group } : {}) });

describe('fenêtres de plugins', () => {
  it('regroupe les réglages dans l\'ordre, sans groupe = Général', () => {
    const g = grouper([n('a', 'Osc'), n('b'), n('c', 'Osc'), n('d', 'Filtre')]);
    expect(g.map(x => [x.nom, x.params.map(p => p.id)])).toEqual([['Osc', ['a', 'c']], ['Général', ['b']], ['Filtre', ['d']]]);
  });

  it('reconnaît une enveloppe ADSR complète', () => {
    expect(prefixeAdsr([n('ampa'), n('ampd'), n('amps'), n('ampr')])).toBe('amp');
    expect(prefixeAdsr([n('ampa'), n('ampd')])).toBeNull();
  });

  it('valeur affichée : bornée, sinon défaut', () => {
    expect(valeurReglage(n('x'), { x: 99 })).toBe(10);
    expect(valeurReglage(n('x'), { x: 'n' })).toBe(5);
    expect(valeurReglage({ id: 't', label: 't', kind: 'toggle', default: false, help: '' }, { t: true })).toBe(true);
  });

  it('chaque instrument du moteur donne une fenêtre avec au moins un groupe', () => {
    for (const p of listPlugins()) expect(grouper(p.params).length).toBeGreaterThan(0);
  });
});

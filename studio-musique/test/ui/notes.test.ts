import { describe, expect, it } from 'vitest';
import type { Pattern } from '../../src/project/types';
import { copierPattern, definirPas, nombrePas, nomLibre, notesDuPas, pasAllume } from '../../src/ui/notes';
import { formaterPosition } from '../../src/ui/lecture';

const pattern = (): Pattern => ({ id: 'p', name: 'Pattern 1', color: '#fff', lengthTicks: 384, notes: {} });

describe('pas du Rack', () => {
  it('allume puis éteint un pas à la hauteur de base', () => {
    const p = pattern();
    expect(definirPas(p, 'c', 4, true, 36)).toBe(true);
    expect(p.notes['c']).toEqual([expect.objectContaining({ tick: 96, length: 24, pitch: 36, velocity: 0.8 })]);
    expect(definirPas(p, 'c', 4, true, 36)).toBe(false);
    expect(pasAllume(p.notes['c'], 4)).toBe(true);
    expect(definirPas(p, 'c', 4, false, 36)).toBe(true);
    expect(p.notes['c']).toEqual([]);
  });

  it('un pas est allumé par toute note qui commence dedans, quelle que soit sa hauteur', () => {
    const notes = [{ id: 'n', tick: 30, length: 96, pitch: 72, velocity: 1 }];
    expect(notesDuPas(notes, 1)).toHaveLength(1);
    expect(pasAllume(notes, 0)).toBe(false);
    expect(pasAllume(notes, 2)).toBe(false);
  });

  it('garde les notes triées', () => {
    const p = pattern();
    definirPas(p, 'c', 8, true, 60);
    definirPas(p, 'c', 2, true, 60);
    expect(p.notes['c']?.map(n => n.tick)).toEqual([48, 192]);
  });

  it('nombre de pas affiché', () => {
    expect(nombrePas({ ...pattern(), lengthTicks: 384 })).toBe(16);
    expect(nombrePas({ ...pattern(), lengthTicks: 768 })).toBe(32);
    expect(nombrePas({ ...pattern(), lengthTicks: 1536 })).toBe(64);
  });

  it('copie un pattern avec de nouveaux identifiants', () => {
    const p = pattern();
    definirPas(p, 'c', 0, true, 60);
    const c = copierPattern(p, 'q', 'Copie');
    expect(c.id).toBe('q');
    expect(c.notes['c']?.[0]?.id).not.toBe(p.notes['c']?.[0]?.id);
    expect(c.notes['c']?.[0]?.tick).toBe(0);
  });

  it('nom libre', () => {
    expect(nomLibre('Pattern', ['Pattern 1', 'Pattern 2'])).toBe('Pattern 3');
    expect(nomLibre('Pattern', ['Pattern 2'])).toBe('Pattern 1');
  });
});

describe('position', () => {
  it('mesure:temps:pas', () => {
    expect(formaterPosition(0).trim()).toBe('1:1:1');
    expect(formaterPosition(384 + 96 + 24).trim()).toBe('2:2:2');
  });
});

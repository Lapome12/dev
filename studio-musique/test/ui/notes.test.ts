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

describe('piano roll', () => {
  it('noms de notes et touches noires', async () => {
    const { nomNote, estNoire } = await import('../../src/ui/notes');
    expect(nomNote(60)).toBe('C4');
    expect(nomNote(69)).toBe('A4');
    expect(nomNote(61)).toBe('C#4');
    expect(estNoire(61)).toBe(true);
    expect(estNoire(64)).toBe(false);
  });

  it('aimant, quantification, découpe', async () => {
    const { aimanter, quantifier, decouper, longueurCouvrante, etendue } = await import('../../src/ui/notes');
    expect(aimanter(37, 24)).toBe(48);
    expect(aimanter(37, 24, 'bas')).toBe(24);
    expect(aimanter(37.4, 1)).toBe(37);
    const notes = [{ id: 'a', tick: 50, length: 5, pitch: 60, velocity: 1 }, { id: 'b', tick: 13, length: 30, pitch: 62, velocity: 1 }];
    quantifier(notes, 24, new Set(['a']));
    expect(notes.map(n => [n.id, n.tick, n.length])).toEqual([['b', 13, 30], ['a', 48, 24]]);
    const seconde = decouper(notes, 'a', 60);
    expect(seconde).toMatchObject({ tick: 60, length: 12 });
    expect(notes.find(n => n.id === 'a')?.length).toBe(12);
    expect(decouper(notes, 'a', 48)).toBeNull();
    expect(longueurCouvrante(384, [{ id: 'x', tick: 380, length: 10, pitch: 1, velocity: 1 }])).toBe(768);
    expect(etendue(notes, 24)).toEqual({ debut: 0, fin: 72 });
  });
});

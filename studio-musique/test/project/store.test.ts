import { describe, expect, it, vi } from 'vitest';
import { newChannel, newEffect, newProject, MIXER_TRACKS } from '../../src/project/defaults';
import { createStore, HISTORY_LIMIT } from '../../src/project/store';

describe('newProject', () => {
  it('suit le plan : 4 canaux, 1 pattern, 13 tranches, 8 pistes, 130 BPM', () => {
    const p = newProject();
    expect(p.format).toBe('frequence');
    expect(p.version).toBe(1);
    expect(p.bpm).toBe(130);
    expect(p.channels.map(c => c.name)).toEqual(['Grosse caisse', 'Caisse claire', 'Charley', 'Trio']);
    expect(p.channels.map(c => c.instrument.type)).toEqual(['frappe', 'frappe', 'frappe', 'trio']);
    expect(p.channels.map(c => c.mixerTrack)).toEqual([1, 2, 3, 4]);
    expect(p.patterns).toHaveLength(1);
    expect(p.patterns[0]!.lengthTicks).toBe(1536);
    expect(p.mixer).toHaveLength(MIXER_TRACKS);
    expect(p.mixer.map(t => t.index)).toEqual([...Array(13).keys()]);
    expect(p.mixer[0]!.name).toBe('Maître');
    expect(p.mixer[12]!.name).toBe('Tranche 12');
    expect(p.arrangement.tracks).toHaveLength(8);
    expect(new Set(p.channels.map(c => c.color)).size).toBe(4);
  });

  it('est sérialisable en JSON sans perte', () => {
    const p = newProject();
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });

  it('donne des ids uniques', () => {
    const a = newChannel('trio'), b = newChannel('trio');
    expect(a.id).not.toBe(b.id);
    expect(newEffect('reverbe')).toMatchObject({ type: 'reverbe', bypass: false, mix: 1 });
  });

  it('refuse un preset inconnu', () => {
    expect(() => newChannel('trio', 'nexiste-pas')).toThrow();
  });
});

describe('store', () => {
  it('modifie sur une copie et prévient les abonnés', () => {
    const initial = newProject();
    const store = createStore(initial);
    const fn = vi.fn();
    const stop = store.subscribe(fn);
    const avant = store.get();
    store.update('Tempo', p => { p.bpm = 90; });
    expect(store.get().bpm).toBe(90);
    expect(avant.bpm).toBe(130);
    expect(initial.bpm).toBe(130);
    expect(fn).toHaveBeenCalledTimes(1);
    stop();
    store.update('Tempo', p => { p.bpm = 100; });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('annule et rétablit avec les labels', () => {
    const store = createStore(newProject());
    expect(store.canUndo()).toBeNull();
    store.update('Renommer le projet', p => { p.name = 'A'; });
    store.update('Tempo', p => { p.bpm = 120; });
    expect(store.canUndo()).toBe('Tempo');
    store.undo();
    expect(store.get().bpm).toBe(130);
    expect(store.get().name).toBe('A');
    expect(store.canRedo()).toBe('Tempo');
    store.redo();
    expect(store.get().bpm).toBe(120);
    store.undo(); store.undo();
    expect(store.get().name).toBe('Sans titre');
    store.undo();                                        // rien à annuler : sans effet
    expect(store.canUndo()).toBeNull();
    store.update('Swing', p => { p.swing = 0.5; });
    expect(store.canRedo()).toBeNull();                  // une nouvelle action vide le rétablissement
  });

  it('fusionne les appels successifs de même label avec merge', () => {
    const store = createStore(newProject());
    for (let i = 0; i < 50; i++) store.update('Volume', p => { p.channels[0]!.volume = i / 50; }, { merge: true });
    store.undo();
    expect(store.get().channels[0]!.volume).toBe(0.8);
    expect(store.canUndo()).toBeNull();
  });

  it('ne fusionne pas des labels différents ni après une annulation', () => {
    const store = createStore(newProject());
    store.update('Volume', p => { p.bpm = 100; }, { merge: true });
    store.update('Pan', p => { p.bpm = 101; }, { merge: true });
    store.update('Volume', p => { p.bpm = 102; }, { merge: true });
    store.undo();
    expect(store.get().bpm).toBe(101);
    store.update('Volume', p => { p.bpm = 103; }, { merge: true });
    store.undo();
    expect(store.get().bpm).toBe(101);
    // Sans merge, deux appels de même label font deux étapes.
    store.update('Tempo', p => { p.bpm = 110; });
    store.update('Tempo', p => { p.bpm = 111; });
    store.undo();
    expect(store.get().bpm).toBe(110);
  });

  it('endMerge sépare deux gestes successifs sur le même contrôle', () => {
    const store = createStore(newProject());
    store.update('Volume', p => { p.channels[0]!.volume = 0.5; }, { merge: true });
    store.update('Volume', p => { p.channels[0]!.volume = 0.4; }, { merge: true });
    store.endMerge();
    store.update('Volume', p => { p.channels[0]!.volume = 0.2; }, { merge: true });
    store.undo();
    expect(store.get().channels[0]!.volume).toBe(0.4);
    store.undo();
    expect(store.get().channels[0]!.volume).toBe(0.8);
  });

  it('garde au plus 200 étapes', () => {
    const store = createStore(newProject());
    for (let i = 0; i < HISTORY_LIMIT + 50; i++) store.update(`Étape ${i}`, p => { p.bpm = 40 + (i % 200); });
    let n = 0;
    while (store.canUndo()) { store.undo(); n++; }
    expect(n).toBe(HISTORY_LIMIT);
    expect(store.get().bpm).toBe(40 + 49);
  });

  it('replace vide l’historique', () => {
    const store = createStore(newProject());
    store.update('Tempo', p => { p.bpm = 99; });
    const autre = newProject();
    autre.name = 'Ouvert';
    store.replace(autre);
    expect(store.get().name).toBe('Ouvert');
    expect(store.canUndo()).toBeNull();
    expect(store.canRedo()).toBeNull();
  });

  it('un abonné qui se désabonne pendant la notification ne casse rien', () => {
    const store = createStore(newProject());
    const appels: string[] = [];
    const stopA = store.subscribe(() => { appels.push('a'); stopA(); });
    store.subscribe(() => appels.push('b'));
    store.update('x', p => { p.bpm = 100; });
    store.update('y', p => { p.bpm = 101; });
    expect(appels).toEqual(['a', 'b', 'b']);
  });
});

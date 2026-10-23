import { describe, expect, it } from 'vitest';
import type { Clip } from '../../src/project/types';
import { decouperClip, finDesClips, rognerDebut, tickDansPattern } from '../../src/ui/clips';

const clip = (o: Partial<Clip> = {}): Clip => ({ id: 'a', trackId: 't', patternId: 'p', start: 384, length: 768, offset: 0, ...o });

describe('clips', () => {
  it('coupe un clip en gardant le contenu en place', () => {
    const clips = [clip()];
    const b = decouperClip(clips, 'a', 384 + 500);
    expect(clips[0]).toMatchObject({ start: 384, length: 500 });
    expect(b).toMatchObject({ start: 884, length: 268, offset: 500 });
    expect(decouperClip(clips, 'a', 384)).toBeNull();
  });

  it('rogne le début sans dépasser le début du pattern', () => {
    const c = clip({ offset: 100 });
    rognerDebut(c, 500, 24);
    expect(c).toMatchObject({ start: 500, length: 652, offset: 216 });
    rognerDebut(c, 0, 24);
    expect(c).toMatchObject({ start: 284, offset: 0, length: 868 });
    rognerDebut(c, 5000, 24);
    expect(c.length).toBe(24);
  });

  it('position dans un pattern répété', () => {
    expect(tickDansPattern(clip(), 384 + 400, 384)).toBe(16);
    expect(tickDansPattern(clip({ offset: 10 }), 384, 384)).toBe(10);
  });

  it('fin du dernier clip', () => {
    expect(finDesClips([])).toBe(0);
    expect(finDesClips([clip(), clip({ start: 0, length: 96 })])).toBe(1152);
  });
});

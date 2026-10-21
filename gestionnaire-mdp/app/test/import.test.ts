import { importCsv } from '@cadenas/core';
import { describe, expect, it } from 'vitest';
import { DemoBackend } from '../src/backend-demo';
import { groupePourChemin } from '../src/ui/outils-coffre';

describe('import : groupes par chemin', () => {
  it('crée les groupes imbriqués une seule fois et réutilise les existants', async () => {
    const b = new DemoBackend({ deverrouille: true, vide: true });
    const groupes = await b.listGroups();
    const racine = groupes.find(g => g.parentId === null)!.id;
    const pro = await groupePourChemin(b, groupes, racine, 'Banque/Pro');
    const encore = await groupePourChemin(b, groupes, racine, ' Banque / Pro ');
    expect(encore).toBe(pro);
    const apres = await b.listGroups();
    const banque = apres.find(g => g.name === 'Banque')!;
    expect(banque.parentId).toBe(racine);
    expect(apres.find(g => g.id === pro)?.parentId).toBe(banque.id);
  });

  it('importe un export Chrome dans le coffre de démo', async () => {
    const b = new DemoBackend({ deverrouille: true, vide: true });
    const csv = 'name,url,username,password,note\nExemple,https://exemple.fr/login,moi@exemple.fr,x7!Kq2@pL9#vW4zr,\n';
    const entrees = importCsv(csv, 'chrome');
    expect(entrees).toHaveLength(1);
    const groupes = await b.listGroups();
    const racine = groupes.find(g => g.parentId === null)!.id;
    const g = await groupePourChemin(b, groupes, racine, entrees[0]!.groupPath || 'Importé');
    const { groupPath: _p, ...saisie } = entrees[0]!;
    const id = await b.addEntry({ ...saisie, groupId: g });
    expect(await b.getSecret(id, 'password')).toBe('x7!Kq2@pL9#vW4zr');
  });
});

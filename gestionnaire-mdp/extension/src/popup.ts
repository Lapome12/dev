import { ErreurCadenas, type Reponse } from './messages';

async function statut(): Promise<unknown> {
  const r = (await chrome.runtime.sendMessage({ type: 'vault/status', args: [] })) as Reponse;
  if (!r.ok) throw new ErreurCadenas(r.code, r.message);
  return r.value;
}

const racine = document.getElementById('popup');
if (racine) {
  statut().then(
    (etat) => {
      racine.textContent = `État du coffre : ${JSON.stringify(etat)}`;
    },
    (e: unknown) => {
      racine.textContent = e instanceof Error ? e.message : String(e);
    },
  );
}

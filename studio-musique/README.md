# Fréquence

Station audio (DAW) dans le navigateur, écrite par nous : rack et séquenceur pas à pas, piano roll,
arrangement, console de mixage, 5 instruments et 10 effets maison en Web Audio natif, export WAV et MIDI.
Aucune dépendance d'exécution, aucun fichier audio : tous les sons sont synthétisés.

Plan et répartition : `PLAN.md` de la mission (dossier projet `studio-musique/`).

## Lancer en local

```sh
npm ci
npm run dev            # http://localhost:5173
npm run typecheck && npm test
npm run build:artefact # dist/artefact/frequence.html, un seul fichier
```

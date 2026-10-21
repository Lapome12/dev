#!/usr/bin/env bash
# Régénère les coffres de test avec keepassxc-cli (apt install keepassxc).
# Mots de passe FICTIFS, réservés aux tests. Ne jamais mettre de vrai coffre ici.
set -euo pipefail
cd "$(dirname "$0")"
rm -f keepassxc.kdbx keepassxc-clefichier.kdbx keepassxc-clefichier.keyx

MDP='essai-cadenas-2026'

printf '%s\n%s\n' "$MDP" "$MDP" | keepassxc-cli db-create -q -p -t 200 keepassxc.kdbx
printf '%s\n' "$MDP" | keepassxc-cli mkdir -q keepassxc.kdbx 'Banque'
printf '%s\n%s\n' "$MDP" 'Mdp-Exemple-42!' | keepassxc-cli add -q -u 'demo@exemple.fr' --url 'https://exemple.fr' --notes 'Entrée créée par keepassxc-cli' -p keepassxc.kdbx 'Exemple'
printf '%s\n%s\n' "$MDP" 'Autre-Mdp-7?' | keepassxc-cli add -q -u 'jean' --url 'https://banque.exemple.fr' -p keepassxc.kdbx 'Banque/Ma banque'

# Coffre protégé par mot de passe + fichier clé (format KeePass XML v2)
printf '%s\n%s\n' "$MDP" "$MDP" | keepassxc-cli db-create -q -p -t 200 --set-key-file keepassxc-clefichier.keyx keepassxc-clefichier.kdbx
printf '%s\n%s\n' "$MDP" 'Avec-Cle-9#' | keepassxc-cli add -q -k keepassxc-clefichier.keyx -u 'cle' -p keepassxc-clefichier.kdbx 'Protégé par clé'

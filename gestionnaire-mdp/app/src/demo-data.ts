// Données de démo : comptes FICTIFS uniquement (exemple.fr, exemple.com, .exemple).
// Quelques mots de passe faibles, réutilisés ou anciens pour alimenter l'écran Santé.
// Les secrets TOTP sont des valeurs de test publiques (base32 de mots courants), pas de vrais comptes.

export interface GroupeDemo { id: string; nom: string }

export interface EntreeDemo {
  id: string;
  groupe: string;
  titre: string;
  identifiant: string;
  motDePasse: string;
  url: string;
  notes?: string;
  totp?: string;
  tags?: string[];
  champs?: { key: string; value: string; protected: boolean }[];
  /** Ancienneté de la dernière modification, en jours. */
  age: number;
  versions?: number;
}

export const NOM_COFFRE_DEMO = 'Coffre de démo';
export const FICHIER_DEMO = 'demo.kdbx';
export const MOT_DE_PASSE_DEMO = 'demo';

export const GROUPES_DEMO: GroupeDemo[] = [
  { id: 'g-perso', nom: 'Personnel' },
  { id: 'g-travail', nom: 'Travail' },
  { id: 'g-banque', nom: 'Banque et impôts' },
  { id: 'g-social', nom: 'Réseaux sociaux' },
  { id: 'g-maison', nom: 'Maison' },
  { id: 'g-achats', nom: 'Achats' },
];

const totp = (secret: string, compte: string) =>
  `otpauth://totp/${encodeURIComponent(compte)}?secret=${secret}&issuer=Demo&algorithm=SHA1&digits=6&period=30`;

export const ENTREES_DEMO: EntreeDemo[] = [
  { id: 'e01', groupe: 'g-perso', titre: 'Messagerie Exemple', identifiant: 'eliott.demo@exemple.fr', motDePasse: 'Vq7#tL2!mR9pZx4&', url: 'https://mail.exemple.fr', totp: totp('JBSWY3DPEHPK3PXP', 'mail'), age: 40, tags: ['important'], versions: 3 },
  { id: 'e02', groupe: 'g-perso', titre: 'Cloud Photos', identifiant: 'eliott.demo@exemple.fr', motDePasse: 'tulipe-orage-cactus-boussole-42', url: 'https://photos.exemple.com', age: 12 },
  { id: 'e03', groupe: 'g-perso', titre: 'Musique en ligne', identifiant: 'eliott.demo@exemple.fr', motDePasse: 'Q2#gH7!wS4$eR9tY', url: 'https://musique.exemple.com', age: 18 },
  { id: 'e04', groupe: 'g-perso', titre: 'Vidéo à la demande', identifiant: 'eliott.demo@exemple.fr', motDePasse: 'cinema123', url: 'https://video.exemple.com', age: 260 },
  { id: 'e05', groupe: 'g-perso', titre: 'Forum cuisine', identifiant: 'popote_demo', motDePasse: 'm4rmite-ch0colat', url: 'https://forum-cuisine.exemple', age: 33 },
  { id: 'e06', groupe: 'g-banque', titre: 'Banque Démo', identifiant: '00123456', motDePasse: 'K8$wq!2Lr#Yz5Np3', url: 'https://banque-demo.exemple', totp: totp('GEZDGNBVGY3TQOJQ', 'banque'), age: 90, notes: 'Code client sur la carte verte.\nConseiller : agence fictive de Lyon.', tags: ['important'], versions: 5 },
  { id: 'e07', groupe: 'g-banque', titre: 'Impôts (démo)', identifiant: '1 23 45 678 901 234', motDePasse: 'Soleil2019', url: 'https://impots.exemple.fr', age: 520 },
  { id: 'e08', groupe: 'g-banque', titre: 'Assurance habitation', identifiant: 'AH-778899', motDePasse: 'n7!Kp2@xW9#dL4qs', url: 'https://assurance.exemple.fr', age: 150, champs: [{ key: 'Numéro de contrat', value: 'HAB-2024-000123', protected: false }] },
  { id: 'e09', groupe: 'g-banque', titre: 'Mutuelle', identifiant: 'eliott.demo@exemple.fr', motDePasse: 'Soleil2019', url: 'https://mutuelle.exemple.fr', age: 430 },
  { id: 'e10', groupe: 'g-social', titre: 'Réseau Pro', identifiant: 'eliott-demo', motDePasse: 'Soleil2019', url: 'https://reseau-pro.exemple.com', age: 410 },
  { id: 'e11', groupe: 'g-social', titre: 'Photos & amis', identifiant: 'eliott.popote', motDePasse: 'f3R!9vq#Lm2&xT8k', url: 'https://photos-amis.exemple', totp: totp('MFRGGZDFMZTWQ2LK', 'photos'), age: 33 },
  { id: 'e12', groupe: 'g-social', titre: 'Microblog', identifiant: '@eliott_demo', motDePasse: 'azerty', url: 'https://microblog.exemple.com', age: 800 },
  { id: 'e13', groupe: 'g-social', titre: 'Messagerie instantanée', identifiant: '+33 6 00 00 00 00', motDePasse: 'violon-sable-retard-ampoule-7', url: 'https://chat.exemple.com', age: 22 },
  { id: 'e14', groupe: 'g-travail', titre: 'Agenda Popote', identifiant: 'contact@popote.exemple', motDePasse: 'H3!vB9qa@T6uW2ke', url: 'https://agenda.popote.exemple', totp: totp('NBSWY3DPO5XXE3DE', 'agenda'), age: 5, tags: ['popote'] },
  { id: 'e15', groupe: 'g-travail', titre: 'Fournisseur primeurs', identifiant: 'popote-commandes', motDePasse: 'carotte', url: 'https://primeurs.exemple.fr', age: 700, tags: ['popote'] },
  { id: 'e16', groupe: 'g-travail', titre: 'Hébergeur du site', identifiant: 'eliott', motDePasse: 'pX2&nV8#cM5!rQ7z', url: 'https://console.hebergeur.exemple', totp: totp('KRUGS4ZANFZSAYJA', 'hebergeur'), age: 2, tags: ['popote', 'important'], champs: [{ key: 'Clé API', value: 'demo_cle_api_0000000000000000', protected: true }] },
  { id: 'e17', groupe: 'g-travail', titre: 'Caisse enregistreuse', identifiant: 'popote', motDePasse: 'Popote2024!', url: 'https://caisse.exemple.fr', age: 380, tags: ['popote'] },
  { id: 'e18', groupe: 'g-travail', titre: 'Comptabilité', identifiant: 'eliott.demo@exemple.fr', motDePasse: 'Z4#tq9!Wn2@vLp7e', url: 'https://compta.exemple.fr', age: 64 },
  { id: 'e19', groupe: 'g-maison', titre: 'Box internet', identifiant: 'admin', motDePasse: 'Z9!fD3k#Lw7@pS2r', url: 'http://192.168.1.1', age: 300, notes: 'Wi-Fi : réseau « Popote-5G ».' },
  { id: 'e20', groupe: 'g-maison', titre: 'Énergie (démo)', identifiant: 'eliott.demo@exemple.fr', motDePasse: 'ampoule-violon-sable-retard', url: 'https://espace-client.energie.exemple', age: 60 },
  { id: 'e21', groupe: 'g-maison', titre: 'Eau (démo)', identifiant: 'eliott.demo@exemple.fr', motDePasse: '', url: 'https://eau.exemple.fr', age: 120, notes: 'Mot de passe à créer au prochain relevé.' },
  { id: 'e22', groupe: 'g-maison', titre: 'Alarme maison', identifiant: 'code', motDePasse: '4821', url: '', age: 900, notes: 'Code du boîtier de l\'entrée (fictif).' },
  { id: 'e23', groupe: 'g-achats', titre: 'Librairie en ligne', identifiant: 'eliott.demo@exemple.fr', motDePasse: 'r8@Hq3!zX6#mT1wa', url: 'https://librairie.exemple.fr', age: 45 },
  { id: 'e24', groupe: 'g-achats', titre: 'Marché fermier', identifiant: 'popote', motDePasse: 'cinema123', url: 'https://marche-fermier.exemple', age: 95 },
  { id: 'e25', groupe: 'g-achats', titre: 'Train (démo)', identifiant: 'eliott.demo@exemple.fr', motDePasse: 'boussole-tilleul-galet-hibou-3', url: 'https://train.exemple.fr', totp: totp('ORSXG5BAORSXG5BA', 'train'), age: 8 },
];

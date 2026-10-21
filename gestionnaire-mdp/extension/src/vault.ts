// Page « Coffre » plein écran : l'interface de app/ (Dev 2) montée sur le gardien de l'extension.
import { mountApp } from '@cadenas/app';
import { ExtensionBackend } from './backend-extension';

const racine = document.getElementById('app');
if (racine) mountApp(racine, new ExtensionBackend());

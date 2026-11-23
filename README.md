# SwipeCast

Basculer une vidéo en cours entre **téléphone Android** et **PC Windows** sans perdre la progression : on glisse la pastille « Envoyer » vers le haut, l'autre appareil reçoit une notification, et un appui sur celle-ci rouvre la vidéo **en plein écran, au bon moment**.

```
 Téléphone (Capacitor)                       PC Windows (Electron)
┌───────────────────────┐   WebSocket LAN   ┌────────────────────────────────┐
│ UI React (MVVM)       │◄─────────────────►│ Hub Node (ws) ◄─► UI React      │
│ InAppBrowser (capgo)  │  progress/handoff │  port 47321       WebContentsView│
│  └ tracker.js injecté │                   │                    └ tracker.js │
└───────────────────────┘                   └────────────────────────────────┘
```

## Choix de la communication

| Option | Verdict |
|---|---|
| **WebSocket sur le réseau local, hub dans l'app PC** ✅ | Pas de cloud ni de compte, latence de quelques ms, données qui restent chez toi. Le hub tourne *dans* le processus Electron : un seul programme à installer sur le PC. |
| Serveur cloud (relais) | Marche hors du même Wi-Fi, mais demande un hébergement, de l'authentification et du coût pour 2 appareils. |
| WebRTC P2P | Il faut quand même un serveur de signalisation. Surdimensionné pour quelques messages JSON. |
| FCM (push Firebase) | Le seul moyen de réveiller une app Android **fermée**. Prévu en v2 (voir les limites). |

Le backend est en **Node.js** plutôt qu'en Python : Electron l'exécute nativement, donc pas de runtime Python à embarquer sur Windows.

**Appairage** : le PC affiche son adresse et un code à 6 chiffres (usage unique, 5 essais puis blocage 60 s). Le téléphone l'échange contre un jeton permanent de 256 bits.

## Structure

```
server/            Hub Node : relais WebSocket, appairage, persistance JSON (+ tests)
app/
  shared/tracker.js   Script injecté dans les pages : détection vidéo, seek robuste, plein écran, pastille de swipe
  electron/           Processus principal Windows (hub embarqué, WebContentsView, zone de notification)
  android/            Projet Android généré par Capacitor
  src/
    models/           M : types du domaine, fonctions pures
    services/         M : I/O (SyncService, navigateurs, notifications, stockage) — 1 implémentation par plateforme
    viewmodels/       VM : AppViewModel, PairingViewModel (aucune API plateforme)
    views/            V : composants React (Tailwind 3.4 compilé depuis SCSS)
    core/             Socle MVVM (ViewModel + useSyncExternalStore)
tests/e2e/         Tests Chrome headless (Playwright Python)
```

## Démarrer

Prérequis : Node ≥ 20. Pour Android : Android Studio et un JDK 21.

```bash
npm install

# PC Windows (dev)
npm run dev:desktop        # Vite + Electron, hub sur le port 47321

# Installeur Windows
npm run dist:win           # → app/release/SwipeCast Setup x.y.z.exe

# Android
npm run android            # build + cap sync + ouverture dans Android Studio
```

Au premier lancement sur le PC, **autorise SwipeCast dans le pare-feu Windows (réseaux privés)**, sinon le téléphone ne pourra pas se connecter. Ensuite, dans l'app PC, ouvre **Réglages → Appairage** et saisis l'adresse et le code affichés sur le téléphone.

Fermer la fenêtre réduit l'app dans la zone de notification, pour que le hub reste joignable. Le menu de l'icône permet d'activer le lancement au démarrage de Windows.

## Utilisation

- **Envoyer** : glisse la pastille « Envoyer » vers le haut dans la page, ou fais `Alt+S`, ou clique sur le bouton de la barre (PC). La vidéo se met en pause ici.
- **Recevoir** : une notification apparaît, ou une feuille « Regarder en plein écran » si l'app est ouverte. Elle reprend 3 s avant le point d'envoi (réglable).
- **Récupérer sans envoi préalable** : la carte « Sur PC-Bureau » affiche la vidéo en cours sur l'autre appareil, avec un bouton « Reprendre ici ».

## Reprise de la position

Deux mécanismes complémentaires :
1. **Paramètre d'URL** quand le site le permet (`models/siteAdapters.ts`) : YouTube `t=754s` (`start=` pour /embed), Vimeo `#t=`, Dailymotion `start=`. Le lecteur démarre nativement au bon endroit, même après une pub.
2. **Seek par le script injecté** pour tous les autres sites : réappliqué tant que le lecteur ne l'a pas « tenu » 2 s, et suspendu pendant les pubs YouTube (`.ad-showing`).

Le script est compatible **Trusted Types** (CSP de YouTube) : aucune affectation d'`innerHTML`.

## Blocage des pubs

- **Popups / tab-under** : le piège des sites de streaming est le *tab-under* (le script ouvre l'épisode dans une nouvelle fenêtre puis remplace la page par la pub avec `location.replace`, ce qui efface l'épisode de l'historique).
  - PC : Electron refuse toutes les fenêtres (`window.open` → `null`, le script abandonne), et une iframe ne peut plus remplacer la page par un autre site (`will-navigate` + `initiator`). La barre affiche « Popup bloquée · Ouvrir quand même ».
  - Android : `shared/popup-guard.js` est injecté **au début du document dans toutes les frames** (`preShowScriptInjectionTime: 'documentStart'` → `addDocumentStartJavaScript`). Il neutralise `window.open` (non réécrivable par la page) et bloque les calques `<a target=_blank>` et les liens `_top` vers d'autres sites. En dernier recours, les popups natives restantes sont ouvertes cachées puis fermées. Si la page principale change de site dans les 3 s qui suivent, on recharge l'épisode à la même position.
- **Régies publicitaires** (`shared/ad-hosts.json`) : bloquées pour toutes les requêtes sur PC (`webRequest`), et pour les navigations sur Android (`blockedHosts`). La liste est à compléter au fil de l'eau.

## Tests

```bash
npm test                                                          # hub : appairage, transfert en ligne/hors ligne, validation
pip install playwright && npm run build
python3 tests/e2e/test_tracker.py <dossier avec page.html + clip.webm> app/shared/tracker.js   # 13 vérifications
python3 tests/e2e/test_e2e.py                                     # appairage UI + synchro + transfert (6 vérifications)
python3 tests/e2e/test_feedback.py <dossier> app/shared/tracker.js  # Trusted Types, pubs YouTube, DOM réécrit (7 vérifications)
python3 tests/e2e/test_popup_guard.py app/shared/popup-guard.js  # tab-under, calques, liens _top (10 vérifications)
node --experimental-strip-types tests/unit/siteAdapters.test.ts   # position dans l'URL (8 vérifications)
```

## Limites connues (v1)

1. **Android, app tuée** : sans push, le téléphone ne reçoit rien tant que l'app est fermée. Le transfert reste en attente 2 h sur le hub et **s'affiche dès l'ouverture de l'app**. Si l'app est en arrière-plan avec la connexion encore active, la notification arrive. Solution v2 : FCM, ou un service au premier plan.
2. **DRM (Netflix, Disney+, Prime…)** : Electron standard n'inclut pas Widevine, donc ces sites ne liront pas sur PC. Il faudrait la build [castLabs ECS](https://github.com/castlabs/electron-releases) avec signature VMP. La WebView Android, elle, gère généralement Widevine.
3. **Iframes sur Android** : le plugin n'injecte que dans la frame principale. Les lecteurs embarqués en iframe cross-origin (certains sites de streaming) sont suivis sur PC (injection dans toutes les frames) mais pas sur Android. Dans ce cas, c'est l'URL de la page qui est transmise, sans la position.
4. **Même réseau requis** : en 4G ou hors de chez toi, passer par Tailscale (adresse 100.x du PC) fonctionne sans changer le code.
5. Sur Android, les pubs **affichées dans** l'iframe du lecteur (overlay, pré-roll) ne sont pas bloquées : `blockedHosts` filtre les navigations, pas chaque requête. Seuls les popups et les redirections sont bloqués.
6. Le trafic LAN n'est pas chiffré (ws://) : seul un jeton protège l'accès. Ça suffit sur un Wi-Fi domestique, pas sur un réseau public.

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

Prérequis : Node ≥ 24. Pour Android : Android Studio récent (AGP 9.4) et un JDK 21.

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

## Android : navigateur GeckoView (moteur Firefox)

Le navigateur intégré Android est une **GeckoView** pilotée en natif (`android/app/src/main/java/dev/miha976/swipecast/gecko/`), ce qui donne le même niveau de contrôle qu'Electron sur PC :

| | Comment |
|---|---|
| Popups | `onLoadRequest` (cible nouvelle fenêtre) / `onNewSession` → refusées avant création ; un lien du même site touché s'ouvre dans l'onglet |
| Redirections pub | `onLoadRequest` → refusées **avant départ** si lancées par une iframe d'un autre site (`triggerUri`) ou par script sans geste ; `onSubframeLoadRequest` → tab-under dans le lecteur refusé (`NavigationPolicy.java`, testé par JUnit) |
| Pubs | **uBlock Origin**, installé depuis addons.mozilla.org au premier lancement |
| Suivi vidéo | extension intégrée `app/gecko-ext/` : `shared/tracker.js` (le même que sur PC) dans **toutes les frames**, iframe du lecteur comprise ; la reprise est demandée par chaque frame à son chargement |
| Lecture | autoplay avec le son et DRM autorisés (`PermissionDelegate`) |

- `npm run android:sync` génère l'extension (`npm run gecko:ext`) puis synchronise Capacitor.
- **Capacitor 9** (9.0.0-rc, plugins officiels en 9.0.0-alpha) : GeckoView exige `compileSdk` 37 et `androidx.core` 1.19, donc AGP 9 — la chaîne de Capacitor 9 (AGP 9.4.1, Gradle 9.8.2, SDK 37, `minSdk` 26). **Node 24** requis par le CLI Capacitor 9 ; Android Studio récent compatible AGP 9.4.
- GeckoView figé (`variables.gradle`), dépôt Maven de Mozilla (`maven.mozilla.org`) ; ABI `arm64-v8a` + `x86_64`. À monter régulièrement (correctifs de sécurité de Firefox).
- L'ancienne WebView (plugin capgo, sans version Capacitor 9) a été retirée.
- **Android 17 : accès au réseau local.** Une app qui cible l'API 37 ne joint plus le réseau local sans la permission d'exécution `ACCESS_LOCAL_NETWORK` (groupe « Appareils à proximité ») — symptôme : « PC injoignable » alors que le navigateur du téléphone joint `http://<IP>:47321/health`. Elle est déclarée dans le manifeste, demandée à l'appairage et au lancement ; en cas de refus, un bandeau propose de réessayer ou d'ouvrir les paramètres.
- `targetSdk` 37 impose l'affichage bord à bord : l'activité du navigateur applique les marges des barres système, sauf en plein écran vidéo.
- Logs : `adb logcat -s SwipeCastGecko GeckoConsole`.

## Reprise de la position

Deux mécanismes complémentaires :
1. **Paramètre d'URL** quand le site le permet (`models/siteAdapters.ts`) : YouTube `t=754s` (`start=` pour /embed), Vimeo `#t=`, Dailymotion `start=`. Le lecteur démarre nativement au bon endroit, même après une pub.
2. **Seek par le script injecté** pour tous les autres sites : réappliqué tant que le lecteur ne l'a pas « tenu » 2 s, et suspendu pendant les pubs YouTube (`.ad-showing`).

Le script est compatible **Trusted Types** (CSP de YouTube) : aucune affectation d'`innerHTML`.

## Blocage des pubs

- **Popups / tab-under** : le piège des sites de streaming est le *tab-under* (le script ouvre l'épisode dans une nouvelle fenêtre puis remplace la page par la pub avec `location.replace`, ce qui efface l'épisode de l'historique).
  - PC : Electron refuse toutes les fenêtres (`window.open` → `null`, le script abandonne), et une iframe ne peut plus remplacer la page par un autre site (`will-navigate` + `initiator`). La barre affiche « Popup bloquée · Ouvrir quand même ».
  - Android : `shared/popup-guard.js` est injecté **au début du document dans toutes les frames** (`preShowScriptInjectionTime: 'documentStart'` → `addDocumentStartJavaScript`). Il neutralise `window.open` (non réécrivable par la page) et bloque les calques `<a target=_blank>` et les liens `_top` vers d'autres sites. En dernier recours, les popups natives restantes sont ouvertes cachées puis fermées. Si la page principale change de site dans les 3 s qui suivent, on recharge l'épisode à la même position.
- **Redirections « onclick » (mobile)** : sur téléphone, des régies comme *onclicka* (vue sur anime-sama) ne font pas de popup : au premier clic sur le lecteur, elles **redirigent l'onglet** (`location.replace`, ce qui efface l'épisode de l'historique). Deux protections :
  1. le garde-fou bloque l'exécution des scripts, iframes et requêtes des régies connues (MutationObserver avant exécution pour les balises du HTML, setters `src`/`setAttribute` pour celles ajoutées par script, `fetch`/XHR/`sendBeacon`) ;
  2. **annulation avant départ** (Navigation API, événement `navigate` annulable) : dans la page principale, une navigation vers un autre site sans geste de l'utilisateur (`userInitiated`) est annulée — **la page ne bouge pas, rien n'est rechargé**, quelle que soit la régie. Non émis par Chromium si l'initiateur est une iframe d'un autre domaine, d'où :
  3. `models/NavigationGuard.ts` (filet natif) : un changement de site de la page principale n'est accepté que vers le site d'un **lien réellement touché** (`isTrusted`), vers l'URL ouverte par l'app, ou vers une page déjà visitée (retour). Sinon, l'épisode est rechargé à la même position avec le message « Redirection publicitaire bloquée ». Un clic sur un bouton ne compte pas (la régie se déclenche justement au clic sur ▶). Limite : une connexion OAuth lancée par un bouton est annulée dans le navigateur intégré.
- **Régies publicitaires** (`shared/ad-hosts.json`) : bloquées pour toutes les requêtes sur PC (`webRequest`), et pour les navigations sur Android (`blockedHosts`). La liste est à compléter au fil de l'eau.

## Compilation automatique (CI) et versions

`.github/workflows/build.yml` compile à chaque push sur `main` / `geckoview` : tests et build web, puis Android (sync Capacitor, extension GeckoView, `assembleDebug`, tests JUnit). En cas d'échec, les erreurs Gradle apparaissent en annotations ; en cas de succès, l'**APK de debug** est téléchargeable dans l'onglet *Actions* du run (artefact `swipecast-debug-apk`), installable sans Android Studio.

Pour éviter les conflits de versions :
- **versions exactes** : Capacitor (`app/package.json`, sans `^` ni tag `next`), GeckoView (`variables.gradle`), AGP et Gradle (`build.gradle`, `gradle-wrapper.properties`) ;
- installer avec **`npm ci`** (respecte `package-lock.json`), pas `npm install` ;
- une mise à jour = une seule dépendance à la fois, validée par la CI avant de toucher au poste local.

## Tests

```bash
npm test                                                          # hub : appairage, transfert en ligne/hors ligne, validation
pip install playwright && npm run build
python3 tests/e2e/test_tracker.py <dossier avec page.html + clip.webm> app/shared/tracker.js   # 13 vérifications
python3 tests/e2e/test_e2e.py                                     # appairage UI + synchro + transfert (6 vérifications)
python3 tests/e2e/test_feedback.py <dossier> app/shared/tracker.js  # Trusted Types, pubs YouTube, DOM réécrit (7 vérifications)
python3 tests/e2e/test_popup_guard.py app/shared/popup-guard.js  # onclicka, régie inconnue, calque Vidmoly, tab-under page/lecteur, liens _top (30 vérifications)
npm run test:unit                                                 # NavigationGuard (13), position dans l'URL (8), agrégation des frames (4), background GeckoView (7)
python3 tests/e2e/test_gecko_ext.py app/android/app/src/main/assets/swipecast-ext/content.js tests/e2e/range-server.mjs  # extension GeckoView multi-frames (8)
(cd app/android && ./gradlew :app:testDebugUnitTest)              # NavigationPolicy (JUnit)
```

## Limites connues (v1)

1. **Android, app tuée** : sans push, le téléphone ne reçoit rien tant que l'app est fermée. Le transfert reste en attente 2 h sur le hub et **s'affiche dès l'ouverture de l'app**. Si l'app est en arrière-plan avec la connexion encore active, la notification arrive. Solution v2 : FCM, ou un service au premier plan.
2. **DRM (Netflix, Disney+, Prime…)** : Electron standard n'inclut pas Widevine, donc ces sites ne liront pas sur PC. Il faudrait la build [castLabs ECS](https://github.com/castlabs/electron-releases) avec signature VMP. La WebView Android, elle, gère généralement Widevine.
3. **Iframes sur Android** : le plugin n'injecte que dans la frame principale. Les lecteurs embarqués en iframe cross-origin (certains sites de streaming) sont suivis sur PC (injection dans toutes les frames) mais pas sur Android. Dans ce cas, c'est l'URL de la page qui est transmise, sans la position.
4. **Même réseau requis** : en 4G ou hors de chez toi, passer par Tailscale (adresse 100.x du PC) fonctionne sans changer le code.
5. Sur Android, les pubs **affichées dans** l'iframe du lecteur (overlay, pré-roll) ne sont pas bloquées : `blockedHosts` filtre les navigations, pas chaque requête. Seuls les popups et les redirections sont bloqués.
6. Le trafic LAN n'est pas chiffré (ws://) : seul un jeton protège l'accès. Ça suffit sur un Wi-Fi domestique, pas sur un réseau public.

package dev.miha976.swipecast.gecko;

import android.content.Context;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;
import org.json.JSONObject;
import org.mozilla.geckoview.AllowOrDeny;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoRuntimeSettings;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoSessionSettings;
import org.mozilla.geckoview.WebExtension;
import org.mozilla.geckoview.WebExtensionController;

/**
 * Cœur du navigateur GeckoView (singleton, thread UI).
 *
 * - un seul GeckoRuntime par processus (contrainte GeckoView), une GeckoSession pour l'onglet ;
 * - extension intégrée « swipecast-ext » : script de suivi dans TOUTES les frames (iframes de
 *   lecteurs comprises), reprise demandée par chaque frame à son chargement ;
 * - uBlock Origin installé depuis addons.mozilla.org au premier lancement ;
 * - règles de navigation appliquées AVANT le départ (NavigationPolicy), comme sur PC.
 */
public final class GeckoHost {

    /** Côté plugin Capacitor. */
    public interface Listener {
        void onTrackerMessage(@NonNull JSONObject message);

        /** null = navigateur fermé */
        void onState(@Nullable JSONObject state);

        void onPopupBlocked(@Nullable String url);
    }

    /** Côté activité. */
    interface ActivityHooks {
        void setImmersive(boolean on);

        void finishBrowser();
    }

    private static final String TAG = "SwipeCastGecko";
    static final String NATIVE_APP = "browser";
    static final String EXT_ID = "swipecast@miha976.dev";
    static final String EXT_URI = "resource://android/assets/swipecast-ext/";
    static final String UBO_ID = "uBlock0@raymondhill.net";
    static final String UBO_URL = "https://addons.mozilla.org/firefox/downloads/latest/ublock-origin/latest.xpi";

    private static GeckoHost instance;

    public static synchronized GeckoHost get(@NonNull Context context) {
        if (instance == null) instance = new GeckoHost(context.getApplicationContext());
        return instance;
    }

    private final Context context;
    private GeckoRuntime runtime;
    private GeckoSession session;
    private WebExtension extension;
    private WebExtension.Port port;
    private final List<JSONObject> pendingCommands = new ArrayList<>();
    private Listener listener;
    private ActivityHooks activity;

    private String currentUri;
    private String title = "";
    private boolean canGoBack;
    private boolean fullscreen;

    private GeckoHost(Context context) {
        this.context = context;
    }

    public void setListener(@Nullable Listener listener) {
        this.listener = listener;
    }

    void attachActivity(ActivityHooks hooks) {
        this.activity = hooks;
    }

    void detachActivity(ActivityHooks hooks) {
        if (this.activity == hooks) this.activity = null;
    }

    // ------------------------------------------------------------------ moteur + extensions

    private GeckoRuntime runtime() {
        if (runtime != null) return runtime;
        GeckoRuntimeSettings settings = new GeckoRuntimeSettings.Builder()
            .consoleOutput(true) // console.* des pages et de l'extension → logcat
            .build();
        runtime = GeckoRuntime.create(context, settings);
        setupExtensions(runtime.getWebExtensionController());
        return runtime;
    }

    private void setupExtensions(WebExtensionController controller) {
        // Installation sans dialogue, réservée à uBlock Origin (seule extension installée depuis le réseau).
        controller.setPromptDelegate(
            new WebExtensionController.PromptDelegate() {
                @Nullable
                @Override
                public GeckoResult<WebExtension.PermissionPromptResponse> onInstallPromptRequest(
                    @NonNull WebExtension ext,
                    @NonNull String[] permissions,
                    @NonNull String[] origins,
                    @NonNull String[] dataCollectionPermissions
                ) {
                    boolean ok = UBO_ID.equals(ext.id);
                    return GeckoResult.fromValue(new WebExtension.PermissionPromptResponse(ok, false, false));
                }
            }
        );

        controller
            .ensureBuiltIn(EXT_URI, EXT_ID)
            .accept(
                ext -> {
                    extension = ext;
                    ext.setMessageDelegate(backgroundDelegate, NATIVE_APP);
                    attachContentDelegate();
                    Log.i(TAG, "extension SwipeCast prête");
                },
                e -> Log.e(TAG, "extension SwipeCast : échec d'installation", e)
            );

        controller
            .list()
            .accept(
                list -> {
                    if (list != null) for (WebExtension w : list) if (UBO_ID.equals(w.id)) return;
                    controller
                        .install(UBO_URL, null)
                        .accept(w -> Log.i(TAG, "uBlock Origin installé"), e -> Log.w(TAG, "uBlock Origin : échec d'installation", e));
                },
                e -> Log.w(TAG, "liste des extensions indisponible", e)
            );
    }

    /** Background de l'extension : canal app → extension (commandes). */
    private final WebExtension.MessageDelegate backgroundDelegate = new WebExtension.MessageDelegate() {
        @Override
        public void onConnect(@NonNull WebExtension.Port p) {
            port = p;
            p.setDelegate(portDelegate);
            for (JSONObject cmd : pendingCommands) p.postMessage(cmd);
            pendingCommands.clear();
        }
    };

    private final WebExtension.PortDelegate portDelegate = new WebExtension.PortDelegate() {
        @Override
        public void onPortMessage(@NonNull Object message, @NonNull WebExtension.Port p) {
            /* pas de message background → app pour l'instant */
        }

        @Override
        public void onDisconnect(@NonNull WebExtension.Port p) {
            if (port == p) port = null;
        }
    };

    /** Scripts de contenu (toutes les frames) : progression vidéo, swipe → app. */
    private final WebExtension.MessageDelegate contentDelegate = new WebExtension.MessageDelegate() {
        @Nullable
        @Override
        public GeckoResult<Object> onMessage(@NonNull String nativeApp, @NonNull Object message, @NonNull WebExtension.MessageSender sender) {
            if (message instanceof JSONObject && listener != null) listener.onTrackerMessage((JSONObject) message);
            return null;
        }
    };

    private void attachContentDelegate() {
        if (extension != null && session != null) {
            session.getWebExtensionController().setMessageDelegate(extension, contentDelegate, NATIVE_APP);
        }
    }

    private void sendCommand(JSONObject cmd) {
        if (port != null) port.postMessage(cmd);
        else pendingCommands.add(cmd); // le background n'est pas encore connecté
    }

    // ------------------------------------------------------------------ session

    GeckoSession ensureSession() {
        if (session != null) return session;
        GeckoSessionSettings settings = new GeckoSessionSettings.Builder().useTrackingProtection(true).build();
        session = new GeckoSession(settings);
        session.setNavigationDelegate(navigationDelegate);
        session.setContentDelegate(contentDelegateSession);
        session.setPermissionDelegate(permissionDelegate);
        session.open(runtime());
        attachContentDelegate();
        return session;
    }

    void open(@NonNull String url, @Nullable String restoreJson) {
        GeckoSession s = ensureSession();
        JSONObject restore = null;
        if (restoreJson != null) {
            try {
                restore = new JSONObject(restoreJson);
            } catch (JSONException e) {
                Log.w(TAG, "options de reprise illisibles", e);
            }
        }
        // Le background garde la reprise ; chaque frame la demande à son chargement (lecteur en iframe compris).
        sendCommand(obj("cmd", "setRestore", "restore", restore));
        if (restore != null && restore.optBoolean("fullscreen") && activity != null) activity.setImmersive(true);
        s.loadUri(url);
    }

    void pause() {
        sendCommand(obj("cmd", "pause"));
    }

    void toast(String text) {
        sendCommand(obj("cmd", "toast", "text", text));
    }

    /** @return false s'il n'y a plus d'historique (le bouton retour ferme alors le navigateur) */
    boolean handleBack() {
        if (session == null) return false;
        if (fullscreen) {
            session.exitFullScreen();
            return true;
        }
        if (canGoBack) {
            session.goBack();
            return true;
        }
        return false;
    }

    void close() {
        if (activity != null) activity.finishBrowser();
        else onBrowserClosed();
    }

    /** Appelé quand l'activité se termine : on libère l'onglet (le profil, lui, garde cookies et connexions). */
    void onBrowserClosed() {
        if (session != null) {
            session.close();
            session = null;
        }
        currentUri = null;
        title = "";
        canGoBack = false;
        fullscreen = false;
        if (listener != null) listener.onState(null);
    }

    private void emitState() {
        if (listener == null) return;
        listener.onState(obj("url", currentUri == null ? "" : currentUri, "title", title, "canGoBack", canGoBack));
    }

    private void blocked(@Nullable String url, @Nullable String toast) {
        if (listener != null) listener.onPopupBlocked(url);
        if (toast != null) toast(toast);
    }

    // ------------------------------------------------------------------ délégués GeckoView

    private final GeckoSession.NavigationDelegate navigationDelegate = new GeckoSession.NavigationDelegate() {
        @Override
        public void onLocationChange(
            @NonNull GeckoSession s,
            @Nullable String url,
            @NonNull List<GeckoSession.PermissionDelegate.ContentPermission> perms,
            @NonNull Boolean hasUserGesture
        ) {
            currentUri = url;
            emitState();
        }

        @Override
        public void onCanGoBack(@NonNull GeckoSession s, boolean value) {
            canGoBack = value;
            emitState();
        }

        @Nullable
        @Override
        public GeckoResult<AllowOrDeny> onLoadRequest(@NonNull GeckoSession s, @NonNull LoadRequest r) {
            if (r.target == TARGET_WINDOW_NEW) {
                // Jamais de nouvelle fenêtre (popups pub). Un lien du même site touché s'ouvre ici.
                if (NavigationPolicy.openNewWindowInCurrentTab(r.uri, r.triggerUri, currentUri, r.hasUserGesture)) {
                    s.loadUri(r.uri);
                } else {
                    blocked(r.uri, "🚫 Popup publicitaire bloquée");
                }
                return GeckoResult.deny();
            }
            boolean ok = NavigationPolicy.allowTopLevel(
                r.uri,
                r.triggerUri,
                currentUri,
                r.isRedirect,
                r.hasUserGesture,
                r.isDirectNavigation
            );
            if (!ok) {
                Log.i(TAG, "redirection annulée : " + r.uri + " (depuis " + r.triggerUri + ")");
                blocked(null, "🚫 Redirection publicitaire bloquée");
            }
            return ok ? GeckoResult.allow() : GeckoResult.deny();
        }

        @Nullable
        @Override
        public GeckoResult<AllowOrDeny> onSubframeLoadRequest(@NonNull GeckoSession s, @NonNull LoadRequest r) {
            boolean ok = NavigationPolicy.allowSubframe(r.uri, r.triggerUri, currentUri, r.isRedirect, r.hasUserGesture);
            if (!ok) {
                Log.i(TAG, "navigation du lecteur annulée : " + r.uri + " (depuis " + r.triggerUri + ")");
                blocked(null, "🚫 Redirection publicitaire bloquée");
            }
            return ok ? GeckoResult.allow() : GeckoResult.deny();
        }

        @Nullable
        @Override
        public GeckoResult<GeckoSession> onNewSession(@NonNull GeckoSession s, @NonNull String uri) {
            blocked(uri, null); // window.open sans URL, etc. : refusé (null = la page reçoit null)
            return null;
        }
    };

    private final GeckoSession.ContentDelegate contentDelegateSession = new GeckoSession.ContentDelegate() {
        @Override
        public void onTitleChange(@NonNull GeckoSession s, @Nullable String t) {
            title = t == null ? "" : t;
            emitState();
        }

        @Override
        public void onFullScreen(@NonNull GeckoSession s, boolean full) {
            fullscreen = full;
            if (activity != null) activity.setImmersive(full);
        }

        @Override
        public void onCloseRequest(@NonNull GeckoSession s) {
            close();
        }
    };

    /** Lecture automatique avec le son et DRM autorisés (c'est un navigateur dédié à la vidéo). */
    private final GeckoSession.PermissionDelegate permissionDelegate = new GeckoSession.PermissionDelegate() {
        @Nullable
        @Override
        public GeckoResult<Integer> onContentPermissionRequest(@NonNull GeckoSession s, @NonNull ContentPermission perm) {
            switch (perm.permission) {
                case PERMISSION_AUTOPLAY_AUDIBLE:
                case PERMISSION_AUTOPLAY_INAUDIBLE:
                case PERMISSION_MEDIA_KEY_SYSTEM_ACCESS:
                    return GeckoResult.fromValue(ContentPermission.VALUE_ALLOW);
                default:
                    return null;
            }
        }
    };

    // ------------------------------------------------------------------ utilitaires

    /** obj("a", 1, "b", "x") → {"a":1,"b":"x"} */
    static JSONObject obj(Object... kv) {
        JSONObject o = new JSONObject();
        try {
            for (int i = 0; i + 1 < kv.length; i += 2) o.put(String.valueOf(kv[i]), kv[i + 1] == null ? JSONObject.NULL : kv[i + 1]);
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
        return o;
    }
}

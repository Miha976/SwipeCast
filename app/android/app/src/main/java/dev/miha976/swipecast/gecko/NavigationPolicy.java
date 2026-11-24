package dev.miha976.swipecast.gecko;

import java.net.URI;
import java.util.Locale;

/**
 * Règles de navigation du navigateur GeckoView, appliquées AVANT le départ
 * (GeckoSession.NavigationDelegate.onLoadRequest / onSubframeLoadRequest).
 *
 * Même logique que le PC (Electron, will-navigate + initiator) grâce à LoadRequest.triggerUri,
 * la page à l'origine de la navigation — information que la WebView Android ne donne pas.
 *
 * Classe pure (aucune dépendance Android/GeckoView) : testée par NavigationPolicyTest.
 */
public final class NavigationPolicy {

    private NavigationPolicy() {}

    /** "www.anime-sama.to" → "anime-sama.to" (2 derniers labels, 3 pour co.uk & co). */
    static String baseDomain(String host) {
        if (host == null) return null;
        String[] p = host.toLowerCase(Locale.ROOT).replaceAll("\\.$", "").split("\\.");
        if (p.length <= 2) return String.join(".", p);
        boolean twoLevel = p[p.length - 2].matches("co|com|org|net|gov|ac|edu");
        int n = twoLevel ? 3 : 2;
        StringBuilder sb = new StringBuilder();
        for (int i = p.length - n; i < p.length; i++) {
            if (sb.length() > 0) sb.append('.');
            sb.append(p[i]);
        }
        return sb.toString();
    }

    /** Site (domaine de base) d'une URL http(s), sinon null. */
    static String siteOf(String uri) {
        if (uri == null) return null;
        try {
            URI u = new URI(uri);
            String scheme = u.getScheme();
            if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) return null;
            return baseDomain(u.getHost());
        } catch (Exception e) {
            return null;
        }
    }

    static boolean sameSite(String a, String b) {
        String sa = siteOf(a);
        String sb = siteOf(b);
        return sa != null && sa.equals(sb);
    }

    /**
     * Navigation de la page principale (dans l'onglet courant).
     *
     * @param uri          destination
     * @param triggerUri   page à l'origine (null pour un chargement initial ou depuis data:)
     * @param currentUri   page actuellement affichée
     */
    public static boolean allowTopLevel(
        String uri,
        String triggerUri,
        String currentUri,
        boolean isRedirect,
        boolean hasUserGesture,
        boolean isDirectNavigation
    ) {
        if (isDirectNavigation || isRedirect) return true; // ouverture par l'app / redirection HTTP
        String dest = siteOf(uri);
        String cur = siteOf(currentUri);
        if (dest == null || cur == null) return true; // about:, premier chargement…
        if (dest.equals(cur)) return true; // navigation interne au site
        String trig = siteOf(triggerUri);
        if (trig == null) return true;
        // Lancée par une iframe d'un autre site (calque invisible du lecteur → top.location = pub)
        if (!trig.equals(cur)) return false;
        // Lancée par la page elle-même : seulement après un geste (lien touché). Sinon redirection par script.
        return hasUserGesture;
    }

    /**
     * Navigation d'une iframe.
     *
     * @param topUri page principale
     */
    public static boolean allowSubframe(String uri, String triggerUri, String topUri, boolean isRedirect, boolean hasUserGesture) {
        if (isRedirect) return true;
        String dest = siteOf(uri);
        String trig = siteOf(triggerUri);
        String top = siteOf(topUri);
        if (dest == null || trig == null || top == null) return true;
        if (trig.equals(top)) return true; // la page change la source du lecteur (épisode suivant…)
        if (dest.equals(trig)) return true; // navigation interne au lecteur
        // Une iframe tierce qui part elle-même vers un autre site juste après un tap = tab-under dans le lecteur.
        // Sans geste (redirection au chargement d'un lecteur), on laisse passer.
        return !hasUserGesture;
    }

    /**
     * Lien target=_blank / window.open : jamais de nouvelle fenêtre.
     * @return true si le lien doit s'ouvrir dans l'onglet courant (lien du même site touché par l'utilisateur).
     */
    public static boolean openNewWindowInCurrentTab(String uri, String triggerUri, String currentUri, boolean hasUserGesture) {
        return hasUserGesture && sameSite(uri, currentUri) && sameSite(triggerUri, currentUri);
    }
}

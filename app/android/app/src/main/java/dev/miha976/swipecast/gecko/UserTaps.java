package dev.miha976.swipecast.gecko;

import java.util.ArrayDeque;
import java.util.Iterator;

/**
 * Taps réels sur des liens, signalés par l'extension depuis la page principale (gecko-ext/link-guard.js,
 * event.isTrusted). Ils remplacent LoadRequest.hasUserGesture, que GeckoView ne fournit pas de façon fiable :
 * pour une navigation vers un autre site (changement de processus) ou une nouvelle fenêtre, il est lu
 * hors de la page et vaut faux même après un vrai tap.
 *
 * Classe pure (sans Android) : testée par UserTapsTest.
 */
final class UserTaps {

    /** Durée de validité d'un tap : la navigation part dans la foulée. */
    static final long TTL_MS = 3000;

    private static final class Tap {
        final String url, page;
        final long at;

        Tap(String url, String page, long at) {
            this.url = url;
            this.page = page;
            this.at = at;
        }
    }

    private final ArrayDeque<Tap> taps = new ArrayDeque<>();

    void record(String url, String page, long now) {
        if (NavigationPolicy.siteOf(url) == null) return;
        taps.addLast(new Tap(url, page, now));
        while (taps.size() > 8) taps.removeFirst();
    }

    /**
     * Un tap récent justifie-t-il cette navigation ? (consommé s'il correspond)
     * Même site de destination que le lien touché (une redirection interne du site cible reste couverte),
     * et tap fait sur la page actuellement affichée.
     */
    boolean consume(String uri, String currentUri, long now) {
        String dest = NavigationPolicy.siteOf(uri);
        if (dest == null) return false;
        for (Iterator<Tap> it = taps.iterator(); it.hasNext(); ) {
            Tap t = it.next();
            if (now - t.at > TTL_MS) {
                it.remove();
                continue;
            }
            if (dest.equals(NavigationPolicy.siteOf(t.url)) && NavigationPolicy.sameSite(t.page, currentUri)) {
                it.remove();
                return true;
            }
        }
        return false;
    }
}

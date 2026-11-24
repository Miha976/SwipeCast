package dev.miha976.swipecast.gecko;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** ./gradlew :app:testDebugUnitTest — scénarios observés sur anime-sama (novembre 2026). */
public class NavigationPolicyTest {

    static final String EP = "https://anime-sama.to/catalogue/firefly-wedding/saison1/vostfr/";
    static final String CADRE = "https://anime-sama.to/pub/cadre-onclicka.html?z=6155200";
    static final String VIDMOLY = "https://ansembed.net/embed-haf9np8eirma.html";
    static final String CASINO = "https://centrimpor.com/contato/";

    @Test
    public void baseDomain() {
        assertEquals("anime-sama.to", NavigationPolicy.baseDomain("www.anime-sama.to"));
        assertEquals("bbc.co.uk", NavigationPolicy.baseDomain("news.bbc.co.uk"));
        assertEquals("localhost", NavigationPolicy.baseDomain("localhost"));
    }

    @Test
    public void topLevel() {
        // plan B du calque Vidmoly : top.location = pub depuis l'iframe du lecteur (avec geste)
        assertFalse(NavigationPolicy.allowTopLevel(CASINO, VIDMOLY, EP, false, true, false));
        // redirection par script de la page, sans geste
        assertFalse(NavigationPolicy.allowTopLevel(CASINO, EP, EP, false, false, false));
        // lien externe touché dans la page
        assertTrue(NavigationPolicy.allowTopLevel("https://youtube.com/watch?v=a", EP, EP, false, true, false));
        // navigation interne, ouverture par l'app, redirection HTTP, premier chargement
        assertTrue(NavigationPolicy.allowTopLevel("https://anime-sama.to/catalogue/", EP, EP, false, false, false));
        assertTrue(NavigationPolicy.allowTopLevel(CASINO, null, EP, false, false, true));
        assertTrue(NavigationPolicy.allowTopLevel("https://m.youtube.com/", "https://youtube.com/", "https://youtube.com/", true, false, false));
        assertTrue(NavigationPolicy.allowTopLevel(EP, null, null, false, false, false));
    }

    @Test
    public void subframe() {
        // tab-under dans le lecteur : l'iframe Vidmoly part sur la pub juste après un tap
        assertFalse(NavigationPolicy.allowSubframe(CASINO, VIDMOLY, EP, false, true));
        // la page change la source du lecteur (épisode suivant)
        assertTrue(NavigationPolicy.allowSubframe("https://voe.sx/e/abc", EP, EP, false, true));
        // le lecteur se redirige vers son CDN au chargement (sans geste)
        assertTrue(NavigationPolicy.allowSubframe("https://vidmoly.net/x", VIDMOLY, EP, false, false));
        // navigation interne au lecteur
        assertTrue(NavigationPolicy.allowSubframe("https://ansembed.net/embed-2", VIDMOLY, EP, false, true));
        // cadre de pub d'anime-sama (même site que la page) : laissé à uBlock Origin
        assertTrue(NavigationPolicy.allowSubframe("https://onclckmn.com/x", CADRE, EP, false, false));
    }

    @Test
    public void newWindow() {
        assertTrue(NavigationPolicy.openNewWindowInCurrentTab("https://anime-sama.to/planning", EP, EP, true));
        assertFalse(NavigationPolicy.openNewWindowInCurrentTab(CASINO, VIDMOLY, EP, true));
        assertFalse(NavigationPolicy.openNewWindowInCurrentTab("https://anime-sama.to/planning", EP, EP, false));
    }

    static final String BRAVE = "https://search.brave.com/search?q=firefly+wedding";

    @Test
    public void resultatDeRechercheOuvertDansLOnglet() {
        // Brave Search ouvre ses résultats en target=_blank : un résultat touché s'ouvre ici.
        assertTrue(NavigationPolicy.openNewWindowInCurrentTab(EP, BRAVE, BRAVE, true));
        assertTrue(NavigationPolicy.openNewWindowInCurrentTab(EP, "https://www.google.fr/search?q=x", "https://www.google.fr/search?q=x", true));
        // GeckoView ne transmet pas le geste pour une nouvelle fenêtre : sur un moteur, ouvert quand même
        assertTrue(NavigationPolicy.openNewWindowInCurrentTab(EP, BRAVE, BRAVE, false));
        // origine inconnue (triggerUri absent) sur un moteur : page elle-même
        assertTrue(NavigationPolicy.openNewWindowInCurrentTab(EP, null, BRAVE, false));
        // lancé par une iframe tierce dans la page de résultats : bloqué
        assertFalse(NavigationPolicy.openNewWindowInCurrentTab(CASINO, VIDMOLY, BRAVE, true));
        // pas de schéma exotique
        assertFalse(NavigationPolicy.openNewWindowInCurrentTab("intent://x#Intent;end", BRAVE, BRAVE, true));
        // sur un site de streaming, un popup vers un autre site reste bloqué
        assertFalse(NavigationPolicy.openNewWindowInCurrentTab(CASINO, EP, EP, true));
    }

    @Test
    public void moteursDeRecherche() {
        assertTrue(NavigationPolicy.isSearchEngine(BRAVE));
        assertTrue(NavigationPolicy.isSearchEngine("https://duckduckgo.com/?q=x"));
        assertTrue(NavigationPolicy.isSearchEngine("https://www.google.co.uk/search?q=x"));
        assertFalse(NavigationPolicy.isSearchEngine("https://brave.com/"));
        assertFalse(NavigationPolicy.isSearchEngine("https://www.google.evil.com/"));
        assertFalse(NavigationPolicy.isSearchEngine(EP));
    }
}

package dev.miha976.swipecast.gecko;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class UserTapsTest {

    static final String BRAVE = "https://search.brave.com/search?q=h";
    static final String WIKI = "https://fr.wikipedia.org/wiki/H_(lettre)";

    @Test
    public void tapSurResultatAutoriseLaNavigation() {
        UserTaps t = new UserTaps();
        t.record(WIKI, BRAVE, 1000);
        assertTrue(t.consume(WIKI, BRAVE, 1200));
        assertFalse("consommé une seule fois", t.consume(WIKI, BRAVE, 1300));
    }

    @Test
    public void redirectionInterneDuSiteCibleCouverte() {
        UserTaps t = new UserTaps();
        t.record("https://fr.wikipedia.org/wiki/H", BRAVE, 0);
        assertTrue(t.consume("https://fr.m.wikipedia.org/wiki/H", BRAVE, 100));
    }

    @Test
    public void refus() {
        UserTaps t = new UserTaps();
        t.record(WIKI, BRAVE, 0);
        assertFalse("autre destination (script pub)", t.consume("https://casino.example/", BRAVE, 100));
        assertFalse("tap trop ancien", t.consume(WIKI, BRAVE, UserTaps.TTL_MS + 1));
        t.record(WIKI, BRAVE, 10_000);
        assertFalse("tap fait sur une autre page", t.consume(WIKI, "https://anime-sama.to/", 10_100));
        t.record("intent://x#Intent;end", BRAVE, 20_000);
        assertFalse(t.consume("intent://x#Intent;end", BRAVE, 20_100));
    }
}

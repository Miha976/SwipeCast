package dev.miha976.swipecast.discovery;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** ./gradlew :app:testDebugUnitTest — calcul des adresses à scanner. */
public class HubDiscoveryTest {

    private static int ip(String s) {
        String[] p = s.split("\\.");
        return HubDiscovery.toInt(new byte[] {
            (byte) Integer.parseInt(p[0]), (byte) Integer.parseInt(p[1]), (byte) Integer.parseInt(p[2]), (byte) Integer.parseInt(p[3]) });
    }

    @Test
    public void conversions() {
        assertEquals("192.168.43.1", HubDiscovery.fromInt(ip("192.168.43.1")));
        assertEquals("10.0.0.255", HubDiscovery.fromInt(ip("10.0.0.255")));
    }

    @Test
    public void slash24SansReseauDiffusionNiSoiMeme() {
        int[] h = HubDiscovery.hostsAround(ip("192.168.43.1"), 24); // téléphone = point d'accès du partage
        assertEquals(253, h.length);
        assertEquals("192.168.43.2", HubDiscovery.fromInt(h[0]));
        assertEquals("192.168.43.254", HubDiscovery.fromInt(h[h.length - 1]));
        for (int x : h) {
            assertFalse(x == ip("192.168.43.1"));
            assertFalse(x == ip("192.168.43.0"));
            assertFalse(x == ip("192.168.43.255"));
        }
    }

    @Test
    public void grandReseauLimiteAuSlash24DuTelephone() {
        int[] h = HubDiscovery.hostsAround(ip("10.20.30.40"), 16);
        assertEquals(253, h.length);
        assertEquals("10.20.30.1", HubDiscovery.fromInt(h[0]));
        assertEquals("10.20.30.254", HubDiscovery.fromInt(h[h.length - 1]));
    }

    @Test
    public void petitsReseaux() {
        assertEquals(5, HubDiscovery.hostsAround(ip("192.168.1.2"), 29).length); // 8 - réseau - diffusion - soi
        assertEquals(0, HubDiscovery.hostsAround(ip("192.168.1.2"), 31).length);
        assertEquals(0, HubDiscovery.hostsAround(ip("192.168.1.2"), 32).length);
    }

    @Test
    public void interfacesIgnorees() {
        assertTrue(HubDiscovery.isSkipped("rmnet_data0"));
        assertTrue(HubDiscovery.isSkipped("tun0"));
        assertTrue(HubDiscovery.isSkipped("v4-rmnet_data0"));
        assertFalse(HubDiscovery.isSkipped("wlan0"));
        assertFalse(HubDiscovery.isSkipped("ap0"));
        assertFalse(HubDiscovery.isSkipped("swlan0"));
    }
}

package dev.miha976.swipecast.discovery;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.Build;
import android.util.Log;
import androidx.annotation.NonNull;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * Retrouve les hubs SwipeCast (le PC) sur le réseau local, sans saisir d'adresse.
 *
 * Deux sources en parallèle, chaque candidat étant confirmé par GET /health (qui donne l'identité du hub) :
 *  1. mDNS / DNS-SD : le hub annonce « _swipecast._tcp » (NsdManager, service système d'Android).
 *  2. Scan du sous-réseau : /health sur chaque adresse du /24 du téléphone. Utile quand le multicast est
 *     filtré (pare-feu Windows en profil « Public », isolation client de certaines box, partage de connexion).
 *
 * Nécessite l'accès au réseau local (ACCESS_LOCAL_NETWORK sous Android 17), demandé avant par l'app.
 */
public final class HubDiscovery {

    private static final String TAG = "SwipeCastDiscovery";
    static final String SERVICE_TYPE = "_swipecast._tcp";
    private static final int PROBE_TIMEOUT_MS = 800;
    /** Noms d'interfaces jamais scannées : données mobiles, VPN, interfaces internes. */
    private static final String[] SKIPPED_INTERFACES = { "rmnet", "ccmni", "pdp", "v4-", "clat", "dummy", "tun", "ppp", "ipsec", "p2p", "lo" };

    public static final class Hub {
        public final String id, name, host, via;
        public final int port;

        Hub(String id, String name, String host, int port, String via) {
            this.id = id;
            this.name = name;
            this.host = host;
            this.port = port;
            this.via = via;
        }
    }

    public interface Listener {
        void onFound(@NonNull Hub hub);
    }

    private final Context context;
    private final int port;
    private final Listener listener;
    private final ConcurrentHashMap<String, Hub> found = new ConcurrentHashMap<>();
    private final Set<String> probed = ConcurrentHashMap.newKeySet();
    private final ExecutorService probes = Executors.newFixedThreadPool(48);
    /**
     * Exécuteur des rappels NsdManager : exécution directe, JAMAIS arrêté. La désinscription des
     * rappels est asynchrone ; Android y livre encore des événements après la fin de la recherche.
     * Un exécuteur arrêté les rejetterait (RejectedExecutionException sur un thread système →
     * fermeture de l'app). Les rappels ne font que soumettre une sonde : rien de bloquant.
     */
    private static final Executor NSD_CALLBACKS = Runnable::run;
    private volatile boolean finished;

    public HubDiscovery(@NonNull Context context, int port, @NonNull Listener listener) {
        this.context = context.getApplicationContext();
        this.port = port;
        this.listener = listener;
    }

    /** Bloquant (thread d'arrière-plan) : cherche pendant timeoutMs, puis renvoie les hubs trouvés. */
    @NonNull
    public List<Hub> run(long timeoutMs) {
        Nsd nsd = new Nsd();
        nsd.start();
        for (String host : localSubnetHosts()) probeAsync(host, port, "scan");
        try {
            Thread.sleep(timeoutMs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        finished = true;
        nsd.stop();
        probes.shutdownNow();
        return new ArrayList<>(found.values());
    }

    // ------------------------------------------------------------------ confirmation par /health

    private void probeAsync(String host, int p, String via) {
        if (finished || !probed.add(host + ":" + p)) return;
        try {
            probes.execute(() -> probe(host, p, via));
        } catch (RuntimeException ignored) {
            // pool arrêté : la recherche est terminée
        }
    }

    private void probe(String host, int p, String via) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL("http://" + host + ":" + p + "/health").openConnection();
            c.setConnectTimeout(PROBE_TIMEOUT_MS);
            c.setReadTimeout(PROBE_TIMEOUT_MS);
            c.setUseCaches(false);
            if (c.getResponseCode() != 200) return;
            JSONObject o = new JSONObject(readSmall(c.getInputStream()));
            String id = o.optString("id", "");
            if (!"swipecast".equals(o.optString("app")) || id.isEmpty()) return;
            Hub hub = new Hub(id, o.optString("name", host), host, p, via);
            if (!finished && found.putIfAbsent(id, hub) == null) listener.onFound(hub);
        } catch (Exception ignored) {
            // adresse sans hub : cas normal du scan
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static String readSmall(InputStream in) throws java.io.IOException {
        try (InputStream s = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[1024];
            int n;
            while ((n = s.read(buf)) > 0 && out.size() < 8192) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }

    // ------------------------------------------------------------------ mDNS (NsdManager)

    private final class Nsd {
        private final NsdManager manager = (NsdManager) context.getSystemService(Context.NSD_SERVICE);
        private final List<Object> infoCallbacks = Collections.synchronizedList(new ArrayList<>());
        /** Avant Android 14 : une seule résolution à la fois (sinon FAILURE_ALREADY_ACTIVE). */
        private final ArrayDeque<NsdServiceInfo> resolveQueue = new ArrayDeque<>();
        private boolean resolving;
        private boolean started;

        private final NsdManager.DiscoveryListener discovery = new NsdManager.DiscoveryListener() {
            @Override public void onDiscoveryStarted(String type) { started = true; }
            @Override public void onDiscoveryStopped(String type) {}
            @Override public void onStartDiscoveryFailed(String type, int code) { Log.w(TAG, "mDNS : démarrage impossible (" + code + ")"); }
            @Override public void onStopDiscoveryFailed(String type, int code) {}
            @Override public void onServiceLost(NsdServiceInfo info) {}
            @Override public void onServiceFound(NsdServiceInfo info) { resolve(info); }
        };

        void start() {
            if (manager == null) return;
            try {
                manager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discovery);
            } catch (RuntimeException e) {
                Log.w(TAG, "mDNS indisponible", e);
            }
        }

        void stop() {
            if (manager == null) return;
            try {
                manager.stopServiceDiscovery(discovery);
            } catch (RuntimeException ignored) {
                // découverte jamais démarrée
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                synchronized (infoCallbacks) {
                    for (Object cb : infoCallbacks) unregister((NsdManager.ServiceInfoCallback) cb);
                    infoCallbacks.clear();
                }
            }
        }

        private void resolve(NsdServiceInfo info) {
            if (finished) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) resolveModern(info);
            else enqueueLegacy(info);
        }

        @androidx.annotation.RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
        private void resolveModern(NsdServiceInfo info) {
            NsdManager.ServiceInfoCallback cb = new NsdManager.ServiceInfoCallback() {
                @Override public void onServiceInfoCallbackRegistrationFailed(int code) {}
                @Override public void onServiceLost() {}
                @Override public void onServiceInfoCallbackUnregistered() {}
                @Override public void onServiceUpdated(@NonNull NsdServiceInfo resolved) {
                    try {
                        for (InetAddress a : resolved.getHostAddresses()) {
                            if (a instanceof Inet4Address) probeAsync(a.getHostAddress(), resolved.getPort(), "mdns");
                        }
                    } catch (RuntimeException e) {
                        Log.w(TAG, "mDNS : service illisible", e); // rappel système : ne jamais laisser remonter
                    }
                }
            };
            try {
                manager.registerServiceInfoCallback(info, NSD_CALLBACKS, cb);
                infoCallbacks.add(cb);
            } catch (RuntimeException e) {
                Log.w(TAG, "mDNS : résolution impossible", e);
            }
        }

        @androidx.annotation.RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
        private void unregister(NsdManager.ServiceInfoCallback cb) {
            try {
                manager.unregisterServiceInfoCallback(cb);
            } catch (RuntimeException ignored) {
                // déjà désinscrit
            }
        }

        private synchronized void enqueueLegacy(NsdServiceInfo info) {
            resolveQueue.add(info);
            if (!resolving) nextLegacy();
        }

        @SuppressWarnings("deprecation")
        private synchronized void nextLegacy() {
            NsdServiceInfo info = resolveQueue.poll();
            resolving = info != null && !finished;
            if (!resolving) return;
            try {
                manager.resolveService(info, new NsdManager.ResolveListener() {
                    @Override public void onResolveFailed(NsdServiceInfo s, int code) { nextLegacy(); }
                    @Override public void onServiceResolved(NsdServiceInfo s) {
                        try {
                            InetAddress a = s.getHost();
                            if (a instanceof Inet4Address) probeAsync(a.getHostAddress(), s.getPort(), "mdns");
                        } catch (RuntimeException e) {
                            Log.w(TAG, "mDNS : service illisible", e);
                        }
                        nextLegacy();
                    }
                });
            } catch (RuntimeException e) {
                resolving = false;
            }
        }
    }

    // ------------------------------------------------------------------ sous-réseau

    /** Adresses à sonder sur les réseaux locaux du téléphone (Wi-Fi, partage de connexion, USB). */
    @NonNull
    static List<String> localSubnetHosts() {
        List<String> hosts = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback() || ni.isVirtual() || isSkipped(ni.getName())) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    InetAddress a = ia.getAddress();
                    if (!(a instanceof Inet4Address) || !a.isSiteLocalAddress()) continue;
                    for (int h : hostsAround(toInt(a.getAddress()), ia.getNetworkPrefixLength())) {
                        String s = fromInt(h);
                        if (!hosts.contains(s)) hosts.add(s);
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "interfaces réseau illisibles", e);
        }
        return hosts;
    }

    static boolean isSkipped(String name) {
        if (name == null) return true;
        for (String p : SKIPPED_INTERFACES) if (name.startsWith(p)) return true;
        return false;
    }

    /**
     * Hôtes du sous-réseau de `self`, limité à un /24 au plus (un /16 ferait 65 000 requêtes),
     * sans l'adresse réseau, la diffusion ni le téléphone lui-même.
     */
    static int[] hostsAround(int self, int prefix) {
        if (prefix < 0 || prefix > 30) return new int[0];
        int effective = Math.max(prefix, 24);
        int mask = effective == 0 ? 0 : 0xFFFFFFFF << (32 - effective);
        int network = self & mask;
        int size = 1 << (32 - effective);
        int[] out = new int[size - 3 > 0 ? size - 3 : 0];
        int k = 0;
        for (int i = 1; i < size - 1; i++) {
            int h = network + i;
            if (h != self && k < out.length) out[k++] = h;
        }
        return k == out.length ? out : java.util.Arrays.copyOf(out, k);
    }

    static int toInt(byte[] b) {
        return ((b[0] & 0xFF) << 24) | ((b[1] & 0xFF) << 16) | ((b[2] & 0xFF) << 8) | (b[3] & 0xFF);
    }

    static String fromInt(int v) {
        return ((v >>> 24) & 0xFF) + "." + ((v >>> 16) & 0xFF) + "." + ((v >>> 8) & 0xFF) + "." + (v & 0xFF);
    }
}

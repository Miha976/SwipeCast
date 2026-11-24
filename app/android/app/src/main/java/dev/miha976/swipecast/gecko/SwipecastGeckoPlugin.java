package dev.miha976.swipecast.gecko;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PermissionState;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import dev.miha976.swipecast.discovery.HubDiscovery;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Pont Capacitor ↔ navigateur GeckoView (utilisé par src/services/browser/GeckoBrowserService.ts).
 *
 * Méthodes : open({url, restore?}), close(), back(), pause(), toast({text})
 *           checkLocalNetwork(), requestLocalNetwork(), openAppSettings(), discover({port?, timeoutMs?})
 * Événements : message (état du script de suivi d'une frame), state ({url,title,canGoBack} | {closed:true}),
 *              popupBlocked ({url?}), hubFound ({id,name,host,port,via}) pendant discover()
 *
 * Réseau local (Android 17) : une app qui cible l'API 37 n'accède plus au réseau local sans la
 * permission d'exécution ACCESS_LOCAL_NETWORK (groupe « Appareils à proximité »). Sans elle, le hub
 * du PC est injoignable alors que le navigateur, lui, y arrive. Sous Android 16 et avant, la
 * permission n'existe pas et l'accès est implicite : on répond « granted ».
 */
@CapacitorPlugin(
    name = "SwipecastGecko",
    permissions = { @Permission(alias = SwipecastGeckoPlugin.LOCAL_NETWORK, strings = { SwipecastGeckoPlugin.ACCESS_LOCAL_NETWORK }) }
)
public class SwipecastGeckoPlugin extends Plugin implements GeckoHost.Listener {

    private static final String TAG = "SwipeCastGecko";
    static final String LOCAL_NETWORK = "localNetwork";
    /** Manifest.permission.ACCESS_LOCAL_NETWORK (API 37), en chaîne pour rester lisible sur les SDK plus anciens. */
    static final String ACCESS_LOCAL_NETWORK = "android.permission.ACCESS_LOCAL_NETWORK";
    private static final int API_ANDROID_17 = 37;

    private GeckoHost host() {
        return GeckoHost.get(getContext());
    }

    @Override
    public void load() {
        host().setListener(this);
    }

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) {
            call.reject("URL http(s) attendue");
            return;
        }
        JSObject restore = call.getObject("restore");
        Intent intent = new Intent(getContext(), GeckoBrowserActivity.class)
            .putExtra(GeckoBrowserActivity.EXTRA_URL, url)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (restore != null) intent.putExtra(GeckoBrowserActivity.EXTRA_RESTORE, restore.toString());
        getActivity().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void close(PluginCall call) {
        getActivity().runOnUiThread(() -> host().close());
        call.resolve();
    }

    @PluginMethod
    public void back(PluginCall call) {
        getActivity().runOnUiThread(() -> host().handleBack());
        call.resolve();
    }

    @PluginMethod
    public void pause(PluginCall call) {
        getActivity().runOnUiThread(() -> host().pause());
        call.resolve();
    }

    @PluginMethod
    public void toast(PluginCall call) {
        String text = call.getString("text", "");
        getActivity().runOnUiThread(() -> host().toast(text));
        call.resolve();
    }

    // ------------------------------------------------------------------ réseau local (Android 17)

    private static boolean localNetworkPermissionExists() {
        return Build.VERSION.SDK_INT >= API_ANDROID_17;
    }

    /** granted | prompt | prompt-with-rationale | denied (denied = Android ne reproposera plus la demande). */
    private void resolveLocalNetwork(PluginCall call) {
        JSObject r = new JSObject();
        r.put("state", localNetworkPermissionExists() ? getPermissionState(LOCAL_NETWORK).toString() : "granted");
        call.resolve(r);
    }

    @PluginMethod
    public void checkLocalNetwork(PluginCall call) {
        resolveLocalNetwork(call);
    }

    @PluginMethod
    public void requestLocalNetwork(PluginCall call) {
        if (!localNetworkPermissionExists() || getPermissionState(LOCAL_NETWORK) == PermissionState.GRANTED) {
            resolveLocalNetwork(call);
            return;
        }
        requestPermissionForAlias(LOCAL_NETWORK, call, "localNetworkResult");
    }

    @PermissionCallback
    private void localNetworkResult(PluginCall call) {
        resolveLocalNetwork(call);
    }

    /** Fiche de l'app dans les paramètres Android (après un refus définitif). */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    // ------------------------------------------------------------------ découverte du PC

    private final AtomicBoolean discovering = new AtomicBoolean(false);

    /**
     * Cherche les hubs du réseau local (mDNS + scan du /24) pendant timeoutMs.
     * Émet « hubFound » dès qu'un hub répond, puis résout avec la liste complète.
     */
    @PluginMethod
    public void discover(PluginCall call) {
        if (!discovering.compareAndSet(false, true)) {
            call.reject("Recherche déjà en cours", "BUSY");
            return;
        }
        int port = call.getInt("port", 47321);
        long timeout = Math.max(500, Math.min(10_000, call.getInt("timeoutMs", 3000)));
        new Thread(() -> {
            try {
                List<HubDiscovery.Hub> hubs = new HubDiscovery(getContext(), port, hub -> notifyListeners("hubFound", toJs(hub))).run(timeout);
                JSArray arr = new JSArray();
                for (HubDiscovery.Hub h : hubs) arr.put(toJs(h));
                JSObject r = new JSObject();
                r.put("hubs", arr);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Recherche impossible : " + e.getMessage());
            } finally {
                discovering.set(false);
            }
        }, "swipecast-discovery").start();
    }

    private static JSObject toJs(HubDiscovery.Hub h) {
        JSObject o = new JSObject();
        o.put("id", h.id);
        o.put("name", h.name);
        o.put("host", h.host);
        o.put("port", h.port);
        o.put("via", h.via);
        return o;
    }

    // ------------------------------------------------------------------ GeckoHost.Listener

    @Override
    public void onTrackerMessage(@NonNull JSONObject message) {
        JSObject js = toJs(message);
        if (js != null) notifyListeners("message", js);
    }

    @Override
    public void onState(@Nullable JSONObject state) {
        if (state == null) {
            JSObject closed = new JSObject();
            closed.put("closed", true);
            notifyListeners("state", closed);
            return;
        }
        JSObject js = toJs(state);
        if (js != null) notifyListeners("state", js);
    }

    @Override
    public void onPopupBlocked(@Nullable String url) {
        JSObject js = new JSObject();
        if (url != null) js.put("url", url);
        notifyListeners("popupBlocked", js);
    }

    @Nullable
    private static JSObject toJs(JSONObject o) {
        try {
            return new JSObject(o.toString());
        } catch (JSONException e) {
            Log.w(TAG, "message illisible", e);
            return null;
        }
    }
}

package dev.miha976.swipecast.gecko;

import android.content.Intent;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Pont Capacitor ↔ navigateur GeckoView (utilisé par src/services/browser/GeckoBrowserService.ts).
 *
 * Méthodes : open({url, restore?}), close(), back(), pause(), toast({text})
 * Événements : message (état du script de suivi d'une frame), state ({url,title,canGoBack} | {closed:true}),
 *              popupBlocked ({url?})
 */
@CapacitorPlugin(name = "SwipecastGecko")
public class SwipecastGeckoPlugin extends Plugin implements GeckoHost.Listener {

    private static final String TAG = "SwipeCastGecko";

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

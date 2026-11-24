package dev.miha976.swipecast;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import dev.miha976.swipecast.gecko.SwipecastGeckoPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // plugin local (navigateur GeckoView) : à enregistrer avant super.onCreate
        registerPlugin(SwipecastGeckoPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

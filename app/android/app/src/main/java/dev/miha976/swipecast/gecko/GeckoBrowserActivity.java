package dev.miha976.swipecast.gecko;

import android.content.Intent;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import org.mozilla.geckoview.GeckoView;

/**
 * Écran du navigateur : une GeckoView plein écran au-dessus de l'app React.
 * Retour = sortir du plein écran, puis page précédente, puis fermeture.
 */
public class GeckoBrowserActivity extends AppCompatActivity implements GeckoHost.ActivityHooks {

    public static final String EXTRA_URL = "url";
    public static final String EXTRA_RESTORE = "restore";

    private GeckoView view;
    private GeckoHost host;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        host = GeckoHost.get(this);
        host.attachActivity(this);

        view = new GeckoView(this);
        setContentView(view);
        view.setSession(host.ensureSession());

        getOnBackPressedDispatcher()
            .addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        if (!host.handleBack()) finishBrowser();
                    }
                }
            );

        handle(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handle(intent);
    }

    private void handle(Intent intent) {
        if (intent == null) return;
        String url = intent.getStringExtra(EXTRA_URL);
        if (url == null) return;
        String restore = intent.getStringExtra(EXTRA_RESTORE);
        intent.removeExtra(EXTRA_URL); // ne pas recharger si l'activité est recréée
        intent.removeExtra(EXTRA_RESTORE);
        host.open(url, restore);
    }

    @Override
    public void setImmersive(boolean on) {
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (on) {
            c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            c.hide(WindowInsetsCompat.Type.systemBars());
        } else {
            c.show(WindowInsetsCompat.Type.systemBars());
        }
    }

    @Override
    public void finishBrowser() {
        finish();
    }

    @Override
    protected void onDestroy() {
        if (isFinishing()) {
            view.releaseSession();
            host.onBrowserClosed();
        }
        host.detachActivity(this);
        super.onDestroy();
    }
}

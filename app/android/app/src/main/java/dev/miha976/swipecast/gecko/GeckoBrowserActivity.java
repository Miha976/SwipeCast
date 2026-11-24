package dev.miha976.swipecast.gecko;

import android.content.Intent;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import android.widget.FrameLayout;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
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
    private FrameLayout root;
    private boolean immersive;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        host = GeckoHost.get(this);
        host.attachActivity(this);

        // targetSdk 37 : affichage bord à bord imposé. La page ne doit pas passer sous les barres
        // système, sauf en plein écran vidéo (mode immersif).
        root = new FrameLayout(this);
        view = new GeckoView(this);
        root.addView(view);
        setContentView(root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            if (immersive) v.setPadding(0, 0, 0, 0);
            else v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
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
        immersive = on;
        ViewCompat.requestApplyInsets(root);
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

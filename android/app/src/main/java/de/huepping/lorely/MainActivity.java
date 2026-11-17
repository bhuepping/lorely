package de.huepping.lorely;

import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.util.Arrays;

public class MainActivity extends BridgeActivity {
    // Android erlaubt je Kante höchstens 200 dp Ausschluss-Höhe insgesamt
    private static final int EXCLUDE_DP = 200;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        hideSystemBars();
        View web = getBridge().getWebView();
        // Nach jedem Layout: die unteren Ecken (Touch-Tasten) von der System-Zurückgeste ausnehmen
        web.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> excludeBottomCorners(v));
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        c.hide(WindowInsetsCompat.Type.systemBars());
    }

    private void excludeBottomCorners(View v) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;
        int w = v.getWidth(), h = v.getHeight();
        if (w == 0 || h == 0) return;
        int px = Math.round(EXCLUDE_DP * getResources().getDisplayMetrics().density);
        int sz = Math.min(px, Math.min(w / 2, h));
        v.setSystemGestureExclusionRects(Arrays.asList(new Rect(0, h - sz, sz, h), new Rect(w - sz, h - sz, w, h)));
    }
}

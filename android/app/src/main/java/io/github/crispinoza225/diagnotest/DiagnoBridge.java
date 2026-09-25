package io.github.crispinoza225.diagnotest;

import android.app.ActivityManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Environment;
import android.os.StatFs;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.MediaStore;
import android.util.DisplayMetrics;
import android.view.Display;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Pont exposé à la page sous le nom {@code window.DiagnoAndroid}.
 * Toutes les méthodes renvoient du JSON (ou un booléen / texte simple) ; js/app.js les utilise
 * quand elles existent et garde son comportement web sinon.
 */
public class DiagnoBridge {
    private final MainActivity activity;

    DiagnoBridge(MainActivity activity) {
        this.activity = activity;
    }

    // ------------------------------------------------------------------ //
    // Appareil                                                            //
    // ------------------------------------------------------------------ //
    @JavascriptInterface
    @SuppressWarnings("deprecation")
    public String getDeviceInfo() {
        JSONObject o = new JSONObject();
        try {
            o.put("manufacturer", Build.MANUFACTURER);
            o.put("brand", Build.BRAND);
            o.put("model", Build.MODEL);
            o.put("device", Build.DEVICE);
            o.put("hardware", Build.HARDWARE);
            o.put("android", Build.VERSION.RELEASE);
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("securityPatch", Build.VERSION.SECURITY_PATCH);
            if (Build.VERSION.SDK_INT >= 31) {
                o.put("socManufacturer", Build.SOC_MANUFACTURER);
                o.put("socModel", Build.SOC_MODEL);
            }
            o.put("abis", String.join(", ", Build.SUPPORTED_ABIS));
            int cores = Runtime.getRuntime().availableProcessors();
            o.put("cores", cores);
            long maxKHz = 0;
            for (int i = 0; i < cores; i++) {
                maxKHz = Math.max(maxKHz, readLong("/sys/devices/system/cpu/cpu" + i + "/cpufreq/cpuinfo_max_freq"));
            }
            if (maxKHz > 0) o.put("cpuMaxMHz", maxKHz / 1000);

            ActivityManager am = activity.getSystemService(ActivityManager.class);
            ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
            am.getMemoryInfo(mi);
            o.put("ramTotal", mi.totalMem);
            o.put("ramAvail", mi.availMem);

            StatFs st = new StatFs(Environment.getDataDirectory().getPath());
            o.put("storageTotal", st.getTotalBytes());
            o.put("storageFree", st.getAvailableBytes());

            Display d = Build.VERSION.SDK_INT >= 30 ? activity.getDisplay() : activity.getWindowManager().getDefaultDisplay();
            if (d != null) {
                DisplayMetrics dm = new DisplayMetrics();
                d.getRealMetrics(dm);
                o.put("screenWidth", dm.widthPixels);
                o.put("screenHeight", dm.heightPixels);
                o.put("densityDpi", dm.densityDpi);
                double inches = Math.hypot(dm.widthPixels / dm.xdpi, dm.heightPixels / dm.ydpi);
                o.put("screenInches", Math.round(inches * 10) / 10.0);
                float maxHz = d.getRefreshRate();
                for (Display.Mode m : d.getSupportedModes()) maxHz = Math.max(maxHz, m.getRefreshRate());
                o.put("refreshRate", Math.round(d.getRefreshRate()));
                o.put("maxRefreshRate", Math.round(maxHz));
                o.put("hdr", d.isHdr());
                o.put("wideColorGamut", d.isWideColorGamut());
            }

            SensorManager sm = activity.getSystemService(SensorManager.class);
            JSONArray sensors = new JSONArray();
            for (Sensor s : sm.getSensorList(Sensor.TYPE_ALL)) {
                JSONObject j = new JSONObject();
                j.put("name", s.getName());
                j.put("type", s.getStringType());
                j.put("vendor", s.getVendor());
                sensors.put(j);
            }
            o.put("sensors", sensors);

            PackageManager pm = activity.getPackageManager();
            JSONObject f = new JSONObject();
            f.put("nfc", pm.hasSystemFeature(PackageManager.FEATURE_NFC));
            f.put("fingerprint", pm.hasSystemFeature(PackageManager.FEATURE_FINGERPRINT));
            f.put("face", Build.VERSION.SDK_INT >= 29 && pm.hasSystemFeature(PackageManager.FEATURE_FACE));
            f.put("telephony", pm.hasSystemFeature(PackageManager.FEATURE_TELEPHONY));
            f.put("wifi", pm.hasSystemFeature(PackageManager.FEATURE_WIFI));
            f.put("bluetoothLe", pm.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE));
            f.put("flash", pm.hasSystemFeature(PackageManager.FEATURE_CAMERA_FLASH));
            f.put("usbHost", pm.hasSystemFeature(PackageManager.FEATURE_USB_HOST));
            f.put("ir", pm.hasSystemFeature(PackageManager.FEATURE_CONSUMER_IR));
            f.put("gps", pm.hasSystemFeature(PackageManager.FEATURE_LOCATION_GPS));
            o.put("features", f);

            o.put("uptimeMs", SystemClock.elapsedRealtime());
        } catch (Exception e) {
            safePut(o, "error", e.toString());
        }
        return o.toString();
    }

    // ------------------------------------------------------------------ //
    // Batterie                                                            //
    // ------------------------------------------------------------------ //
    @JavascriptInterface
    public String getBatteryInfo() {
        JSONObject o = new JSONObject();
        try {
            Intent b = activity.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (b == null) return "null";
            o.put("present", b.getBooleanExtra(BatteryManager.EXTRA_PRESENT, true));
            o.put("level", b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1));
            o.put("scale", b.getIntExtra(BatteryManager.EXTRA_SCALE, 100));
            o.put("status", b.getIntExtra(BatteryManager.EXTRA_STATUS, -1));
            o.put("health", b.getIntExtra(BatteryManager.EXTRA_HEALTH, -1));
            o.put("plugged", b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0));
            o.put("voltage", b.getIntExtra(BatteryManager.EXTRA_VOLTAGE, 0));         // mV
            o.put("temperature", b.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0)); // dixièmes de °C
            o.put("technology", b.getStringExtra(BatteryManager.EXTRA_TECHNOLOGY));
            if (Build.VERSION.SDK_INT >= 34) {
                o.put("cycleCount", b.getIntExtra(BatteryManager.EXTRA_CYCLE_COUNT, -1));
            }

            BatteryManager bm = activity.getSystemService(BatteryManager.class);
            o.put("charging", bm.isCharging());
            o.put("chargeCounter", bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER)); // µAh
            o.put("currentNow", bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW));       // µA
            o.put("currentAvg", bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_AVERAGE));

            double design = designCapacity();
            if (design > 0) o.put("designCapacity", design); // mAh
        } catch (Exception e) {
            safePut(o, "error", e.toString());
        }
        return o.toString();
    }

    /** Capacité d'origine (mAh), fournie par le profil d'énergie du constructeur. 0 si inconnue. */
    private double designCapacity() {
        try {
            Class<?> c = Class.forName("com.android.internal.os.PowerProfile");
            Object profile = c.getConstructor(Context.class).newInstance(activity);
            double v = (double) c.getMethod("getBatteryCapacity").invoke(profile);
            if (v > 100) return v;
        } catch (Throwable ignored) {
            // API interne bloquée sur cet appareil : on tente le noyau.
        }
        long uah = readLong("/sys/class/power_supply/battery/charge_full_design");
        return uah > 0 ? uah / 1000.0 : 0;
    }

    // ------------------------------------------------------------------ //
    // Vibreur, fichiers, partage, apparence                               //
    // ------------------------------------------------------------------ //
    /** Motif au format de navigator.vibrate : [vibration, pause, vibration…] en ms. */
    @JavascriptInterface
    @SuppressWarnings("deprecation")
    public boolean vibrate(String patternJson) {
        try {
            JSONArray p = new JSONArray(patternJson);
            long[] timings = new long[p.length() + 1]; // Android commence par une pause
            for (int i = 0; i < p.length(); i++) timings[i + 1] = p.getLong(i);
            Vibrator v = Build.VERSION.SDK_INT >= 31
                    ? activity.getSystemService(VibratorManager.class).getDefaultVibrator()
                    : (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return false;
            v.vibrate(VibrationEffect.createWaveform(timings, -1));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Enregistre le rapport dans Téléchargements/DiagnoTest et renvoie l'emplacement. */
    @JavascriptInterface
    public String saveFile(String name, String content, String mime) {
        try {
            byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
            String where;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Downloads.DISPLAY_NAME, name);
                cv.put(MediaStore.Downloads.MIME_TYPE, mime);
                cv.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/DiagnoTest");
                ContentResolver r = activity.getContentResolver();
                Uri uri = r.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) throw new IllegalStateException("MediaStore indisponible");
                try (OutputStream out = r.openOutputStream(uri)) {
                    out.write(bytes);
                }
                where = "Téléchargements/DiagnoTest/" + name;
            } else {
                File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                File file = new File(dir, name);
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(bytes);
                }
                where = file.getAbsolutePath();
            }
            toast("Rapport enregistré : " + where);
            return where;
        } catch (Exception e) {
            toast("Échec de l'enregistrement : " + e.getMessage());
            return "";
        }
    }

    @JavascriptInterface
    public void shareText(String title, String text) {
        activity.runOnUiThread(() -> {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_SUBJECT, title);
            send.putExtra(Intent.EXTRA_TEXT, text);
            activity.startActivity(Intent.createChooser(send, title));
        });
    }

    /** Appelé par js/design.js quand le thème de la page change. */
    @JavascriptInterface
    public void setSystemBarColor(String cssColor) {
        try {
            int c = Color.parseColor(cssColor.trim());
            activity.runOnUiThread(() -> activity.applyBarColor(c));
        } catch (IllegalArgumentException ignored) {
        }
    }

    @JavascriptInterface
    public String appVersion() {
        try {
            return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "";
        }
    }

    // ------------------------------------------------------------------ //
    private void toast(String msg) {
        activity.runOnUiThread(() -> Toast.makeText(activity, msg, Toast.LENGTH_LONG).show());
    }

    private static long readLong(String path) {
        try (BufferedReader r = new BufferedReader(new FileReader(path))) {
            return Long.parseLong(r.readLine().trim());
        } catch (Exception e) {
            return 0;
        }
    }

    private static void safePut(JSONObject o, String k, Object v) {
        try {
            o.put(k, v);
        } catch (JSONException ignored) {
        }
    }
}

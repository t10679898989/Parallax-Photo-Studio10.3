package com.myparallax.app;

import android.Manifest;
import android.app.Activity;
import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.hardware.display.DisplayManager;
import android.view.Display;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends BridgeActivity {

    private ActivityResultLauncher<Intent> backupLauncher;
    private ActivityResultLauncher<Intent> restoreLauncher;
    private ActivityResultLauncher<String[]> permissionLauncher;
    private String pendingBackupData = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        WebView webView = this.getBridge().getWebView();
        webView.addJavascriptInterface(new WebAppInterface(this), "Android");

        permissionLauncher = registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), result -> {
            boolean allGranted = true;
            for (Boolean b : result.values()) {
                if (!b) allGranted = false;
            }
            if (!allGranted) {
                Toast.makeText(this, "部分權限未允許 (如通知或照片)，可能影響功能", Toast.LENGTH_LONG).show();
            }
        });

        checkPermissions();

        backupLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
                    Uri uri = result.getData().getData();
                    if (uri != null && pendingBackupData != null) {
                        writeToFile(uri, pendingBackupData);
                    }
                }
                pendingBackupData = null;
            }
        );

        restoreLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
                    Uri uri = result.getData().getData();
                    if (uri != null) {
                        readFromFile(uri);
                    }
                }
            }
        );
    }

    // 當 App 喚醒或首次載入完成時，主動將螢幕最高硬體 FPS 透過 JS 注入給網頁端窗口
    @Override
    protected void onResume() {
        super.onResume();
        WebView webView = this.getBridge().getWebView();
        if (webView != null) {
            webView.postDelayed(() -> {
                int maxFps = getMaxSupportedRefreshRate();
                webView.evaluateJavascript("if(window.setDeviceMaxFps) window.setDeviceMaxFps(" + maxFps + ");", null);
            }, 800); // 給予 800ms 的安全緩衝時間，確保 Angular 初始化及 window 方法掛載完畢
        }
    }

    // 核心硬體偵測邏輯：遍歷裝置支援的所有 Mode，找出絕對的物理硬體重新整理率極限 (防止省電模式干擾)
    private int getMaxSupportedRefreshRate() {
        float maxRefreshRate = 60f;
        try {
            Display display = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                DisplayManager dm = (DisplayManager) getSystemService(Context.DISPLAY_SERVICE);
                if (dm != null) {
                    display = dm.getDisplay(Display.DEFAULT_DISPLAY);
                }
            }
            if (display == null) {
                display = getWindowManager().getDefaultDisplay();
            }

            if (display != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Display.Mode[] modes = display.getSupportedModes();
                    for (Display.Mode mode : modes) {
                        if (mode.getRefreshRate() > maxRefreshRate) {
                            maxRefreshRate = mode.getRefreshRate();
                        }
                    }
                } else {
                    maxRefreshRate = display.getRefreshRate();
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return Math.round(maxRefreshRate);
    }

    // 乾淨的權限檢查
    private void checkPermissions() {
        List<String> perms = new ArrayList<>();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                perms.add(Manifest.permission.READ_MEDIA_IMAGES);
            }
            if (Build.VERSION.SDK_INT >= 34) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) != PackageManager.PERMISSION_GRANTED) {
                    perms.add(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED);
                }
            }
            // 請求通知權限 (為了 Keep Alive)
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                perms.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                perms.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            }
        }

        if (!perms.isEmpty()) {
            permissionLauncher.launch(perms.toArray(new String[0]));
        }
    }

    private void writeToFile(Uri uri, String data) {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        executor.execute(() -> {
            try {
                OutputStream os = getContentResolver().openOutputStream(uri);
                if (os != null) {
                    os.write(data.getBytes());
                    os.close();
                    runOnUiThread(() -> Toast.makeText(this, "備份成功！", Toast.LENGTH_SHORT).show());
                }
            } catch (Exception e) {
                e.printStackTrace();
                runOnUiThread(() -> Toast.makeText(this, "備份失敗：" + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        });
    }

    private void readFromFile(Uri uri) {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        executor.execute(() -> {
            try {
                InputStream is = getContentResolver().openInputStream(uri);
                BufferedReader reader = new BufferedReader(new InputStreamReader(is));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                reader.close();
                is.close();

                String jsonContent = sb.toString();
                runOnUiThread(() -> {
                    WebView webView = this.getBridge().getWebView();
                    if (webView != null) {
                        webView.evaluateJavascript("if(window.onRestoreFileLoaded) window.onRestoreFileLoaded(`" + jsonContent.replace("`", "\\`") + "`);", null);
                    }
                });

            } catch (Exception e) {
                e.printStackTrace();
                runOnUiThread(() -> Toast.makeText(this, "還原失敗：" + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        });
    }

    public class WebAppInterface {
        Context mContext;

        WebAppInterface(Context c) {
            mContext = c;
        }

        // 🔥 [核心修正] 加上明確的 MainActivity.this 限定符，徹底消除內部 Lambda 的變數解析錯誤
        @JavascriptInterface
        public void requestDeviceMaxFps() {
            MainActivity.this.runOnUiThread(() -> {
                WebView webView = MainActivity.this.getBridge().getWebView();
                if (webView != null) {
                    int maxFps = MainActivity.this.getMaxSupportedRefreshRate();
                    webView.evaluateJavascript("if(window.setDeviceMaxFps) window.setDeviceMaxFps(" + maxFps + ");", null);
                }
            });
        }

        @JavascriptInterface
        public void updateSettings(String jsonSettings) {
            SharedPreferences sharedPref = mContext.getSharedPreferences("WallpaperPrefs", Context.MODE_PRIVATE);
            sharedPref.edit().putString("settings_json", jsonSettings).commit();
            // 通知 Service 更新 (單向)
            Intent intent = new Intent("com.myparallax.app.ACTION_UPDATE_WALLPAPER");
            intent.setPackage(mContext.getPackageName());
            mContext.sendBroadcast(intent);
        }
        
        @JavascriptInterface
        public void setWallpaper(String imagePath) {
             SharedPreferences sharedPref = mContext.getSharedPreferences("WallpaperPrefs", Context.MODE_PRIVATE);
             boolean success = sharedPref.edit().putString("current_image_path", imagePath).commit();
             
             if (success) {
                 Intent intent = new Intent("com.myparallax.app.ACTION_UPDATE_WALLPAPER");
                 intent.setPackage(mContext.getPackageName());
                 mContext.sendBroadcast(intent);

                 MainActivity.this.runOnUiThread(() -> {
                     try {
                         WallpaperManager wm = WallpaperManager.getInstance(mContext);
                         if (wm.getWallpaperInfo() == null || 
                             !wm.getWallpaperInfo().getPackageName().equals(mContext.getPackageName())) {
                             Toast.makeText(mContext, "請選擇「Parallax Studio」並套用", Toast.LENGTH_LONG).show();
                             Intent intent2 = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER);
                             intent2.putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT,
                                 new ComponentName(mContext, ParallaxWallpaperService.class));
                             intent2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                             mContext.startActivity(intent2);
                         } else {
                             Toast.makeText(mContext, "桌布已更新", Toast.LENGTH_SHORT).show();
                         }
                     } catch (Exception e) {
                         e.printStackTrace();
                     }
                 });
             }
        }

        @JavascriptInterface
        public void backupSettings(String jsonData) {
            pendingBackupData = jsonData;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            intent.putExtra(Intent.EXTRA_TITLE, "parallax_backup_" + System.currentTimeMillis() + ".json");
            backupLauncher.launch(intent);
        }

        @JavascriptInterface
        public void restoreSettings() {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json"); 
            restoreLauncher.launch(intent);
        }

        @JavascriptInterface
        public void updateServiceNotification(String status) {
            Intent intent = new Intent("com.myparallax.app.ACTION_UPDATE_NOTIFICATION");
            intent.putExtra("status", status); 
            intent.setPackage(mContext.getPackageName());
            mContext.sendBroadcast(intent);
        }
    }
}
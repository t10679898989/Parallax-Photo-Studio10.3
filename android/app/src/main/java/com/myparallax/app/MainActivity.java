package com.myparallax.app;

import android.Manifest;
import android.app.Activity;
import android.app.WallpaperManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
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
import org.json.JSONObject;

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

    // 🔥 1. 新增：廣播接收器，用於接收下拉選單的更新訊號 (同步 UI 用)
    private final BroadcastReceiver tileSyncReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if ("com.myparallax.app.ACTION_UPDATE_WALLPAPER".equals(intent.getAction())) {
                syncKeepAliveState();
            }
        }
    };

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

        // 🔥 2. 新增：註冊廣播接收器
        IntentFilter filter = new IntentFilter("com.myparallax.app.ACTION_UPDATE_WALLPAPER");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            registerReceiver(tileSyncReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(tileSyncReceiver, filter);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        try {
            unregisterReceiver(tileSyncReceiver);
        } catch (Exception e) {}
    }

    // 🔥 3. 新增：同步狀態到 Web 端的方法
    private void syncKeepAliveState() {
        SharedPreferences sharedPref = getSharedPreferences("WallpaperPrefs", Context.MODE_PRIVATE);
        String jsonStr = sharedPref.getString("settings_json", "{}");
        boolean isKeepAlive = false;
        try {
            JSONObject json = new JSONObject(jsonStr);
            isKeepAlive = json.optBoolean("runInBackground", false);
        } catch (Exception e) {}

        boolean finalState = isKeepAlive;
        runOnUiThread(() -> {
            WebView webView = this.getBridge().getWebView();
            if (webView != null) {
                // 呼叫 Web 端的 updateKeepAliveUI 函式
                webView.evaluateJavascript("if(window.updateKeepAliveUI) window.updateKeepAliveUI(" + finalState + ");", null);
            }
        });
    }

    // 🔥 4. 修正：一定要請求 POST_NOTIFICATIONS 權限
    private void checkPermissions() {
        List<String> perms = new ArrayList<>();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) { // Android 13+
            // 圖片權限
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                perms.add(Manifest.permission.READ_MEDIA_IMAGES);
            }
            // Android 14 部分存取權限
            if (Build.VERSION.SDK_INT >= 34) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) != PackageManager.PERMISSION_GRANTED) {
                    perms.add(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED);
                }
            }
            // 🔥 重點：通知權限
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                perms.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        } else {
            // Android 12 以下
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

        @JavascriptInterface
        public void updateSettings(String jsonSettings) {
            SharedPreferences sharedPref = mContext.getSharedPreferences("WallpaperPrefs", Context.MODE_PRIVATE);
            sharedPref.edit().putString("settings_json", jsonSettings).commit();
            sendUpdateBroadcast();
        }
        
        @JavascriptInterface
        public void setWallpaper(String imagePath) {
             SharedPreferences sharedPref = mContext.getSharedPreferences("WallpaperPrefs", Context.MODE_PRIVATE);
             boolean success = sharedPref.edit().putString("current_image_path", imagePath).commit();
             
             if (success) {
                 sendUpdateBroadcast();

                 runOnUiThread(() -> {
                     try {
                         WallpaperManager wm = WallpaperManager.getInstance(mContext);
                         if (wm.getWallpaperInfo() == null || 
                             !wm.getWallpaperInfo().getPackageName().equals(mContext.getPackageName())) {
                             
                             Toast.makeText(mContext, "請選擇「Parallax Studio」並套用", Toast.LENGTH_LONG).show();
                             
                             Intent intent = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER);
                             intent.putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT,
                                 new ComponentName(mContext, ParallaxWallpaperService.class));
                             intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                             mContext.startActivity(intent);
                         } else {
                             Toast.makeText(mContext, "桌布已更新", Toast.LENGTH_SHORT).show();
                         }
                     } catch (Exception e) {
                         e.printStackTrace();
                         Toast.makeText(mContext, "無法開啟設定", Toast.LENGTH_SHORT).show();
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

        private void sendUpdateBroadcast() {
            Intent intent = new Intent("com.myparallax.app.ACTION_UPDATE_WALLPAPER");
            intent.setPackage(mContext.getPackageName());
            mContext.sendBroadcast(intent);
        }
    }
}
package com.myparallax.app;

import android.Manifest;
import android.app.WallpaperManager;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends BridgeActivity {

    private ActivityResultLauncher<Intent> backupLauncher;
    private ActivityResultLauncher<Intent> restoreLauncher;
    private ActivityResultLauncher<String[]> permissionLauncher;
    private String pendingBackupData = null; // 暫存要寫入的備份資料

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        WebView webView = this.getBridge().getWebView();
        webView.addJavascriptInterface(new WebAppInterface(this), "Android");

        // --- 1. 權限請求邏輯 (Android 13/14+) ---
        permissionLauncher = registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), result -> {
            boolean allGranted = true;
            for (Boolean b : result.values()) {
                if (!b) allGranted = false;
            }
            if (!allGranted) {
                Toast.makeText(this, "部分權限未允許，可能影響功能", Toast.LENGTH_SHORT).show();
            }
        });

        checkPermissions();

        // --- 2. 備份 (儲存檔案) ---
        backupLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
                    Uri uri = result.getData().getData();
                    if (uri != null && pendingBackupData != null) {
                        writeToFile(uri, pendingBackupData);
                    }
                }
                pendingBackupData = null; // 清除暫存
            }
        );

        // --- 3. 還原 (開啟檔案) ---
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

    private void checkPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                // Android 14 Partial Access 支援
                if (Build.VERSION.SDK_INT >= 34) { // UPSIDE_DOWN_CAKE
                     permissionLauncher.launch(new String[]{
                         Manifest.permission.READ_MEDIA_IMAGES,
                         Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED
                     });
                } else {
                     permissionLauncher.launch(new String[]{Manifest.permission.READ_MEDIA_IMAGES});
                }
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                permissionLauncher.launch(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE});
            }
        }
    }

    // --- 檔案讀寫輔助方法 (在背景執行緒) ---
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
                // 傳回 Web 端
                runOnUiThread(() -> {
                    WebView webView = this.getBridge().getWebView();
                    // 呼叫 editor.component.ts 裡註冊的 callback
                    // 注意：這裡假設 web 端有掛載 window.onRestoreFileLoaded
                    // 如果沒有，可以用 evaluateJavascript
                    webView.evaluateJavascript("if(window.onRestoreFileLoaded) window.onRestoreFileLoaded(`" + jsonContent.replace("`", "\\`") + "`);", null);
                });

            } catch (Exception e) {
                e.printStackTrace();
                runOnUiThread(() -> Toast.makeText(this, "還原失敗：" + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        });
    }

    // --- Javascript Interface ---
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
                         // 簡單判斷：如果還沒設成動態桌布，就跳轉設定
                         if (wm.getWallpaperInfo() == null || 
                             !wm.getWallpaperInfo().getPackageName().equals(mContext.getPackageName())) {
                             
                             Toast.makeText(mContext, "請選擇「Parallax Studio」並套用", Toast.LENGTH_LONG).show();
                             
                             Intent intent = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER);
                             intent.putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT,
                                 new ComponentName(mContext, ParallaxWallpaperService.class));
                             intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                             mContext.startActivity(intent);
                         } else {
                             // 已經是動態桌布了，直接通知使用者
                             Toast.makeText(mContext, "桌布已更新", Toast.LENGTH_SHORT).show();
                         }
                     } catch (Exception e) {
                         e.printStackTrace();
                         Toast.makeText(mContext, "無法開啟設定", Toast.LENGTH_SHORT).show();
                     }
                 });
             }
        }

        // 🔥 新增：原生備份
        @JavascriptInterface
        public void backupSettings(String jsonData) {
            pendingBackupData = jsonData;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            intent.putExtra(Intent.EXTRA_TITLE, "parallax_backup_" + System.currentTimeMillis() + ".json");
            backupLauncher.launch(intent);
        }

        // 🔥 新增：原生還原
        @JavascriptInterface
        public void restoreSettings() {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json"); // 或者 "*/*"
            restoreLauncher.launch(intent);
        }

        // 🔥 新增：更新前台服務通知文字
        @JavascriptInterface
        public void updateServiceNotification(String status) {
            Intent intent = new Intent("com.myparallax.app.ACTION_UPDATE_NOTIFICATION");
            intent.putExtra("status", status); // "paused" or "active"
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
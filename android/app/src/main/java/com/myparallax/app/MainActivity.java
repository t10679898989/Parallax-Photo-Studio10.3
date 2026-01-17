package com.myparallax.app; // ⚠️ 確認 package name

import android.Manifest;
import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLDecoder;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = this.getBridge().getWebView();
        webView.addJavascriptInterface(new WebAppInterface(this), "Android");
        
        // Android 13+ 請求圖片權限 (如果是第一次安裝，這裡會跳出詢問)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.READ_MEDIA_IMAGES}, 1);
            }
        } else {
             if (checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE}, 1);
            }
        }
    }

    public class WebAppInterface {
        Context mContext;

        WebAppInterface(Context c) {
            mContext = c;
        }

        @JavascriptInterface
        public void saveSettings(String jsonSettings) {
            SharedPreferences sharedPref = mContext.getSharedPreferences("WallpaperPrefs", Context.MODE_PRIVATE);
            sharedPref.edit().putString("settings_json", jsonSettings).apply();
            sendUpdateBroadcast();
        }
        
        @JavascriptInterface
        public void setWallpaper(String imagePath) {
             // 1. 嘗試複製檔案
             String internalPath = null;
             try {
                 internalPath = copyFileToInternalStorage(imagePath);
             } catch (Exception e) {
                 // 🔥 顯示詳細錯誤，方便除錯
                 e.printStackTrace();
                 String errorMsg = "複製失敗: " + e.getMessage();
                 runOnUiThread(() -> Toast.makeText(mContext, errorMsg, Toast.LENGTH_LONG).show());
                 return;
             }
             
             if (internalPath == null) {
                 runOnUiThread(() -> Toast.makeText(mContext, "未知錯誤：路徑為空", Toast.LENGTH_LONG).show());
                 return;
             }

             // 2. 存入成功，寫入設定
             SharedPreferences sharedPref = mContext.getSharedPreferences("WallpaperPrefs", Context.MODE_PRIVATE);
             boolean success = sharedPref.edit().putString("current_image_path", internalPath).commit();
             
             if (success) {
                 sendUpdateBroadcast();
                 runOnUiThread(() -> {
                     try {
                         WallpaperManager wm = WallpaperManager.getInstance(mContext);
                         if (wm.getWallpaperInfo() != null && 
                             wm.getWallpaperInfo().getPackageName().equals(mContext.getPackageName())) {
                             Toast.makeText(mContext, "桌布已更新", Toast.LENGTH_SHORT).show();
                         } else {
                             Toast.makeText(mContext, "請點擊「設定桌布」以套用效果", Toast.LENGTH_LONG).show();
                             Intent intent = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER);
                             intent.putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT,
                                 new ComponentName(mContext, ParallaxWallpaperService.class));
                             intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                             mContext.startActivity(intent);
                         }
                     } catch (Exception e) {
                         Toast.makeText(mContext, "無法開啟設定: " + e.getMessage(), Toast.LENGTH_LONG).show();
                     }
                 });
             }
        }

        private void sendUpdateBroadcast() {
            Intent intent = new Intent("com.myparallax.app.ACTION_UPDATE_WALLPAPER");
            intent.setPackage(mContext.getPackageName());
            mContext.sendBroadcast(intent);
        }

        // 📋 增強版搬運工：處理各種怪異路徑
        private String copyFileToInternalStorage(String sourcePath) throws Exception {
            InputStream in = null;
            
            // 1. 處理 URL 編碼 (例如 %20 空白)
            if (sourcePath.contains("%")) {
                try {
                    sourcePath = URLDecoder.decode(sourcePath, "UTF-8");
                } catch (Exception e) {}
            }

            // 2. 處理 file:// 前綴
            if (sourcePath.startsWith("file://")) {
                sourcePath = sourcePath.substring(7);
            }

            // 3. 判斷來源類型並開啟串流
            if (sourcePath.startsWith("content://")) {
                // 相簿/Google Photos 來源
                in = mContext.getContentResolver().openInputStream(Uri.parse(sourcePath));
            } else {
                // 一般檔案路徑
                File sourceFile = new File(sourcePath);
                if (!sourceFile.exists()) {
                    throw new Exception("找不到檔案 (File Not Found): " + sourcePath);
                }
                if (!sourceFile.canRead()) {
                    throw new Exception("無權限讀取 (Permission Denied): " + sourcePath);
                }
                in = new FileInputStream(sourceFile);
            }

            if (in == null) throw new Exception("無法開啟輸入串流 (InputStream is null)");

            // 4. 複製到 App 私有空間
            File dest = new File(mContext.getFilesDir(), "wallpaper.png");
            // 如果檔案存在先刪除，確保寫入新的
            if (dest.exists()) dest.delete();
            
            OutputStream out = new FileOutputStream(dest);

            byte[] buffer = new byte[4096]; // 加大緩衝區加快速度
            int length;
            while ((length = in.read(buffer)) > 0) {
                out.write(buffer, 0, length);
            }
            in.close();
            out.close();
            
            // 雙重確認檔案真的寫進去了
            if (dest.exists() && dest.length() > 0) {
                return dest.getAbsolutePath();
            } else {
                throw new Exception("寫入失敗，檔案大小為 0");
            }
        }
    }
}
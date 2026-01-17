package com.myparallax.app; // ⚠️ 確認 package name

import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
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

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = this.getBridge().getWebView();
        webView.addJavascriptInterface(new WebAppInterface(this), "Android");
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
             // 🔥 關鍵修正 1：先將圖片複製到 App 內部空間 (Internal Storage)
             // 這樣可以避開所有 Android 14 的檔案權限問題
             String internalPath = copyFileToInternalStorage(imagePath);
             
             if (internalPath == null) {
                 Toast.makeText(mContext, "圖片讀取失敗，無法設定", Toast.LENGTH_LONG).show();
                 return;
             }

             // 🔥 關鍵修正 2：存入的是「內部路徑」，這個路徑 Service 絕對讀得到
             SharedPreferences sharedPref = mContext.getSharedPreferences("WallpaperPrefs", Context.MODE_PRIVATE);
             boolean success = sharedPref.edit().putString("current_image_path", internalPath).commit();
             
             if (success) {
                 sendUpdateBroadcast();
                 runOnUiThread(() -> {
                     try {
                         WallpaperManager wm = WallpaperManager.getInstance(mContext);
                         if (wm.getWallpaperInfo() != null && 
                             wm.getWallpaperInfo().getPackageName().equals(mContext.getPackageName())) {
                             Toast.makeText(mContext, "桌布圖片已更新", Toast.LENGTH_SHORT).show();
                         } else {
                             Toast.makeText(mContext, "請點擊「設定桌布」以套用效果", Toast.LENGTH_LONG).show();
                             Intent intent = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER);
                             intent.putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT,
                                 new ComponentName(mContext, ParallaxWallpaperService.class));
                             intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                             mContext.startActivity(intent);
                         }
                     } catch (Exception e) {
                         e.printStackTrace();
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

        // 📋 搬運工方法：把外部檔案複製到內部
        private String copyFileToInternalStorage(String sourcePath) {
            try {
                InputStream in;
                // 判斷是 Content URI (相簿) 還是 File Path
                if (sourcePath.startsWith("content://")) {
                    in = mContext.getContentResolver().openInputStream(Uri.parse(sourcePath));
                } else {
                    if (sourcePath.startsWith("file://")) {
                        sourcePath = sourcePath.substring(7); // 去掉 file:// 前綴
                    }
                    in = new FileInputStream(new File(sourcePath));
                }

                if (in == null) return null;

                // 目標：App 私有資料夾下的 wallpaper.png
                File dest = new File(mContext.getFilesDir(), "wallpaper.png");
                OutputStream out = new FileOutputStream(dest);

                byte[] buffer = new byte[1024];
                int length;
                while ((length = in.read(buffer)) > 0) {
                    out.write(buffer, 0, length);
                }
                in.close();
                out.close();

                return dest.getAbsolutePath(); // 回傳絕對路徑
            } catch (Exception e) {
                e.printStackTrace();
                return null;
            }
        }
    }
}
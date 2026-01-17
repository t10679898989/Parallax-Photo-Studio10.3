package com.myparallax.app; // ⚠️ 再次確認這跟 AndroidManifest 是一樣的

import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast; // 用來顯示提示
import com.getcapacitor.BridgeActivity;

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
            
            // 發送廣播通知 Service 更新 (如果桌布已經在跑)
            sendUpdateBroadcast();
        }
        
        @JavascriptInterface
        public void setWallpaper(String imagePath) {
             // 1. 先把圖片路徑存起來
             SharedPreferences sharedPref = mContext.getSharedPreferences("WallpaperPrefs", Context.MODE_PRIVATE);
             sharedPref.edit().putString("current_image_path", imagePath).apply();
             
             // 2. 通知 Service (如果桌布已經設定了，這會讓畫面直接換圖)
             sendUpdateBroadcast();

             // 3. 🔥【關鍵修正】呼叫系統桌布預覽視窗 🔥
             // 我們要檢查使用者是否已經在使用我們的桌布，如果沒有，就彈出設定視窗
             runOnUiThread(() -> {
                 try {
                     WallpaperManager wm = WallpaperManager.getInstance(mContext);
                     // 檢查目前桌布是否已經是我們的 App
                     if (wm.getWallpaperInfo() == null || 
                         !wm.getWallpaperInfo().getPackageName().equals(mContext.getPackageName())) {
                         
                         Toast.makeText(mContext, "請點擊「設定桌布」以套用效果", Toast.LENGTH_LONG).show();
                         
                         // 啟動 Android 原生桌布選擇器，並直接指向我們的 Service
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
                     Toast.makeText(mContext, "無法開啟桌布設定: " + e.getMessage(), Toast.LENGTH_LONG).show();
                 }
             });
        }

        private void sendUpdateBroadcast() {
            Intent intent = new Intent("com.myparallax.app.ACTION_UPDATE_WALLPAPER");
            intent.setPackage(mContext.getPackageName());
            mContext.sendBroadcast(intent);
        }
    }
}
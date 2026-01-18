package com.myparallax.app;

import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
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

        // 🔥 修正 1：將方法名稱從 saveSettings 改為 updateSettings
        // 這樣 Web 端的 window.Android.updateSettings() 才能成功呼叫！
        @JavascriptInterface
        public void updateSettings(String jsonSettings) {
            SharedPreferences sharedPref = mContext.getSharedPreferences("WallpaperPrefs", Context.MODE_PRIVATE);
            // 使用 commit() 確保立即寫入，而不是非同步的 apply()
            sharedPref.edit().putString("settings_json", jsonSettings).commit();
            
            // 發送廣播通知 Service 更新參數
            sendUpdateBroadcast();
        }
        
        @JavascriptInterface
        public void setWallpaper(String imagePath) {
             SharedPreferences sharedPref = mContext.getSharedPreferences("WallpaperPrefs", Context.MODE_PRIVATE);
             // 同樣使用 commit() 確保路徑立即儲存
             boolean success = sharedPref.edit().putString("current_image_path", imagePath).commit();
             
             if (success) {
                 sendUpdateBroadcast();

                 runOnUiThread(() -> {
                     try {
                         WallpaperManager wm = WallpaperManager.getInstance(mContext);
                         // 如果不是當前桌布，才跳出設定視窗
                         if (wm.getWallpaperInfo() == null || 
                             !wm.getWallpaperInfo().getPackageName().equals(mContext.getPackageName())) {
                             
                             Toast.makeText(mContext, "請點擊「設定桌布」以套用效果", Toast.LENGTH_LONG).show();
                             
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
                         Toast.makeText(mContext, "無法開啟桌布設定", Toast.LENGTH_SHORT).show();
                     }
                 });
             }
        }

        private void sendUpdateBroadcast() {
            Intent intent = new Intent("com.myparallax.app.ACTION_UPDATE_WALLPAPER");
            intent.setPackage(mContext.getPackageName());
            mContext.sendBroadcast(intent);
        }
    }
}
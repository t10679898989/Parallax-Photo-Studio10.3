package com.myparallax.app; // ⚠️ 請確認這裡跟你的 AndroidManifest.xml 裡的 package 一樣

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
        
        // 1. 取得 WebView 並注入橋接介面
        WebView webView = this.getBridge().getWebView();
        webView.addJavascriptInterface(new WebAppInterface(this), "Android");
    }

    public class WebAppInterface {
        Context mContext;

        WebAppInterface(Context c) {
            mContext = c;
        }

        // Web 端呼叫：Android.saveSettings(json)
        // 用途：調整靈敏度、FPS 等參數時使用
        @JavascriptInterface
        public void saveSettings(String jsonSettings) {
            SharedPreferences sharedPref = mContext.getSharedPreferences("WallpaperPrefs", Context.MODE_PRIVATE);
            // 參數設定用 apply() 非同步存檔即可，比較不卡介面
            sharedPref.edit().putString("settings_json", jsonSettings).apply();
            
            // 通知 Service 更新參數
            sendUpdateBroadcast();
        }
        
        // Web 端呼叫：Android.setWallpaper(imagePath)
        // 用途：使用者選定圖片，準備設為桌布時使用
        @JavascriptInterface
        public void setWallpaper(String imagePath) {
             SharedPreferences sharedPref = mContext.getSharedPreferences("WallpaperPrefs", Context.MODE_PRIVATE);
             
             // 🔥 關鍵修正：這裡必須用 .commit() (同步存檔)
             // 確保程式碼往下跑之前，圖片路徑已經百分之百寫入硬碟了
             boolean success = sharedPref.edit().putString("current_image_path", imagePath).commit();
             
             if (success) {
                 // 1. 先通知 Service (如果桌布已經在跑，這會讓它直接換圖)
                 sendUpdateBroadcast();

                 // 2. 呼叫系統桌布預覽視窗 (在主執行緒執行 UI 操作)
                 runOnUiThread(() -> {
                     try {
                         WallpaperManager wm = WallpaperManager.getInstance(mContext);
                         
                         // 檢查：如果現在的桌布已經是我們 App 了，就只提示更新成功
                         if (wm.getWallpaperInfo() != null && 
                             wm.getWallpaperInfo().getPackageName().equals(mContext.getPackageName())) {
                             
                             Toast.makeText(mContext, "桌布圖片已更新", Toast.LENGTH_SHORT).show();
                             
                         } else {
                             // 如果還不是，或是第一次設定，就彈出系統預覽視窗
                             Toast.makeText(mContext, "請點擊「設定桌布」以套用效果", Toast.LENGTH_LONG).show();
                             
                             Intent intent = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER);
                             intent.putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT,
                                 new ComponentName(mContext, ParallaxWallpaperService.class));
                             intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                             mContext.startActivity(intent);
                         }
                     } catch (Exception e) {
                         e.printStackTrace();
                         Toast.makeText(mContext, "無法開啟桌布設定: " + e.getMessage(), Toast.LENGTH_LONG).show();
                     }
                 });
             }
        }

        // 輔助方法：發送廣播給 Service
        private void sendUpdateBroadcast() {
            Intent intent = new Intent("com.myparallax.app.ACTION_UPDATE_WALLPAPER");
            intent.setPackage(mContext.getPackageName());
            mContext.sendBroadcast(intent);
        }
    }
}
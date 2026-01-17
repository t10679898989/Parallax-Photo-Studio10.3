package com.myparallax.app; // ⚠️ 請確認這行跟 AndroidManifest.xml 裡的 package="..." 一模一樣

import android.content.Context;
import android.content.Intent; // 新增
import android.content.SharedPreferences;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // 1. 取得 WebView
        WebView webView = this.getBridge().getWebView();
        
        // 2. 注入橋接介面
        // 這行讓 Web 可以用 window.Android.saveSettings()
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
            SharedPreferences.Editor editor = sharedPref.edit();
            editor.putString("settings_json", jsonSettings);
            editor.apply();

            // 🔥 新增：發送廣播通知 Service 更新設定 (解決調整參數沒反應的問題)
            sendUpdateBroadcast();
        }
        
        @JavascriptInterface
        public void setWallpaper(String imagePath) {
             SharedPreferences sharedPref = mContext.getSharedPreferences("WallpaperPrefs", Context.MODE_PRIVATE);
             SharedPreferences.Editor editor = sharedPref.edit();
             editor.putString("current_image_path", imagePath);
             editor.apply();
             
             // 🔥 新增：發送廣播通知 Service 換圖 (解決 TODO)
             sendUpdateBroadcast();
        }

        // 輔助方法：發送廣播
        private void sendUpdateBroadcast() {
            // 這個字串必須跟 Service 裡的 IntentFilter 一致
            Intent intent = new Intent("com.myparallax.app.ACTION_UPDATE_WALLPAPER");
            // 指定 Package 確保只有自己的 App 收得到
            intent.setPackage(mContext.getPackageName());
            mContext.sendBroadcast(intent);
        }
    }
}
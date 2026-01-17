package com.myparallax.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // 1. 取得 WebView (Capacitor 的核心)
        WebView webView = this.getBridge().getWebView();
        
        // 2. 注入橋接介面，讓 Web 可以呼叫 window.Android
        webView.addJavascriptInterface(new WebAppInterface(this), "Android");
    }

    // 定義橋接介面類別
    public class WebAppInterface {
        Context mContext;

        WebAppInterface(Context c) {
            mContext = c;
        }

        // Web 呼叫 window.Android.saveSettings(jsonString) 時會執行這裡
        @JavascriptInterface
        public void saveSettings(String jsonSettings) {
            SharedPreferences sharedPref = mContext.getSharedPreferences("WallpaperPrefs", Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = sharedPref.edit();
            editor.putString("settings_json", jsonSettings);
            editor.apply(); // 儲存成功！
        }
        
        // Web 呼叫 window.Android.setWallpaper(imagePath) 時執行
        @JavascriptInterface
        public void setWallpaper(String imagePath) {
             SharedPreferences sharedPref = mContext.getSharedPreferences("WallpaperPrefs", Context.MODE_PRIVATE);
             SharedPreferences.Editor editor = sharedPref.edit();
             editor.putString("current_image_path", imagePath);
             editor.apply();
             
             // TODO: 這裡可以加入觸發 WallpaperService 重新載入圖片的廣播
        }
    }
}

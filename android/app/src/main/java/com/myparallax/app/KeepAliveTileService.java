package com.myparallax.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;
import android.util.Log;
import android.widget.Toast;
import androidx.annotation.RequiresApi;
import org.json.JSONObject;

@RequiresApi(api = Build.VERSION_CODES.N)
public class KeepAliveTileService extends TileService {

    @Override
    public void onStartListening() {
        super.onStartListening();
        updateTileState();
    }

    @Override
    public void onClick() {
        super.onClick();
        
        // 1. 讀取目前設定
        SharedPreferences prefs = getSharedPreferences("WallpaperPrefs", Context.MODE_PRIVATE);
        String jsonStr = prefs.getString("settings_json", "{}");
        boolean currentState = false;
        
        try {
            JSONObject json = new JSONObject(jsonStr);
            // 讀取當前狀態
            currentState = json.optBoolean("runInBackground", false);
            
            // 2. 切換狀態 (Toggle)
            boolean newState = !currentState;
            json.put("runInBackground", newState);
            
            // 3. 立即儲存設定
            prefs.edit().putString("settings_json", json.toString()).commit();
            
            // 4. 🔥 關鍵修正：發送廣播通知 WallpaperService 更新
            // 這會觸發 Service 的 loadSettings() -> handleForegroundService()
            // 如果是 true -> 顯示通知；如果是 false -> 移除通知 (符合 Android 規範)
            Intent intent = new Intent("com.myparallax.app.ACTION_UPDATE_WALLPAPER");
            intent.setPackage(getPackageName());
            sendBroadcast(intent);
            
            // 5. 更新 Tile UI (亮起或變暗)
            updateTileState();
            
            String message = newState ? "Keep Alive: 已開啟 (前景執行中)" : "Keep Alive: 已關閉";
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
            
        } catch (Exception e) {
            e.printStackTrace();
            Log.e("KeepAliveTile", "Error updating settings", e);
        }
    }

    private void updateTileState() {
        Tile tile = getQsTile();
        if (tile == null) return;

        SharedPreferences prefs = getSharedPreferences("WallpaperPrefs", Context.MODE_PRIVATE);
        String jsonStr = prefs.getString("settings_json", "{}");
        boolean isActive = false;
        
        try {
            JSONObject json = new JSONObject(jsonStr);
            isActive = json.optBoolean("runInBackground", false);
        } catch (Exception e) {
            e.printStackTrace();
        }

        // 設定按鈕狀態 (Active = 亮起 / Inactive = 變暗)
        tile.setState(isActive ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        tile.setLabel("Keep Alive");
        tile.updateTile();
    }
}
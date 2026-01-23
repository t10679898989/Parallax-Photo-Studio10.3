package com.myparallax.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;
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
            currentState = json.optBoolean("runInBackground", false);
            
            // 2. 切換狀態
            boolean newState = !currentState;
            json.put("runInBackground", newState);
            
            // 3. 儲存設定
            prefs.edit().putString("settings_json", json.toString()).commit();
            
            // 4. 通知 Service 更新
            // 注意：這裡我們只更新了 Native 端的設定，Web 端 UI 沒辦法透過這個 Tile 直接同步更新
            // (除非用更複雜的 socket 或 push 機制，目前先確保功能運作)
            
            // 5. 更新 Tile UI
            updateTileState();
            
            Toast.makeText(this, "Keep Alive: " + (newState ? "ON" : "OFF"), Toast.LENGTH_SHORT).show();
            
        } catch (Exception e) {
            e.printStackTrace();
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
        } catch (Exception e) {}

        tile.setState(isActive ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        tile.setLabel("Keep Alive");
        tile.updateTile();
    }
}
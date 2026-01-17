package com.myparallax.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.service.wallpaper.WallpaperService;
import android.view.SurfaceHolder;
import org.json.JSONObject;
import java.io.File;

public class ParallaxWallpaperService extends WallpaperService {

    @Override
    public Engine onCreateEngine() {
        return new ParallaxEngine();
    }

    private class ParallaxEngine extends Engine implements SensorEventListener {
        private final Handler handler = new Handler();
        private SurfaceHolder holder;
        private boolean visible = false;
        private SensorManager sensorManager;
        private Sensor accelerometer;
        
        // 核心變數
        private Bitmap currentBitmap;
        private float xOffset = 0; // 陀螺儀 X
        private float yOffset = 0; // 陀螺儀 Y
        private float motionStrength = 1.0f; // 從 Web JSON 讀取
        private float scale = 1.2f; // 從 Web JSON 讀取

        // 繪圖迴圈
        private final Runnable drawRunner = new Runnable() {
            @Override
            public void run() {
                draw();
            }
        };

        @Override
        public void onCreate(SurfaceHolder surfaceHolder) {
            super.onCreate(surfaceHolder);
            this.holder = surfaceHolder;
            
            // 1. 設定感測器
            sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
            accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            
            // 2. 讀取 Web 存下來的設定
            loadSettingsFromStorage();
        }

        // 從 SharedPreferences 讀取 Web 存的資料
        private void loadSettingsFromStorage() {
            SharedPreferences prefs = getSharedPreferences("WallpaperPrefs", MODE_PRIVATE);
            String jsonStr = prefs.getString("settings_json", "{}");
            String imagePath = prefs.getString("current_image_path", "");

            try {
                JSONObject json = new JSONObject(jsonStr);
                // 讀取 Web 設定的強度
                if(json.has("motionStrength")) {
                    this.motionStrength = (float) json.getDouble("motionStrength");
                }
                // 載入圖片 (這裡假設 imagePath 是絕對路徑)
                if(!imagePath.isEmpty()) {
                    this.currentBitmap = BitmapFactory.decodeFile(imagePath);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @Override
        public void onVisibilityChanged(boolean visible) {
            this.visible = visible;
            if (visible) {
                // 開啟監聽 (省電關鍵：不顯示時就關掉)
                sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_GAME);
                handler.post(drawRunner);
            } else {
                // 關閉監聽 (Web 提到的 Pause on Power Save 原理類似)
                sensorManager.unregisterListener(this);
                handler.removeCallbacks(drawRunner);
            }
        }

        @Override
        public void onSensorChanged(SensorEvent event) {
            if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
                // 簡單模擬 Web 的陀螺儀邏輯
                // Web: panX + gyroX
                // Android: event.values[0] 是 X 軸加速
                xOffset = -event.values[0] * motionStrength * 10; 
                yOffset = event.values[1] * motionStrength * 10;
                draw();
            }
        }

        private void draw() {
            if (!visible || currentBitmap == null) return;
            
            Canvas canvas = holder.lockCanvas();
            if (canvas != null) {
                try {
                    // 1. 清空畫面
                    canvas.drawColor(Color.BLACK);
                    
                    // 2. 計算矩陣 (這就是 AI 提到的 Native 數學邏輯)
                    Matrix matrix = new Matrix();
                    float screenWidth = canvas.getWidth();
                    float screenHeight = canvas.getHeight();
                    
                    // 縮放 (Scale)
                    matrix.postScale(scale, scale, screenWidth / 2, screenHeight / 2);
                    
                    // 位移 (Translate = 基礎位置 + 陀螺儀偏移)
                    float centerX = (screenWidth - currentBitmap.getWidth()) / 2;
                    float centerY = (screenHeight - currentBitmap.getHeight()) / 2;
                    matrix.postTranslate(centerX + xOffset, centerY + yOffset);

                    // 3. 繪製
                    canvas.drawBitmap(currentBitmap, matrix, null);
                    
                } finally {
                    holder.unlockCanvasAndPost(canvas);
                }
            }
        }

        @Override
        public void onAccuracyChanged(Sensor sensor, int accuracy) {}
    }
}
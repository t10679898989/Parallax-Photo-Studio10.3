package com.myparallax.app; // ⚠️ 確認 package name

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
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
import android.os.Build;
import android.os.Handler;
import android.os.PowerManager;
import android.service.wallpaper.WallpaperService;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.SurfaceHolder;
import androidx.core.app.NotificationCompat;
import org.json.JSONObject;

import java.io.File;

public class ParallaxWallpaperService extends WallpaperService {

    @Override
    public Engine onCreateEngine() {
        return new ParallaxEngine();
    }

    private class ParallaxEngine extends Engine implements SensorEventListener {
        
        // 核心元件
        private final Handler handler = new Handler();
        private SensorManager sensorManager;
        private Sensor accelerometer;
        private GestureDetector gestureDetector;
        private SharedPreferences prefs;

        // 狀態變數
        private boolean visible = false;
        private boolean isPowerSaveMode = false;
        
        // 設定值 (從 JSON 讀取)
        private Bitmap currentBitmap;
        private float scale = 1.2f;
        private float panX = 0;
        private float panY = 0;
        private float motionStrength = 1.0f;
        private int targetFps = 60; // 預設 60 FPS
        private boolean runInBackground = false;
        private boolean pauseOnPowerSave = true;
        private boolean doubleTapToChange = false;

        // 繪圖數據
        private float gyroX = 0;
        private float gyroY = 0;
        private int screenWidth, screenHeight;

        // 接收 MainActivity 傳來的「更新訊號」
        private final BroadcastReceiver updateReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if ("com.myparallax.app.ACTION_UPDATE_WALLPAPER".equals(intent.getAction())) {
                    loadSettings(); // 收到訊號，立刻重新讀取設定
                }
            }
        };

        // 接收系統「省電模式」訊號
        private final BroadcastReceiver powerSaveReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    isPowerSaveMode = pm.isPowerSaveMode();
                    updateSensorState(); // 重新決定要不要開陀螺儀
                }
            }
        };

        // 繪圖迴圈 (FPS 控制器)
        private final Runnable drawRunner = new Runnable() {
            @Override
            public void run() {
                draw();
            }
        };

        @Override
        public void onCreate(SurfaceHolder surfaceHolder) {
            super.onCreate(surfaceHolder);

            // 1. 初始化感測器
            sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
            accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);

            // 2. 初始化 SharedPrefs
            prefs = getSharedPreferences("WallpaperPrefs", MODE_PRIVATE);

            // 3. 雙擊偵測 (Double Tap)
            gestureDetector = new GestureDetector(getApplicationContext(), new GestureDetector.SimpleOnGestureListener() {
                @Override
                public boolean onDoubleTap(MotionEvent e) {
                    if (doubleTapToChange) {
                        // TODO: 這裡可以實作切換下一張圖片 (需讀取播放清單)
                        // 目前先印個 Log 或是簡單的視覺回饋
                        System.out.println("Double Tap Detected!");
                    }
                    return true;
                }
            });

            // 4. 註冊廣播監聽 (監聽 Web 更新 & 省電模式)
            IntentFilter filter = new IntentFilter();
            filter.addAction("com.myparallax.app.ACTION_UPDATE_WALLPAPER"); // 必須跟 MainActivity 一樣
            filter.addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED);
            
            // Android 14+ 需要指定 Exported 旗標，這裡用簡易版相容寫法
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                registerReceiver(updateReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(updateReceiver, filter);
            }
            registerReceiver(powerSaveReceiver, new IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED));

            // 5. 初始載入
            loadSettings();
        }

        @Override
        public void onDestroy() {
            super.onDestroy();
            try {
                unregisterReceiver(updateReceiver);
                unregisterReceiver(powerSaveReceiver);
            } catch (Exception e) {
                // 忽略未註冊的錯誤
            }
            handler.removeCallbacks(drawRunner);
        }

        private void loadSettings() {
            String jsonStr = prefs.getString("settings_json", "{}");
            // 優先讀取獨立存的路徑，如果沒有才看 JSON
            String imagePath = prefs.getString("current_image_path", ""); 

            try {
                JSONObject json = new JSONObject(jsonStr);
                
                // 讀取各項參數 (加入安全檢查)
                if (json.has("scale")) scale = (float) json.getDouble("scale");
                if (json.has("motionStrength")) motionStrength = (float) json.getDouble("motionStrength");
                if (json.has("targetFps")) targetFps = json.getInt("targetFps");
                if (json.has("runInBackground")) runInBackground = json.getBoolean("runInBackground");
                if (json.has("pauseOnPowerSave")) pauseOnPowerSave = json.getBoolean("pauseOnPowerSave");
                if (json.has("doubleTapToChange")) doubleTapToChange = json.getBoolean("doubleTapToChange");

                // 如果 Web 有傳 path 進 JSON，覆蓋舊的
                if (json.has("path")) imagePath = json.getString("path");

                // 載入圖片
                if (!imagePath.isEmpty()) {
                    File imgFile = new File(imagePath);
                    if (imgFile.exists()) {
                        currentBitmap = BitmapFactory.decodeFile(imgFile.getAbsolutePath());
                    }
                }

                // 處理前台服務
                handleForegroundService();
                
                // 立即重繪
                draw();

            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        private void handleForegroundService() {
            if (runInBackground) {
                String CHANNEL_ID = "wallpaper_service_channel";
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Wallpaper Service", NotificationManager.IMPORTANCE_LOW);
                    getSystemService(NotificationManager.class).createNotificationChannel(channel);
                }
                // ⚠️ 注意：這裡需要一個小圖示，請確保 res/drawable 或 mipmap 有 ic_launcher
                Notification notification = new NotificationCompat.Builder(getApplicationContext(), CHANNEL_ID)
                        .setContentTitle("Parallax Wallpaper")
                        .setContentText("Running smoothly in background")
                        .setSmallIcon(android.R.drawable.ic_menu_gallery) 
                        .setPriority(NotificationCompat.PRIORITY_LOW)
                        .build();
                
                try {
                    startForeground(1, notification);
                } catch (Exception e) {
                    e.printStackTrace(); // 避免崩潰
                }
            } else {
                stopForeground(true);
            }
        }

        @Override
        public void onVisibilityChanged(boolean visible) {
            this.visible = visible;
            updateSensorState();
        }

        private void updateSensorState() {
            // 邏輯：可見 AND (不是省電模式 OR 設定說省電模式也要跑)
            boolean shouldRun = visible && (!isPowerSaveMode || !pauseOnPowerSave);

            if (shouldRun) {
                sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_GAME);
                handler.post(drawRunner);
            } else {
                sensorManager.unregisterListener(this);
                handler.removeCallbacks(drawRunner);
            }
        }

        @Override
        public void onTouchEvent(MotionEvent event) {
            if (gestureDetector != null) {
                gestureDetector.onTouchEvent(event);
            }
            super.onTouchEvent(event);
        }

        @Override
        public void onSensorChanged(SensorEvent event) {
            if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
                // 這裡只更新變數，不呼叫 draw()，讓 drawRunner 根據 FPS 控制繪圖頻率
                // 加上平滑係數 (Lerp) 效果會更好，這裡先用直接賦值
                gyroX = -event.values[0]; 
                gyroY = event.values[1];
            }
        }

        @Override
        public void onSurfaceChanged(SurfaceHolder holder, int format, int width, int height) {
            super.onSurfaceChanged(holder, format, width, height);
            this.screenWidth = width;
            this.screenHeight = height;
            draw();
        }

        private void draw() {
            if (currentBitmap == null || screenWidth == 0) return;
            
            SurfaceHolder holder = getSurfaceHolder();
            Canvas canvas = null;

            try {
                canvas = holder.lockCanvas();
                if (canvas != null) {
                    // 1. 清空畫布
                    canvas.drawColor(Color.BLACK);

                    // 2. 計算偏移
                    float baseRange = 30f; // 基礎移動範圍
                    float offsetX = (gyroX * baseRange * motionStrength);
                    float offsetY = (gyroY * baseRange * motionStrength);

                    // 3. 建立矩陣
                    Matrix matrix = new Matrix();
                    float centerX = (float) screenWidth / 2;
                    float centerY = (float) screenHeight / 2;
                    
                    // 先把圖片移動到螢幕中間
                    float imageCenterX = (screenWidth - currentBitmap.getWidth()) / 2f;
                    float imageCenterY = (screenHeight - currentBitmap.getHeight()) / 2f;
                    
                    // 縮放 (以螢幕中心為軸心)
                    matrix.postScale(scale, scale, centerX, centerY);
                    
                    // 移動
                    matrix.postTranslate(imageCenterX + offsetX, imageCenterY + offsetY);

                    // 4. 繪製
                    canvas.drawBitmap(currentBitmap, matrix, null);
                }
            } finally {
                if (canvas != null) holder.unlockCanvasAndPost(canvas);
            }

            // 5. FPS 控制 (關鍵！)
            handler.removeCallbacks(drawRunner);
            if (visible) {
                // 計算下一幀的時間 (例如 60FPS = 16ms)
                long delay = 1000 / Math.max(1, targetFps); 
                handler.postDelayed(drawRunner, delay);
            }
        }

        @Override
        public void onAccuracyChanged(Sensor sensor, int accuracy) {}
    }
}
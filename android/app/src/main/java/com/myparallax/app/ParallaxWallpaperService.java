package com.myparallax.app; // ⚠️ 確認 package 名稱是否正確

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
        private float scale = 1.2f; // 預設放大一點，才有空間移動
        private float manualPanX = 0; // 手動位移 (從編輯器來的)
        private float manualPanY = 0;
        private float motionStrength = 1.0f;
        private int targetFps = 60; 
        private boolean runInBackground = false;
        private boolean pauseOnPowerSave = true;

        // 🔥 平滑運算變數 (解決不絲滑問題)
        private float targetGyroX = 0;
        private float targetGyroY = 0;
        private float currentGyroX = 0;
        private float currentGyroY = 0;
        // 平滑係數 (0.01 ~ 1.0)，越小越滑但反應越慢，0.1 是一個不錯的平衡點
        private final float SMOOTHING_FACTOR = 0.1f; 

        private int screenWidth, screenHeight;

        // 接收 MainActivity 傳來的「更新訊號」
        private final BroadcastReceiver updateReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if ("com.myparallax.app.ACTION_UPDATE_WALLPAPER".equals(intent.getAction())) {
                    loadSettings(); 
                }
            }
        };

        private final BroadcastReceiver powerSaveReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    isPowerSaveMode = pm.isPowerSaveMode();
                    updateSensorState(); 
                }
            }
        };

        private final Runnable drawRunner = new Runnable() {
            @Override
            public void run() {
                draw();
            }
        };

        @Override
        public void onCreate(SurfaceHolder surfaceHolder) {
            super.onCreate(surfaceHolder);

            sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
            accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            prefs = getSharedPreferences("WallpaperPrefs", MODE_PRIVATE);

            // 雙擊偵測 (預留功能)
            gestureDetector = new GestureDetector(getApplicationContext(), new GestureDetector.SimpleOnGestureListener() {
                @Override
                public boolean onDoubleTap(MotionEvent e) {
                    // TODO: 這裡可以實作雙擊換圖
                    return true;
                }
            });

            // 註冊廣播
            IntentFilter filter = new IntentFilter();
            filter.addAction("com.myparallax.app.ACTION_UPDATE_WALLPAPER");
            filter.addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED);
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                registerReceiver(updateReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(updateReceiver, filter);
            }
            registerReceiver(powerSaveReceiver, new IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED));

            // 初始載入
            loadSettings();
        }

        @Override
        public void onDestroy() {
            super.onDestroy();
            try {
                unregisterReceiver(updateReceiver);
                unregisterReceiver(powerSaveReceiver);
            } catch (Exception e) {}
            handler.removeCallbacks(drawRunner);
        }

        private void loadSettings() {
            String jsonStr = prefs.getString("settings_json", "{}");
            String imagePath = prefs.getString("current_image_path", ""); 

            try {
                JSONObject json = new JSONObject(jsonStr);
                
                if (json.has("scale")) scale = (float) json.getDouble("scale");
                if (json.has("motionStrength")) motionStrength = (float) json.getDouble("motionStrength");
                if (json.has("panX")) manualPanX = (float) json.getDouble("panX");
                if (json.has("panY")) manualPanY = (float) json.getDouble("panY");
                if (json.has("targetFps")) targetFps = json.getInt("targetFps");
                
                // 讀取圖片
                if (!imagePath.isEmpty()) {
                    File imgFile = new File(imagePath);
                    if (imgFile.exists()) {
                        // 釋放舊的記憶體
                        if (currentBitmap != null && !currentBitmap.isRecycled()) {
                            currentBitmap.recycle();
                        }
                        currentBitmap = BitmapFactory.decodeFile(imgFile.getAbsolutePath());
                    }
                }

                // 重置位置，避免切換圖片時跳動
                targetGyroX = 0; targetGyroY = 0;
                currentGyroX = 0; currentGyroY = 0;

                handleForegroundService();
                
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        private void handleForegroundService() {
            // (保持原本的前台服務邏輯不變)
        }

        @Override
        public void onVisibilityChanged(boolean visible) {
            this.visible = visible;
            if (visible) {
                loadSettings(); // 每次顯示都重讀設定 (解決預覽黑畫面)
                updateSensorState();
            } else {
                updateSensorState();
            }
        }

        private void updateSensorState() {
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
            if (gestureDetector != null) gestureDetector.onTouchEvent(event);
            super.onTouchEvent(event);
        }

        @Override
        public void onSensorChanged(SensorEvent event) {
            if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
                // 這裡只更新「目標值」，不直接更新「現在值」
                // 負號是為了讓移動方向跟手指滑動感覺一致 (Parallax 效果)
                targetGyroX = -event.values[0]; 
                targetGyroY = event.values[1];
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
            SurfaceHolder holder = getSurfaceHolder();
            Canvas canvas = null;

            try {
                canvas = holder.lockCanvas();
                if (canvas != null) {
                    if (currentBitmap == null) {
                        loadSettings(); // 最後防線
                    }
                    if (currentBitmap == null) {
                        canvas.drawColor(Color.BLACK);
                        return;
                    }

                    // 1. 🔥 平滑運算 (Lerp) - 解決不絲滑問題
                    // 公式：現在位置 += (目標位置 - 現在位置) * 平滑係數
                    currentGyroX += (targetGyroX - currentGyroX) * SMOOTHING_FACTOR;
                    currentGyroY += (targetGyroY - currentGyroY) * SMOOTHING_FACTOR;

                    // 清空畫布
                    canvas.drawColor(Color.BLACK);

                    // 2. 計算基礎位移 (陀螺儀 + 手動調整)
                    // baseRange = 30f 是一個經驗值，控制移動幅度
                    float offsetX = (currentGyroX * 30f * motionStrength) + manualPanX;
                    float offsetY = (currentGyroY * 30f * motionStrength) + manualPanY;

                    // 3. 🔥 邊界檢查 (Clamping) - 解決黑框問題
                    // 計算圖片放大後，比螢幕多出來的空間 (溢出量)
                    float scaledImageWidth = currentBitmap.getWidth() * scale;
                    float scaledImageHeight = currentBitmap.getHeight() * scale;
                    
                    // X 和 Y 軸允許的最大移動距離 (超過這個距離就會露出黑底)
                    // 除以 2 是因為這些空間是分佈在圖片的左右/上下兩邊
                    float maxOffsetX = Math.max(0, (scaledImageWidth - screenWidth) / 2f);
                    float maxOffsetY = Math.max(0, (scaledImageHeight - screenHeight) / 2f);

                    // 強制把位移限制在 [-max, +max] 之間
                    offsetX = Math.max(-maxOffsetX, Math.min(offsetX, maxOffsetX));
                    offsetY = Math.max(-maxOffsetY, Math.min(offsetY, maxOffsetY));

                    // 4. 建立矩陣並繪圖
                    Matrix matrix = new Matrix();
                    float centerX = (float) screenWidth / 2;
                    float centerY = (float) screenHeight / 2;
                    
                    // 將圖片移動到螢幕中心
                    float imageCenterX = (screenWidth - currentBitmap.getWidth()) / 2f;
                    float imageCenterY = (screenHeight - currentBitmap.getHeight()) / 2f;
                    
                    // 縮放 (以螢幕中心為軸心)
                    matrix.postScale(scale, scale, centerX, centerY);
                    
                    // 移動 (加上限制過的偏移量)
                    matrix.postTranslate(imageCenterX + offsetX, imageCenterY + offsetY);

                    canvas.drawBitmap(currentBitmap, matrix, null);
                }
            } finally {
                if (canvas != null) holder.unlockCanvasAndPost(canvas);
            }

            // FPS 控制
            handler.removeCallbacks(drawRunner);
            if (visible) {
                long delay = 1000 / Math.max(1, targetFps); 
                handler.postDelayed(drawRunner, delay);
            }
        }

        @Override
        public void onAccuracyChanged(Sensor sensor, int accuracy) {}
    }
}
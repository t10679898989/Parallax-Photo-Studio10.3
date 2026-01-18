package com.myparallax.app; // ⚠️ 請確認這行跟你的 AndroidManifest package 一樣

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
        
        // --- 核心變數 ---
        private final Handler handler = new Handler();
        private SensorManager sensorManager;
        private Sensor accelerometer;
        private GestureDetector gestureDetector;
        private SharedPreferences prefs;

        // --- 狀態控制 ---
        private boolean visible = false;
        private boolean isPowerSaveMode = false;
        
        // --- 用戶設定 (從 JSON 讀取) ---
        private Bitmap currentBitmap;
        private float userScale = 1.0f; // 用戶在 App 裡設定的縮放 (1.0 ~ 3.0)
        private float manualPanX = 0;   // 用戶手動拖曳的 X
        private float manualPanY = 0;   // 用戶手動拖曳的 Y
        private float motionStrength = 1.0f;
        private int targetFps = 60; 
        private boolean runInBackground = false;
        private boolean pauseOnPowerSave = true;
        
        // --- 螢幕尺寸 ---
        private int screenWidth = 0;
        private int screenHeight = 0;

        // --- 平滑運算 (Smoothing / Lerp) ---
        private float targetGyroX = 0;
        private float targetGyroY = 0;
        private float currentGyroX = 0;
        private float currentGyroY = 0;
        // 平滑係數：數值越小越滑順但反應越慢，0.1f 是最佳平衡點
        private final float SMOOTHING_FACTOR = 0.1f; 

        // --- 廣播接收器 (接收 App 設定更新) ---
        private final BroadcastReceiver updateReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if ("com.myparallax.app.ACTION_UPDATE_WALLPAPER".equals(intent.getAction())) {
                    loadSettings(); // 收到訊號，立刻重讀設定
                }
            }
        };

        // --- 廣播接收器 (省電模式監聽) ---
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

        // --- 繪圖迴圈 ---
        private final Runnable drawRunner = new Runnable() {
            @Override
            public void run() {
                draw();
            }
        };

        @Override
        public void onCreate(SurfaceHolder surfaceHolder) {
            super.onCreate(surfaceHolder);

            // 1. 初始化系統服務
            sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
            accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            prefs = getSharedPreferences("WallpaperPrefs", MODE_PRIVATE);

            // 2. 初始化手勢 (預留雙擊功能)
            gestureDetector = new GestureDetector(getApplicationContext(), new GestureDetector.SimpleOnGestureListener() {
                @Override
                public boolean onDoubleTap(MotionEvent e) {
                    // 未來可在這裡加入換圖邏輯
                    return true;
                }
            });

            // 3. 註冊廣播
            IntentFilter filter = new IntentFilter();
            filter.addAction("com.myparallax.app.ACTION_UPDATE_WALLPAPER");
            filter.addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED);
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                registerReceiver(updateReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(updateReceiver, filter);
            }
            registerReceiver(powerSaveReceiver, new IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED));

            // 4. 載入初始設定
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

        // 讀取 SharedPrefs 與 JSON 設定
        private void loadSettings() {
            String jsonStr = prefs.getString("settings_json", "{}");
            String imagePath = prefs.getString("current_image_path", ""); 

            try {
                JSONObject json = new JSONObject(jsonStr);
                
                // 讀取數值 (加入防呆預設值)
                if (json.has("scale")) userScale = (float) json.getDouble("scale");
                if (json.has("motionStrength")) motionStrength = (float) json.getDouble("motionStrength");
                if (json.has("panX")) manualPanX = (float) json.getDouble("panX");
                if (json.has("panY")) manualPanY = (float) json.getDouble("panY");
                if (json.has("targetFps")) targetFps = json.optInt("targetFps", 60);
                if (json.has("runInBackground")) runInBackground = json.optBoolean("runInBackground", false);
                if (json.has("pauseOnPowerSave")) pauseOnPowerSave = json.optBoolean("pauseOnPowerSave", true);

                // 讀取圖片
                if (!imagePath.isEmpty()) {
                    File imgFile = new File(imagePath);
                    if (imgFile.exists()) {
                        // 釋放舊圖記憶體
                        if (currentBitmap != null && !currentBitmap.isRecycled()) {
                            currentBitmap.recycle();
                        }
                        // 載入新圖
                        currentBitmap = BitmapFactory.decodeFile(imgFile.getAbsolutePath());
                    }
                }

                // 重置陀螺儀位置，避免換圖時畫面跳動
                targetGyroX = 0; targetGyroY = 0;
                currentGyroX = 0; currentGyroY = 0;

                // 處理前台服務通知
                handleForegroundService();
                
                // 立即重繪
                if (visible) draw();

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
                Notification notification = new NotificationCompat.Builder(getApplicationContext(), CHANNEL_ID)
                        .setContentTitle("Parallax Wallpaper")
                        .setContentText("Running in background")
                        .setSmallIcon(android.R.drawable.ic_menu_gallery) 
                        .setPriority(NotificationCompat.PRIORITY_LOW)
                        .build();
                try {
                    startForeground(1, notification);
                } catch (Exception e) {}
            } else {
                stopForeground(true);
            }
        }

        @Override
        public void onVisibilityChanged(boolean visible) {
            this.visible = visible;
            if (visible) {
                loadSettings(); // 每次顯示都確保設定是最新的
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
                // 讀取加速規數值
                // 負號是為了校正方向，讓背景移動符合視差邏輯 (手機往左傾，背景往右移)
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

        // 🔥🔥🔥 核心繪圖邏輯 (WYSIWYG 修正版) 🔥🔥🔥
        private void draw() {
            SurfaceHolder holder = getSurfaceHolder();
            Canvas canvas = null;

            try {
                canvas = holder.lockCanvas();
                if (canvas != null) {
                    // 安全檢查：沒圖就重讀，還是沒圖就畫黑底
                    if (currentBitmap == null || currentBitmap.isRecycled()) {
                        loadSettings();
                    }
                    if (currentBitmap == null) {
                        canvas.drawColor(Color.BLACK);
                        return;
                    }
                    if (screenWidth == 0 || screenHeight == 0) return;

                    // --- 步驟 1: 計算基礎填滿 (Base Scale / Aspect Fill) ---
                    // 找出能讓圖片「剛好完全覆蓋螢幕」的最小縮放比例
                    // 這是為了達到 CSS object-fit: cover 的效果
                    float widthRatio = (float) screenWidth / currentBitmap.getWidth();
                    float heightRatio = (float) screenHeight / currentBitmap.getHeight();
                    float baseScale = Math.max(widthRatio, heightRatio);

                    // --- 步驟 2: 計算總縮放 (Total Scale) ---
                    // 總縮放 = 基礎填滿 * 用戶設定的放大倍率
                    float totalScale = baseScale * this.userScale;

                    // --- 步驟 3: 計算在該縮放下的圖片實際尺寸 ---
                    float scaledImageWidth = currentBitmap.getWidth() * totalScale;
                    float scaledImageHeight = currentBitmap.getHeight() * totalScale;

                    // --- 步驟 4: 計算安全邊界 (Max Clamp Limit) ---
                    // 計算圖片比螢幕多出來的寬高的一半
                    // 這是我們允許移動的最大極限，超過這裡就會露出黑底
                    float maxDx = (scaledImageWidth - screenWidth) / 2f;
                    float maxDy = (scaledImageHeight - screenHeight) / 2f;

                    // --- 步驟 5: 平滑運算 (Lerp) ---
                    // 讓數值慢慢接近目標，消除抖動
                    currentGyroX += (targetGyroX - currentGyroX) * SMOOTHING_FACTOR;
                    currentGyroY += (targetGyroY - currentGyroY) * SMOOTHING_FACTOR;

                    // --- 步驟 6: 計算總位移 (Total Offset) ---
                    // 總位移 = (手動平移 * 基礎縮放) + (陀螺儀 * 強度 * 30)
                    // manualPan 乘上 baseScale 是為了讓 App 端的像素單位跟這裡對齊
                    float totalOffsetX = (manualPanX * baseScale) + (currentGyroX * 30f * motionStrength);
                    float totalOffsetY = (manualPanY * baseScale) + (currentGyroY * 30f * motionStrength);

                    // --- 步驟 7: 絕對邊界限制 (Hard Clamp) ---
                    // 將位移強制鎖死在 [-max, +max] 之間
                    float finalOffsetX = Math.max(-maxDx, Math.min(totalOffsetX, maxDx));
                    float finalOffsetY = Math.max(-maxDy, Math.min(totalOffsetY, maxDy));

                    // --- 步驟 8: 繪製 ---
                    canvas.drawColor(Color.BLACK); // 清底

                    Matrix matrix = new Matrix();
                    
                    // A. 將圖片中心移到 (0,0)
                    matrix.postTranslate(-currentBitmap.getWidth() / 2f, -currentBitmap.getHeight() / 2f);
                    
                    // B. 執行縮放
                    matrix.postScale(totalScale, totalScale);
                    
                    // C. 移回螢幕中心 + 加上最終位移
                    matrix.postTranslate((screenWidth / 2f) + finalOffsetX, (screenHeight / 2f) + finalOffsetY);

                    canvas.drawBitmap(currentBitmap, matrix, null);
                }
            } catch (Exception e) {
                e.printStackTrace();
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
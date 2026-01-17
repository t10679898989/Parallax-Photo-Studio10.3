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
        
        private final Handler handler = new Handler();
        private SensorManager sensorManager;
        private Sensor accelerometer;
        private GestureDetector gestureDetector;
        private SharedPreferences prefs;

        private boolean visible = false;
        private boolean isPowerSaveMode = false;
        
        private Bitmap currentBitmap;
        private float scale = 1.2f;
        private float motionStrength = 1.0f;
        private int targetFps = 60;
        private boolean runInBackground = false;
        private boolean pauseOnPowerSave = true;
        private boolean doubleTapToChange = false;

        private float gyroX = 0;
        private float gyroY = 0;
        private int screenWidth, screenHeight;

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

            gestureDetector = new GestureDetector(getApplicationContext(), new GestureDetector.SimpleOnGestureListener() {
                @Override
                public boolean onDoubleTap(MotionEvent e) {
                    if (doubleTapToChange) System.out.println("Double Tap!");
                    return true;
                }
            });

            IntentFilter filter = new IntentFilter();
            filter.addAction("com.myparallax.app.ACTION_UPDATE_WALLPAPER");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                registerReceiver(updateReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(updateReceiver, filter);
            }
            registerReceiver(powerSaveReceiver, new IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED));

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

        @Override
        public void onVisibilityChanged(boolean visible) {
            this.visible = visible;
            if (visible) {
                loadSettings(); // 強制重讀
                updateSensorState();
            } else {
                updateSensorState();
            }
        }

        private void loadSettings() {
            String jsonStr = prefs.getString("settings_json", "{}");
            // 這是最重要的路徑，由 MainActivity 複製進來的安全路徑
            String imagePath = prefs.getString("current_image_path", ""); 

            try {
                JSONObject json = new JSONObject(jsonStr);
                
                if (json.has("scale")) scale = (float) json.getDouble("scale");
                if (json.has("motionStrength")) motionStrength = (float) json.getDouble("motionStrength");
                if (json.has("targetFps")) targetFps = json.getInt("targetFps");
                if (json.has("runInBackground")) runInBackground = json.getBoolean("runInBackground");
                if (json.has("pauseOnPowerSave")) pauseOnPowerSave = json.getBoolean("pauseOnPowerSave");
                if (json.has("doubleTapToChange")) doubleTapToChange = json.getBoolean("doubleTapToChange");
                
                // ⚠️ 移除 JSON 路徑覆蓋，只信任 MainActivity 傳來的安全路徑
                // if (json.has("path")) imagePath = json.getString("path"); <--- 刪掉這行

                if (!imagePath.isEmpty()) {
                    File imgFile = new File(imagePath);
                    if (imgFile.exists()) {
                        // 嘗試解碼圖片
                        currentBitmap = BitmapFactory.decodeFile(imgFile.getAbsolutePath());
                    } else {
                        System.out.println("Image file not found: " + imagePath);
                    }
                }

                handleForegroundService();
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
            SurfaceHolder holder = getSurfaceHolder();
            Canvas canvas = null;

            try {
                canvas = holder.lockCanvas();
                if (canvas != null) {
                    // 1. 最後防線：如果圖片是空的
                    if (currentBitmap == null) {
                        loadSettings(); // 再試一次
                    }

                    // 🔥 2. 除錯模式：如果還是空的，畫成【深藍色】
                    // 這樣你就能區分是「程式沒跑(全黑)」還是「讀不到圖(全藍)」
                    if (currentBitmap == null) {
                        canvas.drawColor(Color.BLUE); 
                        return;
                    }

                    // 3. 正常繪圖：先清空
                    canvas.drawColor(Color.BLACK);

                    // 計算與繪製
                    float baseRange = 30f; 
                    float offsetX = (gyroX * baseRange * motionStrength);
                    float offsetY = (gyroY * baseRange * motionStrength);

                    Matrix matrix = new Matrix();
                    float centerX = (float) screenWidth / 2;
                    float centerY = (float) screenHeight / 2;
                    
                    float imageCenterX = (screenWidth - currentBitmap.getWidth()) / 2f;
                    float imageCenterY = (screenHeight - currentBitmap.getHeight()) / 2f;
                    
                    matrix.postScale(scale, scale, centerX, centerY);
                    matrix.postTranslate(imageCenterX + offsetX, imageCenterY + offsetY);

                    canvas.drawBitmap(currentBitmap, matrix, null);
                }
            } finally {
                if (canvas != null) holder.unlockCanvasAndPost(canvas);
            }

            // 5. FPS 控制
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
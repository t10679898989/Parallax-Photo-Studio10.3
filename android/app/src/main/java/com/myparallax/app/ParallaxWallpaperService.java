package com.myparallax.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
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
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

public class ParallaxWallpaperService extends WallpaperService {

    @Override
    public Engine onCreateEngine() {
        return new ParallaxEngine();
    }

    private class ParallaxEngine extends Engine implements SensorEventListener {
        
        // --- 核心元件 ---
        private final Handler handler = new Handler();
        private final Handler playlistHandler = new Handler(); 
        private SensorManager sensorManager;
        private Sensor accelerometer;
        private GestureDetector gestureDetector;
        private SharedPreferences prefs;

        // --- 狀態 ---
        private boolean visible = false;
        private boolean isPowerSaveMode = false;
        
        // --- 設定 (單張模式) ---
        private Bitmap currentBitmap;
        private float userScale = 1.0f;
        private float manualPanX = 0;
        private float manualPanY = 0;
        
        // --- 設定 (播放清單模式) ---
        private boolean isPlaylistMode = false;
        private List<String> playlistPaths = new ArrayList<>();
        private int playlistInterval = 60; // 秒
        private int currentPlaylistIndex = 0;
        
        // --- 通用設定 ---
        private float motionStrength = 1.0f;
        private int targetFps = 60; 
        private boolean runInBackground = false;
        private boolean pauseOnPowerSave = true;
        private boolean doubleTapToChange = false;
        private boolean motionEnabled = true; // 🔥 新增：動態開關

        // --- 平滑運算 ---
        private int screenWidth = 0, screenHeight = 0;
        private float targetGyroX = 0, targetGyroY = 0;
        private float currentGyroX = 0, currentGyroY = 0;
        private final float SMOOTHING_FACTOR = 0.1f; 

        // --- 廣播 ---
        private final BroadcastReceiver updateReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if ("com.myparallax.app.ACTION_UPDATE_WALLPAPER".equals(action)) {
                    loadSettings();
                } else if ("com.myparallax.app.ACTION_UPDATE_NOTIFICATION".equals(action)) {
                    // 更新通知欄文字
                    String status = intent.getStringExtra("status");
                    updateNotificationText(status);
                }
            }
        };

        private final BroadcastReceiver powerSaveReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    boolean newState = pm.isPowerSaveMode();
                    if (isPowerSaveMode != newState) {
                        isPowerSaveMode = newState;
                        updateSensorState();
                        // 通知 Web 端
                        notifyWebPowerSaveState(isPowerSaveMode);
                    }
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

        // --- 輪播計時任務 ---
        private final Runnable playlistRunner = new Runnable() {
            @Override
            public void run() {
                if (visible && isPlaylistMode && playlistPaths.size() > 1) {
                    loadNextImage();
                    playlistHandler.postDelayed(this, playlistInterval * 1000L);
                }
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
                    if (doubleTapToChange && isPlaylistMode && playlistPaths.size() > 1) {
                        loadNextImage();
                        playlistHandler.removeCallbacks(playlistRunner);
                        playlistHandler.postDelayed(playlistRunner, playlistInterval * 1000L);
                        return true;
                    }
                    return super.onDoubleTap(e);
                }
            });

            IntentFilter filter = new IntentFilter();
            filter.addAction("com.myparallax.app.ACTION_UPDATE_WALLPAPER");
            filter.addAction("com.myparallax.app.ACTION_UPDATE_NOTIFICATION"); // 新增通知更新廣播
            filter.addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED);
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                registerReceiver(updateReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(updateReceiver, filter);
            }
            registerReceiver(powerSaveReceiver, new IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED));

            // 初始檢查省電模式
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) isPowerSaveMode = pm.isPowerSaveMode();

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
            playlistHandler.removeCallbacks(playlistRunner);
        }

        private void loadSettings() {
            String jsonStr = prefs.getString("settings_json", "{}");
            String singleImagePath = prefs.getString("current_image_path", ""); 

            try {
                JSONObject json = new JSONObject(jsonStr);
                
                if (json.has("scale")) userScale = (float) json.getDouble("scale");
                if (json.has("motionStrength")) motionStrength = (float) json.getDouble("motionStrength");
                if (json.has("motionEnabled")) motionEnabled = json.optBoolean("motionEnabled", true); // 🔥 讀取開關
                
                if (json.has("panX")) manualPanX = (float) json.getDouble("panX");
                if (json.has("panY")) manualPanY = (float) json.getDouble("panY");
                if (json.has("targetFps")) targetFps = json.optInt("targetFps", 60);
                if (json.has("runInBackground")) runInBackground = json.optBoolean("runInBackground", false);
                if (json.has("pauseOnPowerSave")) pauseOnPowerSave = json.optBoolean("pauseOnPowerSave", true);
                if (json.has("doubleTapToChange")) doubleTapToChange = json.optBoolean("doubleTapToChange", false);

                String mode = json.optString("mode", "single");
                isPlaylistMode = "playlist".equals(mode);

                if (isPlaylistMode) {
                    playlistInterval = json.optInt("interval", 60);
                    if (playlistInterval < 5) playlistInterval = 5;

                    playlistPaths.clear();
                    JSONArray paths = json.optJSONArray("playlist");
                    if (paths != null) {
                        for (int i = 0; i < paths.length(); i++) {
                            playlistPaths.add(paths.getString(i));
                        }
                    }
                    
                    if (currentBitmap == null && !playlistPaths.isEmpty()) {
                        currentPlaylistIndex = 0;
                        loadImage(playlistPaths.get(0));
                    }
                    
                    if (visible) {
                        playlistHandler.removeCallbacks(playlistRunner);
                        playlistHandler.postDelayed(playlistRunner, playlistInterval * 1000L);
                    }

                } else {
                    playlistHandler.removeCallbacks(playlistRunner); 
                    if (!singleImagePath.isEmpty()) {
                        loadImage(singleImagePath);
                    }
                }

                targetGyroX = 0; targetGyroY = 0;
                currentGyroX = 0; currentGyroY = 0;
                
                handleForegroundService();
                
                if (visible) {
                    // 強制重繪一次，確保設定生效
                    handler.removeCallbacks(drawRunner);
                    handler.post(drawRunner);
                }

            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        private void loadNextImage() {
            if (playlistPaths.isEmpty()) return;
            
            currentPlaylistIndex++;
            if (currentPlaylistIndex >= playlistPaths.size()) {
                currentPlaylistIndex = 0;
            }
            
            String nextPath = playlistPaths.get(currentPlaylistIndex);
            loadImage(nextPath);
            
            targetGyroX = 0; targetGyroY = 0;
            currentGyroX = 0; currentGyroY = 0;
        }

        private void loadImage(String path) {
            try {
                File imgFile = new File(path);
                if (imgFile.exists()) {
                    Bitmap newBitmap = BitmapFactory.decodeFile(imgFile.getAbsolutePath());
                    if (newBitmap != null) {
                        if (currentBitmap != null && !currentBitmap.isRecycled()) {
                            currentBitmap.recycle();
                        }
                        currentBitmap = newBitmap;
                    }
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        private void handleForegroundService() {
            if (runInBackground) {
                updateNotificationText("Active");
            } else {
                stopForeground(true);
            }
        }

        private void updateNotificationText(String status) {
            if (!runInBackground) return;

            String CHANNEL_ID = "wallpaper_service_channel";
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Wallpaper Service", NotificationManager.IMPORTANCE_LOW);
                getSystemService(NotificationManager.class).createNotificationChannel(channel);
            }
            
            Intent intent = new Intent(getApplicationContext(), MainActivity.class);
            PendingIntent pendingIntent = PendingIntent.getActivity(getApplicationContext(), 0, intent, PendingIntent.FLAG_IMMUTABLE);

            Notification notification = new NotificationCompat.Builder(getApplicationContext(), CHANNEL_ID)
                    .setContentTitle("Parallax Wallpaper")
                    .setContentText(status.equals("paused") ? "Paused (Power Save)" : "Running")
                    .setSmallIcon(android.R.drawable.ic_menu_gallery)
                    .setContentIntent(pendingIntent)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setOngoing(true)
                    .build();
            
            try {
                startForeground(1, notification);
            } catch (Exception e) {}
        }

        // 🔥 通知 Web 端省電模式變更
        private void notifyWebPowerSaveState(boolean active) {
             // 這裡我們只更新 sensor 狀態，Web 端會透過 SettingsService 的輪詢或事件機制得知
             // 更好的做法是發送廣播給 MainActivity，由它呼叫 WebView
             // 但為了簡化，我們主要依賴 Native 端的行為控制
        }

        @Override
        public void onVisibilityChanged(boolean visible) {
            this.visible = visible;
            if (visible) {
                loadSettings(); 
                updateSensorState();
                
                if (isPlaylistMode) {
                    playlistHandler.removeCallbacks(playlistRunner);
                    playlistHandler.postDelayed(playlistRunner, playlistInterval * 1000L);
                }
            } else {
                updateSensorState();
                playlistHandler.removeCallbacks(playlistRunner);
            }
        }

        private void updateSensorState() {
            boolean shouldRun = visible && (!isPowerSaveMode || !pauseOnPowerSave);

            if (shouldRun) {
                sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_GAME);
                handler.removeCallbacks(drawRunner);
                handler.post(drawRunner); // 🔥 確保立即啟動繪圖
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
                    if (currentBitmap == null || currentBitmap.isRecycled()) {
                        canvas.drawColor(Color.BLACK);
                        return;
                    }
                    if (screenWidth == 0 || screenHeight == 0) return;

                    float widthRatio = (float) screenWidth / currentBitmap.getWidth();
                    float heightRatio = (float) screenHeight / currentBitmap.getHeight();
                    float baseScale = Math.max(widthRatio, heightRatio);

                    float totalScale = baseScale * this.userScale;

                    float scaledImageWidth = currentBitmap.getWidth() * totalScale;
                    float scaledImageHeight = currentBitmap.getHeight() * totalScale;

                    float maxDx = (scaledImageWidth - screenWidth) / 2f;
                    float maxDy = (scaledImageHeight - screenHeight) / 2f;

                    // 🔥 Motion 邏輯修正：如果強度 <= 0 或未開啟，直接歸零
                    if (motionEnabled && motionStrength > 0) {
                        currentGyroX += (targetGyroX - currentGyroX) * SMOOTHING_FACTOR;
                        currentGyroY += (targetGyroY - currentGyroY) * SMOOTHING_FACTOR;
                    } else {
                        currentGyroX = 0;
                        currentGyroY = 0;
                    }

                    float totalOffsetX = manualPanX + (currentGyroX * 30f * motionStrength);
                    float totalOffsetY = manualPanY + (currentGyroY * 30f * motionStrength);

                    float finalOffsetX = Math.max(-maxDx, Math.min(totalOffsetX, maxDx));
                    float finalOffsetY = Math.max(-maxDy, Math.min(totalOffsetY, maxDy));

                    canvas.drawColor(Color.BLACK); 

                    Matrix matrix = new Matrix();
                    matrix.postTranslate(-currentBitmap.getWidth() / 2f, -currentBitmap.getHeight() / 2f);
                    matrix.postScale(totalScale, totalScale);
                    matrix.postTranslate((screenWidth / 2f) + finalOffsetX, (screenHeight / 2f) + finalOffsetY);

                    canvas.drawBitmap(currentBitmap, matrix, null);
                }
            } catch (Exception e) {
                e.printStackTrace();
            } finally {
                if (canvas != null) holder.unlockCanvasAndPost(canvas);
            }

            handler.removeCallbacks(drawRunner);
            // 只有在可見且非省電暫停狀態下才繼續繪圖
            boolean shouldAnimate = visible && (!isPowerSaveMode || !pauseOnPowerSave);
            
            if (shouldAnimate) {
                long delay = 1000 / Math.max(1, targetFps); 
                handler.postDelayed(drawRunner, delay);
            }
        }

        @Override
        public void onAccuracyChanged(Sensor sensor, int accuracy) {}
    }
}
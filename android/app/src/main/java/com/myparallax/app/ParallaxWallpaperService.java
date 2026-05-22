package com.myparallax.app;

import android.app.KeyguardManager;
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

    private static final String CHANNEL_ID = "wallpaper_service_channel";
    private static final int NOTIFICATION_ID = 1;

    @Override
    public Engine onCreateEngine() {
        return new ParallaxEngine();
    }

    private static class PhotoConfig {
        float motionStrength = 1.0f;
        boolean motionEnabled = true;
        float scale = 1.0f;
        float panX = 0f;
        float panY = 0f;
        // 🔥 [新合約] 儲存網頁端精確計算出的相對比例百分比
        float ratioX = 0f;
        float ratioY = 0f;
        boolean hasRatio = false; 
    }

    private class ParallaxEngine extends Engine implements SensorEventListener {
        
        private final Handler handler = new Handler();
        private final Handler playlistHandler = new Handler(); 
        private SensorManager sensorManager;
        private Sensor accelerometer;
        private GestureDetector gestureDetector;
        private SharedPreferences prefs;
        private KeyguardManager keyguardManager;

        private boolean visible = false;
        private boolean isPowerSaveMode = false;
        private boolean isLocked = false;
        private String currentNotificationStatus = "Active";
        
        private Bitmap currentBitmap;
        private float userScale = 1.0f;
        
        // 舊合約絕對像素欄位 (留作向下相容備援)
        private float manualPanX = 0;
        private float manualPanY = 0;
        
        // 🔥 [新合約] 當前照片使用的相對比例與判斷標記
        private float manualPanRatioX = 0;
        private float manualPanRatioY = 0;
        private boolean currentHasRatio = false;
        
        private boolean isPlaylistMode = false;

        private List<String> homePlaylistPaths = new ArrayList<>();
        private List<PhotoConfig> homePlaylistConfigs = new ArrayList<>();
        private int homePlaylistIndex = 0;
        private int homeInterval = 60; 

        private List<String> lockPlaylistPaths = new ArrayList<>();
        private List<PhotoConfig> lockPlaylistConfigs = new ArrayList<>();
        private int lockPlaylistIndex = 0;
        private int lockInterval = 60; 

        private List<String> currentPlaylistPaths; 
        private List<PhotoConfig> currentPlaylistConfigs;
        private int currentPlaylistIndex = 0;

        private int currentInterval = 60; 
        
        private float globalMotionStrength = 1.0f; 
        private float currentMotionStrength = 1.0f; 
        private int targetFps = 60; 
        private boolean runInBackground = false;
        private boolean pauseOnPowerSave = true;
        private boolean doubleTapToChange = false;
        private boolean globalMotionEnabled = true; 
        private boolean currentMotionEnabled = true; 

        private int screenWidth = 0, screenHeight = 0;
        private float targetGyroX = 0, targetGyroY = 0;
        private float currentGyroX = 0, currentGyroY = 0;
        private final float SMOOTHING_FACTOR = 0.1f; 

        private final BroadcastReceiver updateReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if ("com.myparallax.app.ACTION_UPDATE_WALLPAPER".equals(action)) {
                    loadSettings();
                } else if ("com.myparallax.app.ACTION_UPDATE_NOTIFICATION".equals(action)) {
                    String status = intent.getStringExtra("status");
                    updateNotificationText(status);
                } else if (Intent.ACTION_USER_PRESENT.equals(action) || 
                           Intent.ACTION_SCREEN_OFF.equals(action) || 
                           Intent.ACTION_SCREEN_ON.equals(action)) {
                    checkLockState();
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
                        if (isPowerSaveMode && pauseOnPowerSave) {
                            updateNotificationText("paused");
                        } else {
                            updateNotificationText("active");
                        }
                    }
                }
            }
        };

        private final Runnable drawRunner = new Runnable() {
            @Override
            public void run() {
                draw();
            }
        };

        private final Runnable playlistRunner = new Runnable() {
            @Override
            public void run() {
                if (visible && isPlaylistMode && currentPlaylistPaths != null && currentPlaylistPaths.size() > 1) {
                    loadNextImage();
                    playlistHandler.postDelayed(this, currentInterval * 1000L);
                }
            }
        };

        @Override
        public void onCreate(SurfaceHolder surfaceHolder) {
            super.onCreate(surfaceHolder);

            sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
            accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            keyguardManager = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            prefs = getSharedPreferences("WallpaperPrefs", MODE_PRIVATE);

            currentPlaylistPaths = homePlaylistPaths;
            currentPlaylistConfigs = homePlaylistConfigs;

            gestureDetector = new GestureDetector(getApplicationContext(), new GestureDetector.SimpleOnGestureListener() {
                @Override
                public boolean onDoubleTap(MotionEvent e) {
                    if (doubleTapToChange && isPlaylistMode && currentPlaylistPaths != null && currentPlaylistPaths.size() > 1) {
                        loadNextImage();
                        playlistHandler.removeCallbacks(playlistRunner);
                        playlistHandler.postDelayed(playlistRunner, currentInterval * 1000L);
                        return true;
                    }
                    return super.onDoubleTap(e);
                }
            });

            IntentFilter filter = new IntentFilter();
            filter.addAction("com.myparallax.app.ACTION_UPDATE_WALLPAPER");
            filter.addAction("com.myparallax.app.ACTION_UPDATE_NOTIFICATION");
            filter.addAction(Intent.ACTION_USER_PRESENT);
            filter.addAction(Intent.ACTION_SCREEN_OFF);
            filter.addAction(Intent.ACTION_SCREEN_ON);
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                registerReceiver(updateReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(updateReceiver, filter);
            }
            registerReceiver(powerSaveReceiver, new IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED));

            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) isPowerSaveMode = pm.isPowerSaveMode();

            ensureChannel();
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

        private void checkLockState() {
            boolean newState = keyguardManager != null && keyguardManager.isKeyguardLocked();
            if (isLocked != newState) {
                isLocked = newState;
                switchPlaylistSource();
            }
        }

        private void switchPlaylistSource() {
            if (!isPlaylistMode) return;

            if (!wasLocked()) { 
                homePlaylistIndex = currentPlaylistIndex;
            } else { 
                lockPlaylistIndex = currentPlaylistIndex;
            }

            resolvePlaylistSource();
            loadNextImageInternal(currentPlaylistIndex);
            
            if (visible) {
                playlistHandler.removeCallbacks(playlistRunner);
                if (currentPlaylistPaths != null && currentPlaylistPaths.size() > 1) {
                    playlistHandler.postDelayed(playlistRunner, currentInterval * 1000L);
                }
            }
        }

        private void resolvePlaylistSource() {
            if (isLocked) {
                if (!lockPlaylistPaths.isEmpty()) {
                    currentPlaylistPaths = lockPlaylistPaths;
                    currentPlaylistConfigs = lockPlaylistConfigs;
                    currentPlaylistIndex = lockPlaylistIndex;
                    currentInterval = lockInterval; 
                } else {
                    currentPlaylistPaths = homePlaylistPaths;
                    currentPlaylistConfigs = homePlaylistConfigs;
                    currentPlaylistIndex = homePlaylistIndex;
                    currentInterval = homeInterval;
                }
            } else {
                if (!homePlaylistPaths.isEmpty()) {
                    currentPlaylistPaths = homePlaylistPaths;
                    currentPlaylistConfigs = homePlaylistConfigs;
                    currentPlaylistIndex = homePlaylistIndex;
                    currentInterval = homeInterval; 
                } else {
                    currentPlaylistPaths = lockPlaylistPaths;
                    currentPlaylistConfigs = lockPlaylistConfigs;
                    currentPlaylistIndex = lockPlaylistIndex;
                    currentInterval = lockInterval;
                }
            }

            if (currentPlaylistPaths != null && !currentPlaylistPaths.isEmpty()) {
                if (currentPlaylistIndex >= currentPlaylistPaths.size()) {
                    currentPlaylistIndex = 0;
                }
            }
            if (currentInterval < 5) currentInterval = 5;
        }

        private boolean wasLocked() {
            return currentPlaylistPaths == lockPlaylistPaths;
        }

        private void loadSettings() {
            String jsonStr = prefs.getString("settings_json", "{}");
            String singleImagePath = prefs.getString("current_image_path", ""); 

            try {
                JSONObject json = new JSONObject(jsonStr);
                
                if (json.has("targetFps")) targetFps = json.optInt("targetFps", 60);
                if (json.has("runInBackground")) runInBackground = json.optBoolean("runInBackground", false);
                if (json.has("pauseOnPowerSave")) pauseOnPowerSave = json.optBoolean("pauseOnPowerSave", true);
                if (json.has("doubleTapToChange")) doubleTapToChange = json.optBoolean("doubleTapToChange", false);

                String mode = json.optString("mode", "single");
                isPlaylistMode = "playlist".equals(mode);

                // 先解析播放清單內容
                homePlaylistPaths.clear();
                homePlaylistConfigs.clear();
                parsePlaylist(json, "playlist", "playlistConfigs", homePlaylistPaths, homePlaylistConfigs);

                lockPlaylistPaths.clear();
                lockPlaylistConfigs.clear();
                if (json.has("lock_playlist")) {
                    parsePlaylist(json, "lock_playlist", "lock_playlistConfigs", lockPlaylistPaths, lockPlaylistConfigs);
                }

                if (isPlaylistMode) {
                    homeInterval = json.optInt("home_interval", 60);
                    lockInterval = json.optInt("lock_interval", 60);
                    int legacyInterval = json.optInt("interval", 60);
                    if (!json.has("home_interval")) homeInterval = legacyInterval;
                    if (!json.has("lock_interval")) lockInterval = legacyInterval;

                    isLocked = keyguardManager != null && keyguardManager.isKeyguardLocked();
                    switchPlaylistSource(); 
                    
                } else {
                    playlistHandler.removeCallbacks(playlistRunner); 
                    if (!singleImagePath.isEmpty()) {
                        loadImage(singleImagePath);
                    }
                    
                    // 🔥 [單圖模式防呆] 從前端傳遞的單圖結構中萃取新舊合約參數
                    resolvePlaylistSource();
                    int index = isLocked ? lockPlaylistIndex : homePlaylistIndex;
                    if (currentPlaylistConfigs != null && !currentPlaylistConfigs.isEmpty()) {
                        if (index >= currentPlaylistConfigs.size()) index = 0;
                        PhotoConfig config = currentPlaylistConfigs.get(index);
                        currentMotionStrength = config.motionStrength;
                        currentMotionEnabled = config.motionEnabled;
                        userScale = config.scale;
                        manualPanX = config.panX;
                        manualPanY = config.panY;
                        manualPanRatioX = config.ratioX;
                        manualPanRatioY = config.ratioY;
                        currentHasRatio = config.hasRatio;
                    } else {
                        // 根節點舊資料降級相容機制
                        userScale = json.has("scale") ? (float) json.getDouble("scale") : 1.0f;
                        currentMotionStrength = json.has("motionStrength") ? (float) json.getDouble("motionStrength") : 1.0f;
                        currentMotionEnabled = json.optBoolean("motionEnabled", true);
                        manualPanX = json.has("panX") ? (float) json.getDouble("panX") : 0f;
                        manualPanY = json.has("panY") ? (float) json.getDouble("panY") : 0f;
                        manualPanRatioX = 0f;
                        manualPanRatioY = 0f;
                        currentHasRatio = false;
                    }
                }

                handleForegroundService();
                
                if (visible) {
                    handler.removeCallbacks(drawRunner);
                    handler.post(drawRunner);
                }

            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        private void parsePlaylist(JSONObject json, String pathKey, String configKey, List<String> pathsList, List<PhotoConfig> configsList) {
            JSONArray paths = json.optJSONArray(pathKey);
            JSONArray configs = json.optJSONArray(configKey);

            if (paths != null) {
                for (int i = 0; i < paths.length(); i++) {
                    try {
                        pathsList.add(paths.getString(i));
                        
                        PhotoConfig config = new PhotoConfig();
                        config.motionStrength = json.has("motionStrength") ? (float) json.getDouble("motionStrength") : 1.0f;
                        config.motionEnabled = json.optBoolean("motionEnabled", true);
                        config.scale = 1.1f; 

                        if (configs != null && i < configs.length()) {
                            JSONObject c = configs.optJSONObject(i);
                            if (c != null) {
                                config.motionStrength = (float) c.optDouble("motionStrength", config.motionStrength);
                                config.motionEnabled = c.optBoolean("motionEnabled", config.motionEnabled);
                                config.scale = (float) c.optDouble("scale", 1.1);
                                config.panX = (float) c.optDouble("panX", 0);
                                config.panY = (float) c.optDouble("panY", 0);
                                
                                // 🔥 [新合約解析] 讀取 ratioX 與 ratioY
                                if (c.has("ratioX") || c.has("ratioY")) {
                                    config.ratioX = (float) c.optDouble("ratioX", 0);
                                    config.ratioY = (float) c.optDouble("ratioY", 0);
                                    config.hasRatio = true;
                                } else {
                                    config.hasRatio = false;
                                }
                            }
                        }
                        configsList.add(config);
                    } catch (Exception e) {}
                }
            }
        }

        private void loadNextImage() {
            if (currentPlaylistPaths == null || currentPlaylistPaths.isEmpty()) return;
            currentPlaylistIndex++;
            if (currentPlaylistIndex >= currentPlaylistPaths.size()) currentPlaylistIndex = 0;
            loadNextImageInternal(currentPlaylistIndex);
        }

        private void loadNextImageInternal(int index) {
            if (currentPlaylistPaths == null || index < 0 || index >= currentPlaylistPaths.size()) return;
            
            String nextPath = currentPlaylistPaths.get(index);
            loadImage(nextPath);

            if (currentPlaylistConfigs != null && index < currentPlaylistConfigs.size()) {
                PhotoConfig config = currentPlaylistConfigs.get(index);
                currentMotionStrength = config.motionStrength;
                currentMotionEnabled = config.motionEnabled;
                userScale = config.scale; 
                manualPanX = config.panX;
                manualPanY = config.panY;
                
                // 🔥 輪播換圖時，將該圖設定的相對比例與標記同步到引擎變數中
                manualPanRatioX = config.ratioX;
                manualPanRatioY = config.ratioY;
                currentHasRatio = config.hasRatio;
            } else {
                currentMotionStrength = json.has("motionStrength") ? (float) json.getDouble("motionStrength") : 1.0f;
                currentMotionEnabled = json.optBoolean("motionEnabled", true);
                manualPanX = 0;
                manualPanY = 0;
                manualPanRatioX = 0;
                manualPanRatioY = 0;
                currentHasRatio = false;
            }
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
                updateNotificationText(currentNotificationStatus);
            } else {
                stopForeground(true);
                showPausedNotification();
            }
        }

        private void showPausedNotification() {
            ensureChannel();
            Intent intent = new Intent(getApplicationContext(), MainActivity.class);
            PendingIntent pendingIntent = PendingIntent.getActivity(getApplicationContext(), 0, intent, PendingIntent.FLAG_IMMUTABLE);
            Notification notification = new NotificationCompat.Builder(getApplicationContext(), CHANNEL_ID)
                    .setContentTitle("Parallax Wallpaper")
                    .setContentText("前景運作暫停中") 
                    .setSmallIcon(android.R.drawable.ic_menu_gallery)
                    .setContentIntent(pendingIntent)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setOngoing(false) 
                    .build();
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.notify(NOTIFICATION_ID, notification);
        }

        private void ensureChannel() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager nm = getSystemService(NotificationManager.class);
                if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
                    NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Wallpaper Service", NotificationManager.IMPORTANCE_LOW);
                    nm.createNotificationChannel(channel);
                }
            }
        }

        private void updateNotificationText(String status) {
            if (status == null) status = "active";
            currentNotificationStatus = status.toLowerCase();

            if (!runInBackground) {
                showPausedNotification();
                return; 
            }

            ensureChannel();
            Intent intent = new Intent(getApplicationContext(), MainActivity.class);
            PendingIntent pendingIntent = PendingIntent.getActivity(getApplicationContext(), 0, intent, PendingIntent.FLAG_IMMUTABLE);

            String contentText;
            if (currentNotificationStatus.equals("paused")) {
                contentText = "前景運作暫停中 (省電模式)";
            } else {
                contentText = isPlaylistMode ? "Parallax Studio 輪播中" : "Parallax Studio 執行中";
            }

            Notification notification = new NotificationCompat.Builder(getApplicationContext(), CHANNEL_ID)
                    .setContentTitle("Parallax Wallpaper")
                    .setContentText(contentText)
                    .setSmallIcon(android.R.drawable.ic_menu_gallery)
                    .setContentIntent(pendingIntent)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setOngoing(true) 
                    .build();
            
            try {
                startForeground(NOTIFICATION_ID, notification);
            } catch (Exception e) {}
        }

        @Override
        public void onVisibilityChanged(boolean visible) {
            this.visible = visible;
            if (visible) {
                checkLockState(); 
                loadSettings(); 
                updateSensorState();
                if (isPlaylistMode) {
                    playlistHandler.removeCallbacks(playlistRunner);
                    if (currentPlaylistPaths != null && currentPlaylistPaths.size() > 1) {
                        playlistHandler.postDelayed(playlistRunner, currentInterval * 1000L);
                    }
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

                    // 🔥 [新合約核心處理] 
                    float targetPanX = 0f;
                    float targetPanY = 0f;

                    if (currentHasRatio) {
                        // 如果具備新合約比例，直接用百分比乘以當前裝置的最大移動上限，達到完美的跨裝置 WYSIWYG
                        targetPanX = manualPanRatioX * maxDx;
                        targetPanY = manualPanRatioY * maxDy;
                    } else {
                        // 否則降級相容舊有實體像素設定，並進行夾擠限制
                        targetPanX = Math.max(-maxDx, Math.min(manualPanX, maxDx));
                        targetPanY = Math.max(-maxDy, Math.min(manualPanY, maxDy));
                    }

                    if (currentMotionEnabled && currentMotionStrength > 0) {
                        currentGyroX += (targetGyroX - currentGyroX) * SMOOTHING_FACTOR;
                        currentGyroY += (targetGyroY - currentGyroY) * SMOOTHING_FACTOR;
                    } else {
                        currentGyroX = 0;
                        currentGyroY = 0;
                    }

                    // 合併拖曳定位與陀螺儀即時震盪偏移量
                    float totalOffsetX = targetPanX + (currentGyroX * 30f * currentMotionStrength);
                    float totalOffsetY = targetPanY + (currentGyroY * 30f * currentMotionStrength);

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
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

    // 🔥 定義個別照片的設定結構
    private static class PhotoConfig {
        float motionStrength = 1.0f;
        boolean motionEnabled = true;
        float scale = 1.0f;
        float panX = 0f;
        float panY = 0f;
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
        private String currentNotificationStatus = "Active";
        
        // --- 設定 (單張模式) ---
        private Bitmap currentBitmap;
        private float userScale = 1.0f;
        private float manualPanX = 0;
        private float manualPanY = 0;
        
        // --- 設定 (播放清單模式) ---
        private boolean isPlaylistMode = false;
        private List<String> playlistPaths = new ArrayList<>();
        private List<PhotoConfig> playlistConfigs = new ArrayList<>(); // 🔥 儲存每張照片的設定
        private int playlistInterval = 60; 
        private int currentPlaylistIndex = 0;
        
        // --- 通用設定 (預設值) ---
        private float globalMotionStrength = 1.0f; // 改名以區分
        private float currentMotionStrength = 1.0f; // 當前實際使用的強度
        private int targetFps = 60; 
        private boolean runInBackground = false;
        private boolean pauseOnPowerSave = true;
        private boolean doubleTapToChange = false;
        private boolean globalMotionEnabled = true; // 改名以區分
        private boolean currentMotionEnabled = true; // 當前實際使用的開關

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
                        // 狀態改變時更新通知文字
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
            filter.addAction("com.myparallax.app.ACTION_UPDATE_NOTIFICATION");
            filter.addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED);
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                registerReceiver(updateReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(updateReceiver, filter);
            }
            registerReceiver(powerSaveReceiver, new IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED));

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
                
                // 1. 讀取全域設定
                if (json.has("scale")) userScale = (float) json.getDouble("scale");
                if (json.has("motionStrength")) globalMotionStrength = (float) json.getDouble("motionStrength");
                if (json.has("motionEnabled")) globalMotionEnabled = json.optBoolean("motionEnabled", true);
                
                if (json.has("panX")) manualPanX = (float) json.getDouble("panX");
                if (json.has("panY")) manualPanY = (float) json.getDouble("panY");
                if (json.has("targetFps")) targetFps = json.optInt("targetFps", 60);
                if (json.has("runInBackground")) runInBackground = json.optBoolean("runInBackground", false);
                if (json.has("pauseOnPowerSave")) pauseOnPowerSave = json.optBoolean("pauseOnPowerSave", true);
                if (json.has("doubleTapToChange")) doubleTapToChange = json.optBoolean("doubleTapToChange", false);

                String mode = json.optString("mode", "single");
                isPlaylistMode = "playlist".equals(mode);

                // 2. 初始化目前使用的參數 (預設為全域)
                currentMotionStrength = globalMotionStrength;
                currentMotionEnabled = globalMotionEnabled;

                if (isPlaylistMode) {
                    playlistInterval = json.optInt("interval", 60);
                    if (playlistInterval < 5) playlistInterval = 5;

                    playlistPaths.clear();
                    playlistConfigs.clear(); // 🔥 清除舊設定

                    JSONArray paths = json.optJSONArray("playlist");
                    // 🔥 嘗試讀取設定陣列
                    JSONArray configs = json.optJSONArray("playlistConfigs");

                    if (paths != null) {
                        for (int i = 0; i < paths.length(); i++) {
                            playlistPaths.add(paths.getString(i));
                            
                            // 解析個別設定
                            PhotoConfig config = new PhotoConfig();
                            // 預設繼承全域
                            config.motionStrength = globalMotionStrength;
                            config.motionEnabled = globalMotionEnabled;
                            config.scale = 1.1f; // 預設縮放

                            if (configs != null && i < configs.length()) {
                                JSONObject c = configs.optJSONObject(i);
                                if (c != null) {
                                    config.motionStrength = (float) c.optDouble("motionStrength", globalMotionStrength);
                                    config.motionEnabled = c.optBoolean("motionEnabled", globalMotionEnabled);
                                    config.scale = (float) c.optDouble("scale", 1.1);
                                    config.panX = (float) c.optDouble("panX", 0);
                                    config.panY = (float) c.optDouble("panY", 0);
                                }
                            }
                            playlistConfigs.add(config);
                        }
                    }
                    
                    if (currentBitmap == null && !playlistPaths.isEmpty()) {
                        currentPlaylistIndex = 0;
                        // 載入第一張並套用其設定
                        loadNextImageInternal(0);
                    }
                    
                    if (visible) {
                        playlistHandler.removeCallbacks(playlistRunner);
                        playlistHandler.postDelayed(playlistRunner, playlistInterval * 1000L);
                    }

                } else {
                    // 單張模式直接使用讀到的參數
                    playlistHandler.removeCallbacks(playlistRunner); 
                    if (!singleImagePath.isEmpty()) {
                        loadImage(singleImagePath);
                    }
                }

                targetGyroX = 0; targetGyroY = 0;
                currentGyroX = 0; currentGyroY = 0;
                
                handleForegroundService();
                
                if (visible) {
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
            
            loadNextImageInternal(currentPlaylistIndex);
        }

        // 🔥 內部方法：載入指定索引的圖片並套用設定
        private void loadNextImageInternal(int index) {
            if (index < 0 || index >= playlistPaths.size()) return;

            String nextPath = playlistPaths.get(index);
            loadImage(nextPath);

            // 🔥 套用個別設定
            if (index < playlistConfigs.size()) {
                PhotoConfig config = playlistConfigs.get(index);
                currentMotionStrength = config.motionStrength;
                currentMotionEnabled = config.motionEnabled;
                userScale = config.scale; // 如果有存 scale 的話
                manualPanX = config.panX;
                manualPanY = config.panY;
            } else {
                // 回退到全域
                currentMotionStrength = globalMotionStrength;
                currentMotionEnabled = globalMotionEnabled;
            }
            
            // 重置動量
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
            }
        }

        // 🔥 更新通知欄邏輯優化
        private void updateNotificationText(String status) {
            if (status == null) status = "active";
            // 統一狀態字串 (active / paused)
            currentNotificationStatus = status.toLowerCase();

            if (!runInBackground) return; // 如果沒開 Keep Alive 就不顯示

            String CHANNEL_ID = "wallpaper_service_channel";
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Wallpaper Service", NotificationManager.IMPORTANCE_LOW);
                getSystemService(NotificationManager.class).createNotificationChannel(channel);
            }
            
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
                startForeground(1, notification);
            } catch (Exception e) {}
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

                    // 🔥 使用 currentMotionEnabled 和 currentMotionStrength (動態切換)
                    if (currentMotionEnabled && currentMotionStrength > 0) {
                        currentGyroX += (targetGyroX - currentGyroX) * SMOOTHING_FACTOR;
                        currentGyroY += (targetGyroY - currentGyroY) * SMOOTHING_FACTOR;
                    } else {
                        currentGyroX = 0;
                        currentGyroY = 0;
                    }

                    float totalOffsetX = manualPanX + (currentGyroX * 30f * currentMotionStrength);
                    float totalOffsetY = manualPanY + (currentGyroY * 30f * currentMotionStrength);

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
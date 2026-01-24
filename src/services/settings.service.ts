import { Injectable, signal, effect, computed, NgZone, inject } from '@angular/core';

export type ThumbnailShape = 'squircle' | 'square' | 'rounded' | 'circle' | 'bevel' | 'leaf' | 'hexagon' | 'diamond';

export interface AppSettings {
  targetFps: number; // 30, 60, 90, 120
  
  // Logic: Pauses rotation when system reports power save mode
  pauseOnPowerSave: boolean;
  
  // Logic: Reduces CSS animations/blur effects to save GPU
  batteryOptimization: boolean; 
  
  // Logic: Tells Android to run as Foreground Service (Notification + Boot Start)
  runInBackground: boolean;

  globalMotionStrength: number;
  globalMotionEnabled: boolean;
  
  // New Visual Settings
  thumbnailShape: ThumbnailShape;
  thumbnailGap: number;
  
  // Interaction Settings
  doubleTapToChange: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private zone = inject(NgZone);

  // Reactive state for the System's actual Power Save status (pushed from Android)
  isSystemPowerSave = signal(false);

  settings = signal<AppSettings>({
    targetFps: 60,
    pauseOnPowerSave: true,       // 預設開啟
    batteryOptimization: false,   // 預設關閉 (Reduced Motion)
    runInBackground: false,       // 預設關閉 (Keep Alive)
    globalMotionStrength: 2.0,    // 預設 2x
    globalMotionEnabled: true,    // 預設開啟
    thumbnailShape: 'squircle',
    thumbnailGap: 8,              // 預設 8px
    doubleTapToChange: false      // 預設關閉
  });

  // CENTRAL LOGIC: Are we actually paused right now?
  // Returns true ONLY IF: "Pause on Power Save" is ON AND "System Power Save" is ACTIVE.
  isEffectivelyPaused = computed(() => {
      return this.settings().pauseOnPowerSave && this.isSystemPowerSave();
  });

  constructor() {
    // 1. 註冊 Native -> Web 的 Power Save 更新
    (window as any).updatePowerSaveMode = (isActive: boolean) => {
        console.log('[Web] Received Power Save Update:', isActive);
        // 使用 NgZone 確保 Angular 偵測到這個外部變更
        this.zone.run(() => {
            this.setSystemPowerSave(isActive);
        });
    };

    // 🔥 2. 新增：註冊 Native -> Web 的 Keep Alive UI 更新 (解決下拉選單不同步問題)
    // 當使用者點擊下拉選單的快捷鍵時，Android 會呼叫這個方法
    (window as any).updateKeepAliveUI = (isActive: boolean) => {
        console.log('[Web] Received Keep Alive Update:', isActive);
        this.zone.run(() => {
            // 更新 runInBackground 狀態，這會觸發 UI 上的開關變動
            this.settings.update(current => ({ ...current, runInBackground: isActive }));
        });
    };

    // Attempt to load from localStorage
    const saved = localStorage.getItem('app_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // 合併儲存的設定與新的預設值 (確保新增的欄位有預設值)
        this.settings.set({ ...this.settings(), ...parsed });
      } catch (e) {
        console.warn('Failed to parse settings', e);
      }
    }

    // Auto-save & Sync to Native
    effect(() => {
      const json = JSON.stringify(this.settings());
      localStorage.setItem('app_settings', json);
      
      // Native Bridge Call 1: Update Settings Data
      if ((window as any).Android && (window as any).Android.updateSettings) {
          (window as any).Android.updateSettings(json);
      }
    });

    // Effect: Update Notification Text based on "Effectively Paused" state
    effect(() => {
        const isPaused = this.isEffectivelyPaused();
        
        // Native Bridge Call 2: Update Service Notification Text
        // If paused, Android should show "Paused in Power Save"
        // If running, Android should show "Parallax Studio Running" or "Playlist Active"
        if ((window as any).Android && (window as any).Android.updateServiceNotification) {
            (window as any).Android.updateServiceNotification(isPaused ? 'paused' : 'active');
        }
        
        // console.log(`[App State] Effectively Paused: ${isPaused}`);
    });
  }

  updateSettings(partial: Partial<AppSettings>) {
    this.settings.update(current => ({ ...current, ...partial }));
  }

  // Method called by Native Android when system power save toggles
  setSystemPowerSave(isActive: boolean) {
    this.isSystemPowerSave.set(isActive);
  }
}
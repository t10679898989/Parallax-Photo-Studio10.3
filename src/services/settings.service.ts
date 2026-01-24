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
  
  // Visual Settings
  thumbnailShape: ThumbnailShape;
  thumbnailGap: number;
  
  // Interaction Settings
  doubleTapToChange: boolean;

  // 🔥 [NEW] 鎖定畫面專用播放清單 (Lock Screen Playlist)
  // 原本的 'playlist' 欄位我們將其視為 'Home Screen' (主畫面)
  lock_playlist?: string[];
  lock_playlistConfigs?: any[]; // 對應的個別設定 (Motion, Scale...)
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private zone = inject(NgZone);

  // Reactive state for the System's actual Power Save status
  isSystemPowerSave = signal(false);

  settings = signal<AppSettings>({
    targetFps: 120,
    pauseOnPowerSave: true,       // 預設開啟
    batteryOptimization: false,   // 預設關閉
    runInBackground: true,        // 預設開啟
    globalMotionStrength: 2.0,    // 預設 2x
    globalMotionEnabled: true,    // 預設開啟
    thumbnailShape: 'squircle',
    thumbnailGap: 8,              // 預設 8px
    doubleTapToChange: false,     // 預設關閉
    
    // 🔥 [NEW] 初始化為空陣列
    lock_playlist: [],
    lock_playlistConfigs: []
  });

  isEffectivelyPaused = computed(() => {
      return this.settings().pauseOnPowerSave && this.isSystemPowerSave();
  });

  constructor() {
    // 1. Native -> Web: Power Save Sync
    (window as any).updatePowerSaveMode = (isActive: boolean) => {
        console.log('[Web] Received Power Save Update:', isActive);
        this.zone.run(() => {
            this.setSystemPowerSave(isActive);
        });
    };

    // 🔥 2. Native -> Web: Keep Alive Tile Sync (補回這段，確保下拉選單連動正常)
    (window as any).updateKeepAliveUI = (isActive: boolean) => {
        console.log('[Web] Received Keep Alive Update:', isActive);
        this.zone.run(() => {
            this.settings.update(current => ({ ...current, runInBackground: isActive }));
        });
    };

    // Attempt to load from localStorage
    const saved = localStorage.getItem('app_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // 合併儲存的設定與新的預設值
        this.settings.set({ ...this.settings(), ...parsed });
      } catch (e) {
        console.warn('Failed to parse settings', e);
      }
    }

    // Auto-save & Sync to Native
    effect(() => {
      const json = JSON.stringify(this.settings());
      localStorage.setItem('app_settings', json);
      
      if ((window as any).Android && (window as any).Android.updateSettings) {
          (window as any).Android.updateSettings(json);
      }
    });

    // Effect: Update Notification Text
    effect(() => {
        const isPaused = this.isEffectivelyPaused();
        if ((window as any).Android && (window as any).Android.updateServiceNotification) {
            (window as any).Android.updateServiceNotification(isPaused ? 'paused' : 'active');
        }
    });
  }

  updateSettings(partial: Partial<AppSettings>) {
    this.settings.update(current => ({ ...current, ...partial }));
  }

  setSystemPowerSave(isActive: boolean) {
    this.isSystemPowerSave.set(isActive);
  }
}
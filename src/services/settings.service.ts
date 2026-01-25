import { Injectable, signal, effect, computed, NgZone, inject } from '@angular/core';

export type ThumbnailShape = 'squircle' | 'square' | 'rounded' | 'circle' | 'bevel' | 'leaf' | 'hexagon' | 'diamond';

export interface AppSettings {
  targetFps: number; 
  pauseOnPowerSave: boolean;
  batteryOptimization: boolean; 
  runInBackground: boolean;
  globalMotionStrength: number;
  globalMotionEnabled: boolean;
  thumbnailShape: ThumbnailShape;
  thumbnailGap: number;
  doubleTapToChange: boolean;
  
  // 🔥 鎖定畫面專用播放清單 (Home = playlist / Lock = lock_playlist)
  lock_playlist?: string[];
  lock_playlistConfigs?: any[]; 
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private zone = inject(NgZone);

  isSystemPowerSave = signal(false);

  settings = signal<AppSettings>({
    targetFps: 120,
    pauseOnPowerSave: true,       
    batteryOptimization: false,   
    runInBackground: true,        
    globalMotionStrength: 2.0,    
    globalMotionEnabled: true,    
    thumbnailShape: 'squircle',
    thumbnailGap: 8,              
    doubleTapToChange: false,     
    lock_playlist: [],
    lock_playlistConfigs: []
  });

  isEffectivelyPaused = computed(() => {
      return this.settings().pauseOnPowerSave && this.isSystemPowerSave();
  });

  constructor() {
    // 1. Native -> Web: Power Save Sync
    (window as any).updatePowerSaveMode = (isActive: boolean) => {
        // console.log('[Web] Received Power Save Update:', isActive);
        this.zone.run(() => {
            // 防呆檢查：只有真的變了才更新
            if (this.isSystemPowerSave() !== isActive) {
                this.setSystemPowerSave(isActive);
            }
        });
    };

    // 🔥 2. Native -> Web: Keep Alive Tile Sync (已修復無限迴圈問題)
    (window as any).updateKeepAliveUI = (isActive: boolean) => {
        // console.log('[Web] Received Keep Alive Update:', isActive);
        this.zone.run(() => {
            const current = this.settings();
            // 🔥🔥🔥 關鍵修正：加入判斷，只有當狀態真的不同時才更新
            // 這能防止 Native -> Web -> Native -> Web 的無限乒乓球效應
            if (current.runInBackground !== isActive) {
                this.settings.update(c => ({ ...c, runInBackground: isActive }));
            }
        });
    };

    const saved = localStorage.getItem('app_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.settings.set({ ...this.settings(), ...parsed });
      } catch (e) {
        console.warn('Failed to parse settings', e);
      }
    }

    // Auto-save & Sync to Native
    effect(() => {
      const json = JSON.stringify(this.settings());
      localStorage.setItem('app_settings', json);
      
      // 這裡會觸發 Native 的 updateSettings -> 發送廣播 -> 觸發 updateKeepAliveUI
      // 所以上面的 updateKeepAliveUI 必須要有防呆檢查
      if ((window as any).Android && (window as any).Android.updateSettings) {
          (window as any).Android.updateSettings(json);
      }
    });

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
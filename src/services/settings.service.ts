import { Injectable, signal, effect, computed, NgZone, inject } from '@angular/core';

export type SortOrder = 'name_asc' | 'name_desc' | 'date_asc' | 'date_desc' | 'random' | 'custom';
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

  // 資料欄位
  playlist?: string[];
  playlistConfigs?: any[];
  lock_playlist?: string[];
  lock_playlistConfigs?: any[];
  
  mode?: string;
  sortOrder?: SortOrder;

  // 🔥 [FIX] 拆分間隔設定，解決秒數互蓋問題
  home_interval?: number; // 主畫面秒數
  lock_interval?: number; // 鎖定畫面秒數
  interval?: number;      // (保留作為單圖或其他用途的 fallback)
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
    playlist: [],
    playlistConfigs: [],
    lock_playlist: [],
    lock_playlistConfigs: [],
    mode: 'single',
    interval: 60,
    sortOrder: 'custom',
    
    // 🔥 初始化
    home_interval: 60,
    lock_interval: 60
  });

  isEffectivelyPaused = computed(() => {
      return this.settings().pauseOnPowerSave && this.isSystemPowerSave();
  });

  constructor() {
    (window as any).updatePowerSaveMode = (isActive: boolean) => {
        this.zone.run(() => {
            if (this.isSystemPowerSave() !== isActive) {
                this.setSystemPowerSave(isActive);
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

    effect(() => {
      const json = JSON.stringify(this.settings());
      localStorage.setItem('app_settings', json);
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
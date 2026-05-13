import { Injectable, signal, effect, computed, NgZone, inject } from '@angular/core';

export type SortOrder = 'name_asc' | 'name_desc' | 'date_asc' | 'date_desc' | 'random' | 'custom';
export type ThumbnailShape = 'squircle' | 'square' | 'rounded' | 'circle' | 'bevel' | 'leaf' | 'hexagon' | 'diamond';

export interface AppSettings {
  targetFps: number; 
  pauseOnPowerSave: boolean;
  batteryOptimization: boolean; 
  runInBackground: boolean;
  globalMotionStrength: number;
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

        if (parsed.targetFps) parsed.targetFps = Number(parsed.targetFps);
        if (parsed.thumbnailGap) parsed.thumbnailGap = Number(parsed.thumbnailGap);
        if (parsed.globalMotionStrength) parsed.globalMotionStrength = Number(parsed.globalMotionStrength);
        
        if (parsed.home_interval) parsed.home_interval = Number(parsed.home_interval);
        if (parsed.lock_interval) parsed.lock_interval = Number(parsed.lock_interval);
        if (parsed.interval) parsed.interval = Number(parsed.interval);

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
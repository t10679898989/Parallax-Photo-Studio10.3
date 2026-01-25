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
  interval?: number;
  sortOrder?: SortOrder;
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
    sortOrder: 'custom'
  });

  isEffectivelyPaused = computed(() => {
      return this.settings().pauseOnPowerSave && this.isSystemPowerSave();
  });

  constructor() {
    // 1. Power Save Sync
    (window as any).updatePowerSaveMode = (isActive: boolean) => {
        this.zone.run(() => {
            if (this.isSystemPowerSave() !== isActive) {
                this.setSystemPowerSave(isActive);
            }
        });
    };

    // ❌ 已移除 updateKeepAliveUI，避免無限迴圈

    // 2. Load
    const saved = localStorage.getItem('app_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.settings.set({ ...this.settings(), ...parsed });
      } catch (e) {
        console.warn('Failed to parse settings', e);
      }
    }

    // 3. Auto-save
    effect(() => {
      const json = JSON.stringify(this.settings());
      localStorage.setItem('app_settings', json);
      if ((window as any).Android && (window as any).Android.updateSettings) {
          (window as any).Android.updateSettings(json);
      }
    });

    // 4. Notification
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

import { Injectable, signal, effect } from '@angular/core';

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
  // Reactive state for the System's actual Power Save status (pushed from Android)
  isSystemPowerSave = signal(false);

  settings = signal<AppSettings>({
    targetFps: 60,
    pauseOnPowerSave: true,
    batteryOptimization: true,
    runInBackground: false, // Default false, user must enable
    globalMotionStrength: 1.0,
    globalMotionEnabled: true,
    thumbnailShape: 'squircle',
    thumbnailGap: 16,
    doubleTapToChange: false
  });

  constructor() {
    // Attempt to load from localStorage
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
      
      // Native Bridge Call
      // Tell Android Native Wrapper that settings have updated
      // Android should read 'runInBackground' to start/stop the Foreground Service
      if ((window as any).Android && (window as any).Android.updateSettings) {
          (window as any).Android.updateSettings(json);
      }
    });
  }

  updateSettings(partial: Partial<AppSettings>) {
    this.settings.update(current => ({ ...current, ...partial }));
  }

  // Method called by Native Android when system power save toggles
  setSystemPowerSave(isActive: boolean) {
    this.isSystemPowerSave.set(isActive);
    console.log('System Power Save State Changed:', isActive);
  }
}

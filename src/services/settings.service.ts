
import { Injectable, signal, effect, computed } from '@angular/core';

export type ThumbnailShape = 'squircle' | 'square' | 'rounded' | 'circle' | 'bevel' | 'leaf' | 'hexagon' | 'diamond';

export interface AppSettings {
  targetFps: number; // 30, 60, 90, 120
  
  // Logic: Pauses rotation when system reports power save mode
  pauseOnPowerSave: boolean;
  
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
    runInBackground: false, // Default false, user must enable
    globalMotionStrength: 1.0,
    globalMotionEnabled: true,
    thumbnailShape: 'squircle',
    thumbnailGap: 16,
    doubleTapToChange: false
  });

  // CENTRAL LOGIC: Are we actually paused right now?
  // Returns true ONLY IF: "Pause on Power Save" is ON AND "System Power Save" is ACTIVE.
  isEffectivelyPaused = computed(() => {
      return this.settings().pauseOnPowerSave && this.isSystemPowerSave();
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
        
        console.log(`[App State] Effectively Paused: ${isPaused}`);
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


import { Component, inject } from '@angular/core';
import { PhotoService } from '../services/photo.service';
import { SettingsService } from '../services/settings.service';
import { GalleryComponent } from '../components/gallery/gallery.component';
import { EditorComponent } from '../components/editor/editor.component';

@Component({
  selector: 'app-root',
  imports: [GalleryComponent, EditorComponent],
  templateUrl: './app.component.html'
})
export class AppComponent {
  photoService = inject(PhotoService);
  settingsService = inject(SettingsService);

  constructor() {
    this.setupNativeBridge();
  }

  setupNativeBridge() {
    // 1. Bridge for Power Save Mode (Called by Android BroadcastReceiver)
    (window as any).updatePowerSaveState = (isActive: boolean) => {
      this.settingsService.setSystemPowerSave(isActive);
    };

    // 2. Bridge for Double Tap (Called by Android WallpaperService onTouchEvent)
    (window as any).handleDoubleTap = () => {
      const settings = this.settingsService.settings();
      
      // Check Global Switch First
      if (!settings.doubleTapToChange) return;

      // Check Centralized Pause Logic (Pause on Power Save)
      // If we are effectively paused, we IGNORE double taps.
      if (this.settingsService.isEffectivelyPaused()) {
          console.log('Double Tap Ignored: App is Paused due to Power Save');
          return; 
      }

      console.log('Double Tap Detected: Requesting Next Wallpaper');
      
      if ((window as any).Android && (window as any).Android.nextWallpaper) {
         (window as any).Android.nextWallpaper();
      }
    };
  }

  onCaptionUpdated(newCaption: string) {
    const activeId = this.photoService.activePhotoId();
    if (activeId) {
      this.photoService.updateCaption(activeId, newCaption);
    }
  }
}

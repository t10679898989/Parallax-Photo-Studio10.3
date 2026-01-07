
import { Component, computed, ElementRef, inject, input, OnDestroy, output, signal, viewChild, effect, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Photo, PhotoService } from '../../services/photo.service';
import { SettingsService } from '../../services/settings.service';

type FitMode = 'height' | 'width';

@Component({
  selector: 'app-editor',
  imports: [CommonModule],
  template: `
    <div 
      class="relative w-full h-full flex flex-col bg-black overflow-hidden select-none touch-none"
      (click)="onBackgroundClick($event)"
    >
      
      <!-- Top Bar -->
      <div 
        class="absolute top-0 left-0 right-0 z-50 p-4 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent pointer-events-none transition-opacity duration-300"
        [class.opacity-0]="!uiVisible()"
        [class.opacity-100]="uiVisible()"
      >
        <!-- Back Button -->
        <button 
          (click)="goBack.emit()" 
          class="pointer-events-auto flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-full text-white hover:bg-white/10 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          Gallery
        </button>

        <!-- New Checkmark Button (Top Right) -->
        <button 
          (click)="openWallpaperMenu()" 
          class="pointer-events-auto w-10 h-10 flex items-center justify-center bg-black/40 backdrop-blur-md border border-white/10 rounded-full text-white hover:bg-white/10 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
      </div>

      <!-- Main Stage -->
      <div 
        class="flex-1 relative flex items-center justify-center overflow-hidden perspective-container cursor-move"
        (pointerdown)="startDrag($event)"
        (pointermove)="onDrag($event)"
        (pointerup)="endDrag()"
        (pointerleave)="endDrag()"
      >
        <div 
          class="relative will-change-transform shadow-2xl transition-transform ease-linear"
          [style.transition-duration]="smoothness()"
          [style.transform]="transformStyle()"
        >
           <img 
            [src]="photo().url" 
            class="pointer-events-none object-cover max-w-none max-h-none"
            [class.h-screen-115]="fitMode() === 'height'"
            [class.w-screen-115]="fitMode() === 'width'"
            alt="Parallax preview"
            #imageElement
            (load)="updateBoundaries()"
           >
           <div class="absolute inset-0 shadow-[inset_0_0_100px_rgba(0,0,0,0.2)] pointer-events-none"></div>
        </div>
      </div>

      <!-- Settings Trigger Button -->
      <div 
        class="absolute bottom-6 right-6 z-40 transition-all duration-300 transform"
        [class.translate-y-20]="isSettingsOpen() || !uiVisible()"
        [class.opacity-0]="isSettingsOpen() || !uiVisible()"
      >
        <button 
          (click)="openSettings(); $event.stopPropagation()"
          class="w-14 h-14 bg-slate-800/90 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-slate-700 active:scale-95 transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>

      <!-- Settings Panel -->
      <div 
        class="absolute bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-xl border-t border-white/10 px-6 py-8 flex flex-col gap-6 z-50 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-in-out"
        [class.translate-y-full]="!isSettingsOpen()"
        [class.translate-y-0]="isSettingsOpen()"
        (click)="$event.stopPropagation()"
      >
        <div class="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-slate-700 rounded-full"></div>
        
        <div class="grid grid-cols-1 gap-6 max-w-md mx-auto w-full pb-6">
           <div class="flex items-center justify-between">
              <h3 class="text-lg font-bold text-white">Editor Settings</h3>
              <button (click)="togglePreview()" class="text-sm text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1">
                Preview
              </button>
           </div>

           <!-- Motion Controls -->
           <div class="space-y-3">
             <div class="flex justify-between items-center">
               <label class="text-sm font-medium text-slate-300">
                  Motion Strength
                  @if (!motionEnabled()) { <span class="text-slate-500 ml-2 text-xs">(Disabled)</span> }
               </label>
               <span 
                 class="text-xs font-mono transition-colors"
                 [class.text-emerald-400]="isMotionVisuallyActive()"
                 [class.text-slate-500]="!isMotionVisuallyActive()"
               >{{ motionStrength() }}x</span>
             </div>
             <div class="flex items-center gap-4">
               <button 
                  (click)="toggleMotion()" 
                  class="p-3 rounded-xl border transition-colors relative overflow-hidden shrink-0"
                  [class.bg-emerald-600]="isMotionVisuallyActive()"
                  [class.border-emerald-500]="isMotionVisuallyActive()"
                  [class.text-white]="isMotionVisuallyActive()"
                  [class.bg-slate-800]="!isMotionVisuallyActive()"
                  [class.border-slate-700]="!isMotionVisuallyActive()"
                  [class.text-slate-400]="!isMotionVisuallyActive()"
                  title="Toggle Motion"
               >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10 10 10 0 0 0-10-10z"/><path d="M12 12v6"/><path d="m16.5 16-9-8"/></svg>
               </button>
               <input 
                 type="range" min="0" max="3" step="0.1"
                 [value]="motionStrength()"
                 (input)="updateStrength($event)"
                 class="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer transition-all"
                 [class.accent-emerald-500]="isMotionVisuallyActive()"
                 [class.accent-slate-500]="!isMotionVisuallyActive()"
                 [class.opacity-50]="!isMotionVisuallyActive()"
               >
             </div>
           </div>

           <!-- Fit Mode -->
           <div class="space-y-3">
             <label class="text-sm font-medium text-slate-300">Image Fit</label>
             <div class="grid grid-cols-2 gap-2 bg-slate-800 p-1 rounded-lg">
               <button 
                 class="px-3 py-2 rounded-md text-sm font-medium transition-all"
                 [class.bg-slate-600]="fitMode() === 'height'"
                 [class.text-white]="fitMode() === 'height'"
                 [class.text-slate-400]="fitMode() !== 'height'"
                 (click)="setFitMode('height')"
               >
                 Vertical
               </button>
               <button 
                 class="px-3 py-2 rounded-md text-sm font-medium transition-all"
                 [class.bg-slate-600]="fitMode() === 'width'"
                 [class.text-white]="fitMode() === 'width'"
                 [class.text-slate-400]="fitMode() !== 'width'"
                 (click)="setFitMode('width')"
               >
                 Horizontal
               </button>
             </div>
           </div>

           <!-- Actions -->
           <div class="flex gap-4 pt-2 border-t border-white/10 mt-2">
             <button (click)="resetSettings()" class="flex-1 py-3 text-slate-400 font-medium hover:text-white transition-colors">Reset</button>
             <button (click)="saveSettings()" class="flex-[2] bg-white text-black font-bold rounded-xl hover:bg-slate-200 transition-colors py-3 shadow-lg active:scale-95">Save</button>
           </div>
        </div>
      </div>

      <!-- Wallpaper Menu (Set As Dialog) -->
      @if (showWallpaperMenu()) {
        <div class="absolute inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in" (click)="closeWallpaperMenu()">
            <div class="bg-slate-800 rounded-t-2xl sm:rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-700" (click)="$event.stopPropagation()">
                <div class="px-6 py-5 border-b border-slate-700">
                    <h3 class="text-xl font-medium text-white">設定桌布</h3>
                </div>
                <div class="flex flex-col">
                    <button (click)="applyWallpaper('home')" class="px-6 py-4 flex items-center gap-4 text-slate-200 hover:bg-slate-700/50 transition-colors text-left group">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400 group-hover:text-emerald-400"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                        <span class="text-base">主畫面</span>
                    </button>
                    <button (click)="applyWallpaper('lock')" class="px-6 py-4 flex items-center gap-4 text-slate-200 hover:bg-slate-700/50 transition-colors text-left group">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400 group-hover:text-emerald-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        <span class="text-base">螢幕鎖定</span>
                    </button>
                    <button (click)="applyWallpaper('both')" class="px-6 py-4 flex items-center gap-4 text-slate-200 hover:bg-slate-700/50 transition-colors text-left group">
                         <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400 group-hover:text-emerald-400"><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M12 18h.01"/></svg>
                        <span class="text-base">主畫面和螢幕鎖定</span>
                    </button>
                </div>
            </div>
        </div>
      }

      <!-- Simulation Toast -->
      @if (toastMessage()) {
          <div class="absolute bottom-12 left-1/2 -translate-x-1/2 z-[110] px-6 py-3 bg-slate-800/90 backdrop-blur-md rounded-full border border-slate-600 shadow-2xl animate-slide-up flex items-center gap-2 max-w-[90%] whitespace-nowrap">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-400"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span class="font-medium text-white text-sm">{{ toastMessage() }}</span>
          </div>
      }

    </div>
  `,
  styles: [`
    .perspective-container { perspective: 1000px; }
    .w-screen-115 { width: 115vw; height: auto; }
    .h-screen-115 { height: 115vh; width: auto; }
    .animate-fade-in { animation: fadeIn 0.2s ease-out; }
    .animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { transform: translate(-50%, 100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
  `]
})
export class EditorComponent implements OnDestroy, AfterViewInit {
  photo = input.required<Photo>();
  goBack = output<void>();
  updateCaption = output<string>(); 
  
  // Reference to the image element for size calculations
  imageElement = viewChild<ElementRef<HTMLImageElement>>('imageElement');

  settingsService = inject(SettingsService);
  photoService = inject(PhotoService);

  isSettingsOpen = signal(false);
  uiVisible = signal(true);
  
  fitMode = signal<FitMode>('height');
  motionStrength = signal(1.0);
  motionEnabled = signal(false);
  motionError = signal<string | null>(null);

  panX = signal(0);
  panY = signal(0);
  gyroX = signal(0);
  gyroY = signal(0);
  
  // Reactive boundaries for both Drag and Render clamping
  limitX = signal(0);
  limitY = signal(0);
  
  showWallpaperMenu = signal(false);
  toastMessage = signal<string | null>(null);

  isDragging = false;
  startX = 0;
  startY = 0;
  initialPanX = 0;
  initialPanY = 0;

  private lastFrameTime = 0;
  
  smoothness = computed(() => {
    return this.settingsService.settings().batteryOptimization ? '100ms' : '50ms';
  });

  transformStyle = computed(() => {
    // 1. Calculate raw target position including manual pan + gyro tilt
    const rawX = this.panX() + this.gyroX();
    const rawY = this.panY() + this.gyroY();
    
    // 2. Get current allowed boundaries
    const limX = this.limitX();
    const limY = this.limitY();

    // 3. HARD CLAMP: Ensure the total translation never exceeds the image overflow limits
    // This prevents seeing the black background even if gyro tilts drastically
    const finalX = Math.max(-limX, Math.min(rawX, limX));
    const finalY = Math.max(-limY, Math.min(rawY, limY));

    // 4. Calculate rotation (unchanged)
    const rx = (this.gyroY() / 20) * -1; 
    const ry = (this.gyroX() / 20);
    
    return `translate3d(${finalX}px, ${finalY}px, 0) rotateX(${rx}deg) rotateY(${ry}deg)`;
  });

  isMotionVisuallyActive = computed(() => this.motionEnabled() && this.motionStrength() > 0);

  constructor() {
    effect(() => {
      const p = this.photo();
      const global = this.settingsService.settings();

      // Load Motion Settings
      if (p.motionSettings) {
        this.motionStrength.set(p.motionSettings.strength);
        this.motionEnabled.set(p.motionSettings.enabled);
      } else {
        this.motionStrength.set(global.globalMotionStrength);
        this.motionEnabled.set(global.globalMotionEnabled);
      }

      // Load View Settings (Fit, Pan)
      if (p.viewSettings) {
          this.fitMode.set(p.viewSettings.fitMode);
          this.panX.set(p.viewSettings.panX);
          this.panY.set(p.viewSettings.panY);
      } else {
          this.fitMode.set('height');
          this.panX.set(0);
          this.panY.set(0);
      }

      if (this.motionEnabled()) {
        this.initMotionListener();
      } else {
        this.removeMotionListener();
      }
    });

    // Reactively update boundaries when fitMode changes
    effect(() => {
        const mode = this.fitMode(); // Dependency
        // Small timeout to allow DOM to reflow with new class
        setTimeout(() => this.updateBoundaries(), 50);
    });
  }

  ngAfterViewInit() {
      // Initial calculation
      this.updateBoundaries();
      // Listen for window resize to recalculate limits
      window.addEventListener('resize', this.onResize);
  }

  ngOnDestroy() {
    this.removeMotionListener();
    window.removeEventListener('resize', this.onResize);
  }

  private onResize = () => {
      this.updateBoundaries();
  }

  updateBoundaries() {
      const img = this.imageElement()?.nativeElement;
      if (!img) return;

      const imgW = img.offsetWidth;
      const imgH = img.offsetHeight;
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;

      // Calculate the maximum amount we can move from the center before hitting the edge.
      // If ImageWidth = 1200 and ScreenWidth = 1000, overflow is 200.
      // We can move -100px (left) to +100px (right). So limit is 100.
      const overflowX = Math.max(0, imgW - screenW);
      const overflowY = Math.max(0, imgH - screenH);

      this.limitX.set(overflowX / 2);
      this.limitY.set(overflowY / 2);
  }

  openSettings() { this.isSettingsOpen.set(true); this.uiVisible.set(true); }
  closeSettings() { this.isSettingsOpen.set(false); }
  onBackgroundClick(event: MouseEvent) { this.isSettingsOpen() ? this.closeSettings() : this.uiVisible.update(v => !v); }
  togglePreview() { this.isSettingsOpen.set(false); this.uiVisible.set(false); }
  
  resetSettings() { 
     this.panX.set(0); this.panY.set(0); 
     this.fitMode.set('height');
     const global = this.settingsService.settings();
     this.motionStrength.set(global.globalMotionStrength);
     this.motionEnabled.set(global.globalMotionEnabled);
  }

  saveSettings() { 
    this.photoService.updatePhotoMotion(
        this.photo().id, 
        {
            strength: this.motionStrength(),
            enabled: this.motionEnabled()
        },
        {
            fitMode: this.fitMode(),
            panX: this.panX(),
            panY: this.panY()
        }
    );
    this.closeSettings(); 
  }

  setFitMode(mode: FitMode) { this.fitMode.set(mode); this.panX.set(0); this.panY.set(0); }
  
  updateStrength(event: Event) { 
      const val = parseFloat((event.target as HTMLInputElement).value); 
      this.motionStrength.set(val); 
      if (!this.motionEnabled() && val > 0) {
          this.toggleMotion(); 
      }
  }

  openWallpaperMenu() {
      this.showWallpaperMenu.set(true);
  }
  
  closeWallpaperMenu() {
      this.showWallpaperMenu.set(false);
  }

  applyWallpaper(type: 'home' | 'lock' | 'both') {
      this.closeWallpaperMenu();
      
      const config = {
          photoId: this.photo().id,
          photoUrl: this.photo().url,
          motionEnabled: this.motionEnabled(),
          motionStrength: this.motionStrength(),
          fitMode: this.fitMode(),
          panX: this.panX(),
          panY: this.panY()
      };

      try {
          // 1. Save to Local Storage
          const jsonString = JSON.stringify(config);
          localStorage.setItem('LIVE_WALLPAPER_CONFIG', jsonString);
          localStorage.setItem('LIVE_WALLPAPER_TIMESTAMP', Date.now().toString());
          console.log('Wallpaper Configuration Saved:', config);

          // 2. Call Native Bridge (APK Ready)
          if ((window as any).Android && (window as any).Android.setWallpaper) {
              (window as any).Android.setWallpaper(jsonString);
              this.toastMessage.set('已發送設定至 Android 系統');
          } else {
             this.toastMessage.set('已儲存設定 (Bridge Inactive)');
          }

      } catch (e) {
          console.error('Failed to save wallpaper config', e);
          this.toastMessage.set('儲存失敗');
      }

      setTimeout(() => {
          this.toastMessage.set(null);
      }, 3000);
  }
  
  startDrag(event: PointerEvent) {
    if (this.isSettingsOpen()) return;
    this.isDragging = true;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.initialPanX = this.panX();
    this.initialPanY = this.panY();
    
    // Ensure boundaries are fresh
    this.updateBoundaries();

    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }

  onDrag(event: PointerEvent) {
    if (!this.isDragging) return;
    
    let newX = this.initialPanX + (event.clientX - this.startX);
    let newY = this.initialPanY + (event.clientY - this.startY);
    
    // Apply Boundary Clamping to Manual Pan as well
    // Note: We clamp manual pan slightly differently than render clamp
    // But logically, pan shouldn't exceed limits either.
    const limX = this.limitX();
    const limY = this.limitY();

    newX = Math.max(-limX, Math.min(newX, limX));
    newY = Math.max(-limY, Math.min(newY, limY));

    this.panX.set(newX);
    this.panY.set(newY);
  }

  endDrag() { this.isDragging = false; }

  async requestMotionPermission() {
    this.motionError.set(null);
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const p = await (DeviceOrientationEvent as any).requestPermission();
        if (p === 'granted') {
          this.motionEnabled.set(true);
          this.initMotionListener();
        } else this.motionError.set('Denied.');
      } catch (e) { this.motionError.set('Error.'); }
    } else {
      this.motionEnabled.set(true);
      this.initMotionListener();
    }
  }

  toggleMotion() {
    if (this.motionEnabled()) {
      this.motionEnabled.set(false);
      this.gyroX.set(0); this.gyroY.set(0);
      this.removeMotionListener();
    } else this.requestMotionPermission();
  }

  private handleOrientation = (event: DeviceOrientationEvent) => {
    if (!this.motionEnabled()) return;

    const now = performance.now();
    const targetFps = this.settingsService.settings().targetFps;
    const interval = 1000 / targetFps;

    if (now - this.lastFrameTime < interval) return;
    this.lastFrameTime = now;

    let gamma = event.gamma || 0; 
    let beta = event.beta || 0;
    
    if (gamma > 45) gamma = 45; if (gamma < -45) gamma = -45;
    if (beta > 45) beta = 45; if (beta < -45) beta = -45;

    const baseRange = 50; 
    const strength = this.motionStrength();
    
    this.gyroX.set((gamma / 45) * baseRange * strength);
    this.gyroY.set((beta / 45) * baseRange * strength);
  };

  initMotionListener() {
    window.addEventListener('deviceorientation', this.handleOrientation);
  }
  removeMotionListener() {
    window.removeEventListener('deviceorientation', this.handleOrientation);
  }
}

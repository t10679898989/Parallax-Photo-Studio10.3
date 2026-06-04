import { Injectable, signal, computed, inject, NgZone } from '@angular/core';

export type ThumbnailShape = 'squircle' | 'square' | 'rounded' | 'circle' | 'bevel' | 'leaf' | 'hexagon' | 'diamond';
export type FpsMode = 'eco' | 'balanced' | 'extreme';

export interface AppSettings {
  runInBackground: boolean;
  pauseOnPowerSave: boolean;
  doubleTapToChange: boolean;
  targetFps: number;                           // 保持實體數字，供 Android 原生 Java 渲染使用
  fpsMode: FpsMode;                            // 記錄使用者點擊的檔位模式 ('eco' | 'balanced' | 'extreme')
  globalMotionStrength: number;
  thumbnailShape: ThumbnailShape;
  thumbnailGap: number;
  batteryOptimization: boolean;
  guideWidth: number;                          // 🔥 [核心對齊] 編輯器安全邊界導航條線寬 (單位: px)
  guideColor: string;                          // 🔥 [核心對齊] 編輯器安全邊界導航條顏色 (Hex 色碼)
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private STORAGE_KEY = 'my_parallax_settings';
  private zone = inject(NgZone);

  // 儲存從 Android 原生端主動餵過來的物理螢幕最高重新整理率
  deviceMaxFps = signal<number>(60);

  // 追蹤系統目前是否處於省電狀態的 Signal 屬性
  systemPowerSaveActive = signal<boolean>(false);

  // 核心設定狀態 Signal 中心
  settings = signal<AppSettings>({
    runInBackground: false,
    pauseOnPowerSave: true,
    doubleTapToChange: false,
    targetFps: 60,
    fpsMode: 'balanced', 
    globalMotionStrength: 1.0,
    thumbnailShape: 'squircle',
    thumbnailGap: 8,
    batteryOptimization: false,
    guideWidth: 2,                             // 🔥 預設安全導航條線寬為 2px
    guideColor: '#ffffff'                      // 🔥 預設安全導航條顏色為純白
  });

  constructor() {
    this.loadSettings();

    // 暴露給 Android MainActivity.java 主動呼叫的 JavaScript 窗口
    (window as any).setDeviceMaxFps = (fps: number) => {
      this.zone.run(() => {
        if (fps && fps > 0) {
          this.deviceMaxFps.set(fps);
          this.syncTargetFpsWithMode(this.settings().fpsMode);
        }
      });
    };
  }

  private loadSettings() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.fpsMode) parsed.fpsMode = 'balanced';
        
        // 🔥 向下相容防呆：若使用者的手機本地舊存檔沒有導航條欄位，自動補上安全預設值
        if (parsed.guideWidth === undefined) parsed.guideWidth = 2;
        if (parsed.guideColor === undefined) parsed.guideColor = '#ffffff';
        
        this.settings.set(parsed);
      } catch (e) {
        console.error('Failed to parse settings', e);
      }
    }
  }

  // 更新全域設定並同步至 LocalStorage 與 Android 原生端
  updateSettings(changes: Partial<AppSettings>) {
    this.settings.update(current => {
      const updated = { ...current, ...changes };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
      
      if ((window as any).Android && (window as any).Android.updateSettings) {
        (window as any).Android.updateSettings(JSON.stringify(updated));
      }
      return updated;
    });
  }

  // 點擊三段按鈕時，自動算出真實 FPS 數字，並同時更新模式與真實幀率
  updateFpsMode(mode: FpsMode) {
    const maxFps = this.deviceMaxFps();
    let computedFps = 30; // 'eco' 模式固定 30 FPS

    if (mode === 'extreme') {
      computedFps = maxFps;
    } else if (mode === 'balanced') {
      if (maxFps >= 144) computedFps = 90;
      else if (maxFps >= 120) computedFps = 60;
      else if (maxFps >= 90) computedFps = 60;
      else computedFps = 60;
    }

    this.updateSettings({
      fpsMode: mode,
      targetFps: computedFps
    });
  }

  // 內部重新整理率同步校準機制
  private syncTargetFpsWithMode(mode: FpsMode) {
    const maxFps = this.deviceMaxFps();
    let computedFps = 30;

    if (mode === 'extreme') {
      computedFps = maxFps;
    } else if (mode === 'balanced') {
      if (maxFps >= 144) computedFps = 90;
      else if (maxFps >= 120) computedFps = 60;
      else if (maxFps >= 90) computedFps = 60;
      else computedFps = 60;
    }

    this.settings.update(current => {
      const updated = { ...current, targetFps: computedFps };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }

  // 供 app.component.ts 第 24 行調用的關鍵接收方法，確保全域省電監聽不中斷
  setSystemPowerSave(isActive: boolean) {
    this.systemPowerSaveActive.set(isActive);
  }

  // 動態判定當前視差預覽是否該停止運作
  isEffectivelyPaused(): boolean {
    return this.settings().pauseOnPowerSave && this.systemPowerSaveActive();
  }
}
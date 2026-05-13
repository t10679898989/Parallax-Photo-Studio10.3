import { Component, inject, input, output, signal, computed, effect, viewChild, ElementRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Photo, Playlist, PhotoService, SortOrder } from '../../services/photo.service';
import { SettingsService, ThumbnailShape } from '../../services/settings.service';
import { LazyImgDirective } from '../../directives/lazy-img.directive';
import { Filesystem, Directory } from '@capacitor/filesystem';

interface DetailsState {
  visible: boolean;
  photo: Photo | null;
}

interface PlaylistSettingsState {
  visible: boolean;
  playlistId: string | null;
}

interface CreatePlaylistState {
  visible: boolean;
  name: string;
}

// 🔥 [NEW] 分組結構介面
interface PhotoGroup {
    batchId: number;
    title: string;
    items: Photo[];
}

@Component({
  selector: 'app-gallery',
  imports: [CommonModule, FormsModule, LazyImgDirective],
  host: {
    'class': 'block h-full w-full overflow-hidden' 
  },
  template: `
    <div 
      class="h-full flex flex-col relative select-none bg-slate-900 text-slate-100"
      (pointerup)="onGlobalPointerUp()"
      (pointercancel)="onGlobalPointerUp()"
      (pointermove)="onGlobalPointerMove($event)"
      (click)="onBackgroundClick($event)"
    >
      @if (importProgress().isImporting) {
          <div class="absolute inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
              <div class="flex flex-col items-center gap-4 p-8 rounded-2xl bg-slate-800 border border-slate-700 shadow-2xl">
                  <div class="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                  <div class="text-center">
                      <h3 class="text-xl font-bold text-white mb-1">正在匯入照片...</h3>
                      <p class="text-emerald-400 font-mono text-lg">
                          {{ importProgress().current }} / {{ importProgress().total }}
                      </p>
                  </div>
              </div>
          </div>
      }

      @if (showSettings()) {
          <div class="h-full flex flex-col animate-fade-in bg-slate-900">
              <div class="flex items-center gap-4 p-4 md:p-6 border-b border-slate-800 bg-slate-900 z-10 sticky top-0">
                <button (click)="toggleSettings()" class="p-2 -ml-2 rounded-full hover:bg-slate-800 text-slate-300 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <h2 class="text-xl font-bold text-white">全域設定 (Global Settings)</h2>
              </div>
              
              <div class="flex-1 overflow-y-auto custom-scroll p-4 md:p-6">
                <div class="max-w-2xl mx-auto w-full space-y-8 pb-20">
                  
                  <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                    <h3 class="font-medium text-white flex items-center gap-2 mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                        服務與系統 (Service & System)
                    </h3>
                    
                    <div class="space-y-6">
                        <div class="flex items-center justify-between">
                            <div>
                                <div class="font-medium text-white">Keep Alive Service</div>
                                <div class="text-xs text-slate-400 mt-1">作為前台服務運行，防止被系統自動關閉</div>
                            </div>
                            <button class="w-12 h-6 rounded-full transition-colors relative" 
                                [class.bg-blue-600]="settings.settings().runInBackground" 
                                [class.bg-slate-600]="!settings.settings().runInBackground" 
                                (click)="updateSetting('runInBackground', !settings.settings().runInBackground)"
                            >
                                <div class="absolute top-1 bottom-1 w-4 bg-white rounded-full transition-transform" [class.left-1]="!settings.settings().runInBackground" [class.right-1]="settings.settings().runInBackground"></div>
                            </button>
                        </div>

                        <div class="flex items-center justify-between">
                            <div>
                                <div class="font-medium text-white">Pause on Power Save</div>
                                <div class="text-xs text-slate-400 mt-1">當系統開啟省電模式時，自動暫停效果</div>
                            </div>
                            <button class="w-12 h-6 rounded-full transition-colors relative" 
                                [class.bg-emerald-600]="settings.settings().pauseOnPowerSave" 
                                [class.bg-slate-600]="!settings.settings().pauseOnPowerSave" 
                                (click)="updateSetting('pauseOnPowerSave', !settings.settings().pauseOnPowerSave)"
                            >
                                <div class="absolute top-1 bottom-1 w-4 bg-white rounded-full transition-transform" [class.left-1]="!settings.settings().pauseOnPowerSave" [class.right-1]="settings.settings().pauseOnPowerSave"></div>
                            </button>
                        </div>

                        <div class="flex items-center justify-between">
                            <div>
                                <div class="font-medium text-white">Double Tap to Change</div>
                                <div class="text-xs text-slate-400 mt-1">雙擊主螢幕即可更換桌布</div>
                            </div>
                            <button class="w-12 h-6 rounded-full transition-colors relative" 
                                [class.bg-emerald-600]="settings.settings().doubleTapToChange" 
                                [class.bg-slate-600]="!settings.settings().doubleTapToChange" 
                                (click)="updateSetting('doubleTapToChange', !settings.settings().doubleTapToChange)"
                            >
                              <div class="absolute top-1 bottom-1 w-4 bg-white rounded-full transition-transform" [class.left-1]="!settings.settings().doubleTapToChange" [class.right-1]="settings.settings().doubleTapToChange"></div>
                            </button>
                        </div>
                    </div>
                  </div>

                  <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                      <h3 class="font-medium text-white flex items-center gap-2 mb-4">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                          顯示設定 (Display Settings)
                      </h3>
                        <div class="flex justify-between items-center mb-2">
                          <label class="text-sm font-medium text-slate-300">目標幀率 (Target FPS)</label>
                          <span class="text-emerald-400 font-mono text-sm">{{ settings.settings().targetFps }} FPS</span>
                        </div>
                        <input type="range" min="30" max="120" step="30" [ngModel]="settings.settings().targetFps" (ngModelChange)="updateSetting('targetFps', +$event)" class="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500">
                  </div>

                  <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                      <h3 class="font-medium text-white flex items-center gap-2 mb-4">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10 10 10 0 0 0-10-10z"/><path d="M12 12v6"/><path d="m16.5 16-9-8"/></svg>
                          全域動態預設值 (Global Motion)
                      </h3>

                      <div class="space-y-4">
                          <div class="space-y-2">
                              <div class="flex justify-between text-sm text-slate-300">
                                  <span>強度 (Strength)</span>
                                  <span class="font-mono text-emerald-400">{{ settings.settings().globalMotionStrength }}x</span>
                              </div>
                              <input 
                                  type="range" min="0" max="5" step="0.1" 
                                  [ngModel]="settings.settings().globalMotionStrength" 
                                  (ngModelChange)="updateSetting('globalMotionStrength', +$event)" 
                                  class="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                              >
                          </div>

                          <div class="pt-2 border-t border-slate-700/50">
                              <button 
                                  (click)="applyGlobalMotion()"
                                  class="w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                              >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                  套用到全部 (重置個別設定)
                              </button>
                              <p class="text-xs text-slate-500 mt-2 text-center">重置所有個別照片的動態設定，改為遵循此全域預設值。</p>
                          </div>
                      </div>
                  </div>

                  <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                      <h3 class="font-medium text-white mb-4 flex items-center gap-2">
                         <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                         縮圖外觀 (Thumbnail)
                      </h3>

                      <div class="space-y-6">
                        <div>
                            <div class="flex justify-between text-sm text-slate-300 mb-3">
                                <span>形狀 (Shape)</span>
                                <span class="text-emerald-400 capitalize">{{ settings.settings().thumbnailShape }}</span>
                            </div>
                            <div class="grid grid-cols-4 gap-2">
                                @for (shape of shapes; track shape.id) {
                                    <button 
                                         class="aspect-square bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-all p-2"
                                         [class.ring-2]="settings.settings().thumbnailShape === shape.id"
                                         [class.ring-emerald-500]="settings.settings().thumbnailShape === shape.id"
                                         [class.bg-slate-600]="settings.settings().thumbnailShape === shape.id"
                                         [title]="shape.name"
                                         (click)="updateSetting('thumbnailShape', shape.id)"
                                    >
                                         <div class="w-full h-full bg-slate-400" [ngStyle]="getShapeStyle(shape.id)"></div>
                                    </button>
                                }
                            </div>
                        </div>

                        <div>
                            <div class="flex justify-between text-sm text-slate-300 mb-2">
                                <span>間距 (Gap)</span>
                                <span class="font-mono text-emerald-400">{{ settings.settings().thumbnailGap }}px</span>
                            </div>
                            <input type="range" min="0" max="48" step="4" [ngModel]="settings.settings().thumbnailGap" (ngModelChange)="updateSetting('thumbnailGap', +$event)" class="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500" >
                        </div>
                      </div>
                  </div>

                  <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                    <div class="flex justify-between items-center mb-4">
                      <h3 class="font-medium text-white flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        垃圾桶 (Trash)
                      </h3>
                      <span class="px-2 py-1 bg-slate-900 rounded-lg text-xs text-slate-400 font-mono">{{ trashCount() }} items</span>
                    </div>
                    
                    @if (trashCount() > 0) {
                      <div class="flex gap-3">
                        <button (click)="cleanAllTrash()" class="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2">
                           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                           清空全部
                        </button>
                        <button (click)="restoreAllTrash()" class="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2">
                           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                           全部還原
                        </button>
                      </div>
                    } @else {
                      <div class="text-sm text-slate-500 text-center py-2 bg-slate-900/50 rounded-lg border border-slate-700/50">
                        垃圾桶是空的
                      </div>
                    }
                  </div>

                  <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                      <h3 class="font-medium text-white flex items-center gap-2 mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        備份與還原 (Backup & Restore)
                      </h3>
                      <p class="text-sm text-slate-400 mb-4">
                        將您的設定、縮放比例和播放清單儲存為檔案。還原時，系統會自動比對照片 ID 或檔名來套用設定。
                      </p>
                      <div class="flex gap-3">
                        <button (click)="downloadBackup()" class="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl transition-colors text-sm font-medium flex items-center justify-center gap-2 border border-slate-600">
                           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                           備份設定 (Backup)
                        </button>
                        <button (click)="triggerRestore()" class="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors text-sm font-bold flex items-center justify-center gap-2 shadow-lg">
                           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                           還原設定 (Restore)
                        </button>
                      </div>
                  </div>
                 </div>
              </div>
          </div>
      } @else {
      <header class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 min-h-[44px] shrink-0 p-4 md:p-6 pb-0">
        @if (photoService.activePlaylistId()) {
            <div class="flex items-center gap-3 w-full">
                <button (click)="exitPlaylist()" class="p-2 -ml-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <div class="flex-1 overflow-hidden">
                    <h1 class="text-xl md:text-2xl font-bold text-white truncate">{{ activePlaylist()?.name }}</h1>
                    <div class="flex items-center gap-2 text-slate-400 text-xs mt-0.5">
                       <span>{{ activePlaylistPhotos().length }} items</span>
                       <span>•</span>
                       <span>{{ activePlaylist()?.interval }}s cycle</span>
                       <span>•</span>
                       <span class="capitalize">{{ formatSortOrder(activePlaylist()?.sortOrder) }}</span>
                    </div>
                </div>
                
                <button 
                  (click)="openWallpaperMenu()" 
                  class="w-10 h-10 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full text-emerald-400 hover:bg-slate-700 hover:text-emerald-300 transition-colors shrink-0"
                  title="Set Playlist as Wallpaper"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </button>

                <button 
                  (click)="openPlaylistSettings()" 
                  class="w-10 h-10 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full text-white hover:bg-slate-700 transition-colors shrink-0"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                </button>
            </div>
        } @else {
            <div>
              <h1 class="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                Parallax Studio
              </h1>
              <p class="text-slate-400 text-sm mt-1">Live Wallpaper Manager</p>
            </div>
            
            <div class="flex items-center gap-3 w-full md:w-auto">
              @if (selectedIds().length > 0) {
                 <div class="flex items-center bg-slate-800 border border-slate-600 rounded-xl overflow-hidden shadow-lg animate-fade-in divide-x divide-slate-700 w-full md:w-auto" (click)="$event.stopPropagation()">
                    
                    <div class="px-4 py-2 bg-slate-900/50 flex items-center gap-2">
                       <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                       <span class="text-emerald-400 font-bold font-mono">{{ selectedIds().length }}</span>
                    </div>

                    <label class="px-4 py-2 flex items-center gap-2 cursor-pointer hover:bg-slate-700 transition-colors cursor-pointer select-none flex-1 md:flex-none">
                      <input 
                        type="checkbox" 
                        class="w-4 h-4 rounded border-slate-500 text-emerald-500 focus:ring-emerald-500 bg-slate-800"
                        [checked]="isAllSelected()"
                        (change)="toggleSelectAll()"
                      >
                      <span class="text-sm font-medium text-slate-200 whitespace-nowrap">全選</span>
                    </label>

                    @if (photoService.activePlaylistId()) {
                        <button 
                            (click)="requestDelete($event)" 
                            class="px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors flex items-center gap-2 group" 
                            title="Remove from Playlist"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                            <span class="text-sm font-medium hidden sm:inline">移除</span>
                        </button>
                    } @else {
                        <button 
                            (click)="requestDelete($event)" 
                            class="px-4 py-2 text-red-400 hover:text-white hover:bg-red-600/80 transition-colors flex items-center gap-2 group" 
                            title="Move to Trash"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-400 group-hover:text-white"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            <span class="text-sm font-medium hidden sm:inline">刪除</span>
                        </button>
                    }

                    <button (click)="clearSelection()" class="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors" title="Cancel Selection">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                 </div>
              } @else {
                @if (!photoService.activePlaylistId()) {
                    <button 
                    (click)="toggleSettings()"
                    class="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 transition-colors border border-slate-700"
                    title="Global Settings"
                    >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>

                    <input #fileInput type="file" multiple accept="image/*" class="hidden" (change)="onFileSelected($event)">
                    <input #folderInput type="file" webkitdirectory directory multiple class="hidden" (change)="onFileSelected($event)">

                    <div class="flex rounded-lg bg-slate-800 p-1 ml-auto">
                    <button (click)="fileInput.click()" class="px-3 py-1.5 text-sm font-medium hover:text-white text-slate-300 transition-colors">+ 檔案</button>
                    <div class="w-px bg-slate-700 my-1"></div>
                    <button (click)="folderInput.click()" class="px-3 py-1.5 text-sm font-medium hover:text-white text-slate-300 transition-colors">+ 資料夾</button>
                    </div>
                }
              }
            </div>
        }
      </header>

      @if (!photoService.activePlaylistId()) {
        <div class="flex gap-6 border-b border-slate-700 shrink-0 mx-4 md:mx-6">
            <button 
            class="pb-3 text-sm font-medium transition-colors relative"
            [class.text-white]="activeTab() === 'photos'"
            [class.text-slate-400]="activeTab() !== 'photos'"
            (click)="activeTab.set('photos')"
            >
            所有照片
            @if (activeTab() === 'photos') { <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-full"></div> }
            </button>
            <button 
            class="pb-3 text-sm font-medium transition-colors relative"
            [class.text-white]="activeTab() === 'playlists'"
            [class.text-slate-400]="activeTab() !== 'playlists'"
            (click)="activeTab.set('playlists')"
            >
            播放清單
            @if (activeTab() === 'playlists') { <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-full"></div> }
            </button>
        </div>
      }

      <div class="flex-1 overflow-hidden relative w-full h-full">

        <div 
            class="fixed bottom-8 right-8 z-[80] transition-all duration-300 transform"
            [class.translate-y-32]="selectedIds().length === 0"
            [class.translate-y-0]="selectedIds().length > 0"
        >
            @if (photoService.activePlaylistId()) {
                <button 
                    (click)="requestDelete($event)"
                    class="w-16 h-16 bg-red-600 hover:bg-red-500 text-white rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.5)] flex items-center justify-center transition-colors active:scale-95 border border-red-400"
                    title="Remove from Playlist"
                >
                     <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
            } @else {
                <button 
                    (click)="openActionMenu($event)"
                    class="w-16 h-16 bg-slate-800 hover:bg-slate-700 text-white rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.5)] flex items-center justify-center transition-colors active:scale-95 border border-slate-600"
                    title="More Actions"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                </button>
            }
        </div>

        @if (showActionMenu()) {
            <div class="absolute inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" (click)="closeActionMenu()">
                <div class="bg-slate-800 p-6 rounded-2xl max-w-sm w-full shadow-2xl border border-slate-700 flex flex-col gap-2" (click)="$event.stopPropagation()">
                    <div class="flex items-center justify-between mb-2 pb-2 border-b border-slate-700">
                        <h3 class="text-lg font-bold text-white">更多動作</h3>
                        <span class="text-xs text-slate-400 bg-slate-900 px-2 py-1 rounded">{{ selectedIds().length }} 個項目</span>
                    </div>

                    <div class="relative">
                        <label class="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 block">加入播放清單</label>
                        <div class="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scroll">
                            @for (pl of playlists(); track pl.id) {
                            <button 
                                (click)="addToPlaylist(pl.id)"
                                class="w-full text-left px-4 py-3 bg-slate-700/50 hover:bg-slate-700 rounded-xl text-slate-200 transition-colors flex items-center gap-3"
                            >
                                <div class="w-8 h-8 rounded-lg bg-slate-600 flex items-center justify-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                                </div>
                                {{ pl.name }}
                            </button>
                            }
                            <button 
                                (click)="promptCreatePlaylist()"
                                class="w-full text-left px-4 py-3 border border-dashed border-blue-500/30 text-blue-400 hover:bg-blue-500/10 rounded-xl transition-colors font-medium flex items-center gap-3"
                            >
                                <div class="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                </div>
                                建立新清單
                            </button>
                        </div>
                    </div>

                    <div class="h-px bg-slate-700 my-2"></div>

                    @if (selectedIds().length === 1) {
                        <button 
                            (click)="showDetails()"
                            class="w-full text-left px-4 py-3 bg-slate-700/50 hover:bg-slate-700 rounded-xl text-slate-200 transition-colors flex items-center gap-3"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                            查看詳細資訊
                        </button>
                    }
                </div>
            </div>
        }

        @if (showDeleteConfirm()) {
           <div class="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" (click)="cancelDelete()">
              <div class="bg-slate-800 p-6 rounded-2xl max-w-sm w-full shadow-2xl border border-slate-700" (click)="$event.stopPropagation()">
                 <h3 class="text-xl font-bold text-white mb-2">
                     @if (photoService.activePlaylistId()) { 從播放清單移除? } @else { 移至垃圾桶? }
                 </h3>
                 <p class="text-slate-400 mb-6">
                    @if (photoService.activePlaylistId()) {
                        確定要將 {{ selectedIds().length }} 個項目從 "{{activePlaylist()?.name}}" 移除嗎? 它們仍會保留在您的主相簿中。
                    } @else {
                        確定要將 {{ selectedIds().length }} 個項目移至垃圾桶嗎?
                    }
                 </p>
                 <div class="flex gap-3">
                    <button (click)="cancelDelete()" class="flex-1 py-2.5 bg-slate-700 text-white rounded-xl hover:bg-slate-600 transition-colors font-medium">取消</button>
                    <button (click)="confirmDelete()" class="flex-1 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-500 transition-colors font-medium">
                        @if (photoService.activePlaylistId()) { 移除 } @else { 刪除 }
                    </button>
                 </div>
              </div>
           </div>
        }

        @if (createPlaylistState().visible) {
           <div class="absolute inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" (click)="cancelCreatePlaylist()">
              <div class="bg-slate-800 p-6 rounded-2xl max-w-sm w-full shadow-2xl border border-blue-500/30" (click)="$event.stopPropagation()">
                 <h3 class="text-xl font-bold text-white mb-4">建立播放清單</h3>
                 <div class="space-y-4">
                    <div class="space-y-2">
                        <label class="text-xs text-slate-400 font-bold uppercase tracking-wider">清單名稱</label>
                        <input 
                            #playlistNameInput
                            type="text" 
                            [value]="createPlaylistState().name" 
                            (input)="updateCreatePlaylistName($event)"
                            class="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:border-blue-500 outline-none"
                            placeholder="我的播放清單"
                            (keyup.enter)="confirmCreatePlaylist()"
                        >
                    </div>
                     <div class="flex gap-3">
                        <button (click)="cancelCreatePlaylist()" class="flex-1 py-2.5 bg-slate-700 text-white rounded-xl hover:bg-slate-600 transition-colors font-medium">取消</button>
                        <button (click)="confirmCreatePlaylist()" class="flex-1 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-colors font-bold">建立</button>
                     </div>
                 </div>
              </div>
           </div>
        }

        @if (showDoubleTapConfirm()) {
           <div class="absolute inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in" (click)="cancelDoubleTapConfirm()">
              <div class="bg-slate-800 p-6 rounded-2xl max-w-sm w-full shadow-2xl border border-emerald-500/30" (click)="$event.stopPropagation()">
                 <h3 class="text-xl font-bold text-white mb-2">啟用雙擊切換?</h3>
                 <p class="text-slate-400 mb-6">您想要在桌面上雙擊 (Double Tap) 來快速切換下一張桌布嗎?</p>
                 <div class="flex gap-3">
                    <button (click)="confirmDoubleTap(false)" class="flex-1 py-3 bg-slate-700 text-white rounded-xl hover:bg-slate-600 transition-colors font-medium">不啟用</button>
                    <button (click)="confirmDoubleTap(true)" class="flex-1 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-colors font-bold">啟用</button>
                 </div>
              </div>
           </div>
        }

        @if (deletePlaylistConfirmVisible()) {
           <div class="absolute inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" (click)="cancelDeletePlaylist()">
              <div class="bg-slate-800 p-6 rounded-2xl max-w-sm w-full shadow-2xl border border-red-500/30" (click)="$event.stopPropagation()">
                 <h3 class="text-xl font-bold text-white mb-2 text-red-400">刪除播放清單?</h3>
                 <p class="text-slate-400 mb-6">確定要刪除 "{{ tempPlaylistName }}" 嗎? 照片仍會保留在您的主相簿中。</p>
                 <div class="flex gap-3">
                    <button (click)="cancelDeletePlaylist()" class="flex-1 py-2.5 bg-slate-700 text-white rounded-xl hover:bg-slate-600 transition-colors font-medium">取消</button>
                    <button (click)="confirmDeletePlaylist()" class="flex-1 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-500 transition-colors font-medium">刪除</button>
                 </div>
              </div>
           </div>
        }

        @if (showEmptyTrashConfirm()) {
           <div class="absolute inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" (click)="cancelEmptyTrash()">
              <div class="bg-slate-800 p-6 rounded-2xl max-w-sm w-full shadow-2xl border border-red-500/30" (click)="$event.stopPropagation()">
                 <h3 class="text-xl font-bold text-white mb-2 text-red-400">清空垃圾桶?</h3>
                 <p class="text-slate-400 mb-6">永久刪除 {{ trashCount() }} 個項目? 此動作無法復原。</p>
                 <div class="flex gap-3">
                    <button (click)="cancelEmptyTrash()" class="flex-1 py-2.5 bg-slate-700 text-white rounded-xl hover:bg-slate-600 transition-colors font-medium">取消</button>
                    <button (click)="confirmEmptyTrash()" class="flex-1 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-500 transition-colors font-medium">永久刪除</button>
                 </div>
              </div>
           </div>
        }
        
        @if (showWallpaperMenu()) {
            <div class="absolute inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in" (click)="closeWallpaperMenu()">
                <div class="bg-slate-800 rounded-t-2xl sm:rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-700" (click)="$event.stopPropagation()">
                    <div class="px-6 py-5 border-b border-slate-700">
                        <h3 class="text-xl font-medium text-white">設定播放清單桌布</h3>
                        <p class="text-xs text-slate-400 mt-1">循環週期: {{ activePlaylist()?.interval }} 秒</p>
                        <p class="text-xs text-slate-400">排序: {{ formatSortOrder(activePlaylist()?.sortOrder) }}</p>
                    </div>
                    <div class="flex flex-col">
                        <button (click)="openDoubleTapConfirm('home')" class="px-6 py-4 flex items-center gap-4 text-slate-200 hover:bg-slate-700/50 transition-colors text-left group">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400 group-hover:text-emerald-400"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                            <span class="text-base">主畫面</span>
                        </button>
                        <button (click)="openDoubleTapConfirm('lock')" class="px-6 py-4 flex items-center gap-4 text-slate-200 hover:bg-slate-700/50 transition-colors text-left group">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400 group-hover:text-emerald-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            <span class="text-base">螢幕鎖定</span>
                        </button>
                        <button (click)="openDoubleTapConfirm('both')" class="px-6 py-4 flex items-center gap-4 text-slate-200 hover:bg-slate-700/50 transition-colors text-left group">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400 group-hover:text-emerald-400"><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M12 18h.01"/></svg>
                            <span class="text-base">主畫面和螢幕鎖定</span>
                        </button>
                    </div>
                </div>
            </div>
        }

        @if (playlistSettingsState().visible) {
           <div class="absolute inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in" (click)="closePlaylistSettings()">
              <div class="bg-slate-800 p-6 rounded-2xl max-w-sm w-full shadow-2xl border border-slate-700 space-y-6" (click)="$event.stopPropagation()">
                 <div class="flex justify-between items-center">
                    <h3 class="text-xl font-bold text-white">播放清單設定</h3>
                    <button (click)="closePlaylistSettings()" class="text-slate-400 hover:text-white"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                 </div>

                 <div class="space-y-2">
                    <label class="text-xs text-slate-400 font-bold uppercase tracking-wider">名稱</label>
                    <input type="text" [(ngModel)]="tempPlaylistName" class="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:border-emerald-500 outline-none">
                 </div>

                 <div class="space-y-2">
                    <div class="flex justify-between">
                        <label class="text-xs text-slate-400 font-bold uppercase tracking-wider">桌布切換間隔</label>
                        <span class="text-emerald-400 font-mono text-sm">{{ tempPlaylistInterval }}秒</span>
                    </div>
                    <input type="range" min="5" max="300" [(ngModel)]="tempPlaylistInterval" class="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500">
                    <div class="flex justify-between text-xs text-slate-500">
                        <span>5秒</span>
                        <span>300秒</span>
                    </div>
                 </div>

                 <div class="space-y-2">
                    <label class="text-xs text-slate-400 font-bold uppercase tracking-wider">排序方式</label>
                    <div class="relative">
                        <select [(ngModel)]="tempSortOrder" class="w-full appearance-none bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:border-emerald-500 outline-none pr-10">
                            <option value="custom">自訂 (加入順序)</option>
                            <option value="random">隨機播放 (Shuffle)</option>
                            <option value="name_asc">名稱 (A-Z)</option>
                            <option value="name_desc">名稱 (Z-A)</option>
                            <option value="date_desc">新增日期 (新到舊)</option>
                            <option value="date_asc">新增日期 (舊到新)</option>
                        </select>
                        <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                        </div>
                    </div>
                 </div>

                 <div class="pt-4 border-t border-slate-700 flex flex-col gap-3">
                    <button (click)="savePlaylistSettings()" class="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-slate-200 transition-colors">儲存變更</button>
                    <button (click)="requestDeletePlaylist()" class="w-full py-3 text-red-400 font-medium hover:text-red-300 transition-colors border border-red-500/30 rounded-xl hover:bg-red-500/10">刪除播放清單</button>
                 </div>
              </div>
           </div>
        }

        @if (activeTab() === 'photos' || photoService.activePlaylistId()) {
          @let currentPhotos = photoService.activePlaylistId() ? activePlaylistPhotos() : photos();
          
          @if (currentPhotos.length === 0) {
            <div class="h-full flex flex-col items-center justify-center text-center">
               <div class="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4 text-slate-500">
                 <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
               </div>
               <h3 class="text-xl font-medium text-white mb-2">沒有照片</h3>
               <p class="text-slate-400 max-w-sm">使用上方按鈕匯入照片。</p>
            </div>
          } @else {
            <div 
               class="overflow-y-auto h-full w-full custom-scroll"
               (scroll)="onScroll()"
            >
              @if (!photoService.activePlaylistId()) {
                  @for (group of groupedPhotos(); track group.batchId) {
                      <div class="mb-6">
                          <div class="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-sm px-4 py-3 flex items-center justify-between border-b border-slate-800 mb-2">
                              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-400"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                  {{ group.title }}
                              </h3>
                              
                              <div class="flex items-center gap-3">
                                  <span class="text-xs text-slate-500">{{ group.items.length }} 張</span>
                                  <button (click)="selectBatch(group)" class="text-xs font-medium text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded hover:bg-slate-800 transition-colors">
                                      全選此批
                                  </button>
                              </div>
                          </div>

                          <div 
                              class="grid px-4" 
                              [style.grid-template-columns]="'repeat(auto-fill, minmax(100px, 1fr))'" 
                              [style.gap.px]="settings.settings().thumbnailGap"
                          >
                              @for (photo of group.items; track photo.id) {
                                  <div 
                                    class="relative aspect-square transition-transform select-none bg-slate-800"
                                    [attr.data-id]="photo.id"
                                    [ngStyle]="currentShapeStyle()"
                                    [class.scale-95]="selectedIds().includes(photo.id)"
                                    (pointerdown)="onPointerDown($event, photo.id)"
                                    (click)="onPhotoClick($event, photo)"
                                  >
                                    @if (selectedIds().includes(photo.id)) {
                                        <div class="absolute inset-0 bg-emerald-500/50 z-10 pointer-events-none mix-blend-overlay"></div>
                                        <div class="absolute inset-0 border-4 border-emerald-500 z-20 pointer-events-none"></div>
                                    }

                                    <img 
                                      [appLazyLoad]="photo.url" 
                                      class="w-full h-full object-cover pointer-events-none block"
                                      loading="lazy"
                                    >
                                    
                                    @if (selectedIds().length > 0 || isSelecting()) {
                                      <div class="absolute top-2 right-2 w-6 h-6 rounded-full z-30 flex items-center justify-center transition-colors shadow-sm"
                                           [class.bg-emerald-500]="selectedIds().includes(photo.id)"
                                           [class.bg-black-50]="!selectedIds().includes(photo.id)"
                                           [class.border-2]="!selectedIds().includes(photo.id)"
                                           [class.border-white]="!selectedIds().includes(photo.id)"
                                      >
                                          @if (selectedIds().includes(photo.id)) {
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="text-white"><polyline points="20 6 9 17 4 12"/></svg>
                                          }
                                      </div>
                                    }
                                  </div>
                              }
                          </div>
                      </div>
                  }
              } @else {
                  <div 
                      class="grid px-4 pt-4" 
                      [style.grid-template-columns]="'repeat(auto-fill, minmax(100px, 1fr))'" 
                      [style.gap.px]="settings.settings().thumbnailGap"
                  >
                      @for (photo of currentPhotos; track photo.id) {
                          <div 
                            class="relative aspect-square transition-transform select-none bg-slate-800"
                            [attr.data-id]="photo.id"
                            [ngStyle]="currentShapeStyle()"
                            [class.scale-95]="selectedIds().includes(photo.id)"
                            (pointerdown)="onPointerDown($event, photo.id)"
                            (click)="onPhotoClick($event, photo)"
                          >
                            @if (selectedIds().includes(photo.id)) {
                                <div class="absolute inset-0 bg-emerald-500/50 z-10 pointer-events-none mix-blend-overlay"></div>
                                <div class="absolute inset-0 border-4 border-emerald-500 z-20 pointer-events-none"></div>
                            }

                            <img 
                              [appLazyLoad]="photo.url" 
                              class="w-full h-full object-cover pointer-events-none block"
                              loading="lazy"
                            >
                            
                            @if (selectedIds().length > 0 || isSelecting()) {
                              <div class="absolute top-2 right-2 w-6 h-6 rounded-full z-30 flex items-center justify-center transition-colors shadow-sm"
                                   [class.bg-emerald-500]="selectedIds().includes(photo.id)"
                                   [class.bg-black-50]="!selectedIds().includes(photo.id)"
                                   [class.border-2]="!selectedIds().includes(photo.id)"
                                   [class.border-white]="!selectedIds().includes(photo.id)"
                              >
                                  @if (selectedIds().includes(photo.id)) {
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="text-white"><polyline points="20 6 9 17 4 12"/></svg>
                                  }
                              </div>
                            }
                          </div>
                      }
                  </div>
              }
              <div class="h-32 w-full"></div>
            </div>
          }
        } @else {
          <div class="h-full overflow-y-auto pb-20 no-scrollbar p-4 md:p-6">
              <button class="w-full py-3 mb-4 border border-dashed border-slate-700 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors flex items-center justify-center gap-2"
                (click)="promptCreatePlaylist()">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                建立新播放清單
              </button>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                @for (playlist of playlists(); track playlist.id) {
                  <button 
                    (click)="enterPlaylist(playlist.id)"
                    class="bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-slate-600 transition-colors text-left group w-full"
                  >
                      <div class="flex justify-between items-start mb-2">
                        <h3 class="font-bold text-white group-hover:text-emerald-400 transition-colors">{{ playlist.name }}</h3>
                        <span class="text-xs bg-slate-900 px-2 py-1 rounded text-slate-400">{{ playlist.photoIds.length }} 個項目</span>
                      </div>
                      <div class="aspect-video bg-slate-900 rounded-lg flex items-center justify-center text-slate-600 overflow-hidden relative">
                        @if(playlist.photoIds.length > 0) {
                            @let coverId = playlist.photoIds[0];
                            @let coverPhoto = getPhotoById(coverId);
                            @if(coverPhoto) {
                                <img [src]="coverPhoto.url" class="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity">
                            } @else {
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                            }
                        } @else {
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                        }
                      </div>
                      <div class="flex justify-between items-center mt-2">
                          <p class="text-xs text-slate-500">{{ playlist.interval }}秒 循環</p>
                          <p class="text-xs text-slate-500 capitalize">{{ formatSortOrder(playlist.sortOrder) }}</p>
                      </div>
                  </button>
                }
             </div>
          </div>
        }
      </div>
      
      @if (toastMessage()) {
          <div class="absolute bottom-12 left-1/2 -translate-x-1/2 z-[120] px-6 py-3 bg-slate-800/90 backdrop-blur-md rounded-full border border-slate-600 shadow-2xl animate-slide-up flex items-center gap-2 max-w-[90%] whitespace-nowrap">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-400"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span class="font-medium text-white text-sm">{{ toastMessage() }}</span>
          </div>
      }
      }
    </div>
  `,
  styles: [`
    .animate-fade-in { animation: fadeIn 0.2s ease-out; }
    .animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
    .animate-spin { animation: spin 1s linear infinite; }
    @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
    @keyframes slideUp { from { transform: translate(-50%, 100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .custom-scroll::-webkit-scrollbar { width: 10px; }
    .custom-scroll::-webkit-scrollbar-track { background: #1e293b; }
    .custom-scroll::-webkit-scrollbar-thumb { background-color: #475569; border-radius: 4px; border: 2px solid #1e293b; background-clip: content-box; }
    .custom-scroll::-webkit-scrollbar-thumb:hover { background-color: #64748b; }
  `]
})
export class GalleryComponent {
  photos = input.required<Photo[]>();
  
  photoService = inject(PhotoService);
  playlists = this.photoService.playlists;
  settings = inject(SettingsService);
  
  zone = inject(NgZone);

  restoreInput = viewChild<ElementRef<HTMLInputElement>>('restoreInput');

  selectPhoto = output<string>();
  importFiles = output<FileList>();

  // UI State
  showSettings = signal(false);
  activeTab = signal<'photos' | 'playlists'>('photos');
  showActionMenu = signal(false);
  showDeleteConfirm = signal(false);
  showEmptyTrashConfirm = signal(false);
  
  createPlaylistState = signal<CreatePlaylistState>({ visible: false, name: '' });
  
  deletePlaylistConfirmVisible = signal(false);
  pendingDeletePlaylistId = signal<string | null>(null);

  playlistSettingsState = signal<PlaylistSettingsState>({ visible: false, playlistId: null });
  tempPlaylistName = '';
  tempPlaylistInterval = 60;
  tempSortOrder: SortOrder = 'custom';
  
  showWallpaperMenu = signal(false);
  toastMessage = signal<string | null>(null);

  selectedIds = signal<string[]>([]);
  isSelecting = signal(false);
  
  detailsState = signal<DetailsState>({ visible: false, photo: null });

  showDoubleTapConfirm = signal(false);
  pendingWallpaperType = signal<'home' | 'lock' | 'both' | null>(null);

  importProgress = this.photoService.importProgress;

  trashCount = computed(() => this.photoService.trash().length);

  activePlaylist = computed(() => {
    return this.playlists().find(p => p.id === this.photoService.activePlaylistId()) || null;
  });

  // 🔥 [NEW] 分組邏輯：將照片依據 batchId 分組
  groupedPhotos = computed(() => {
      const allPhotos = this.photos();
      const groups = new Map<number, PhotoGroup>();
      
      // 未分類的批次 ID (給舊照片用)
      const UNKNOWN_BATCH = 0;

      allPhotos.forEach(photo => {
          const batchId = photo.batchId || UNKNOWN_BATCH;
          
          if (!groups.has(batchId)) {
              let title = '早期匯入';
              if (batchId !== UNKNOWN_BATCH) {
                  const date = new Date(batchId);
                  title = date.toLocaleString('zh-TW', { 
                      year: 'numeric', 
                      month: '2-digit', 
                      day: '2-digit', 
                      hour: '2-digit', 
                      minute: '2-digit' 
                  }) + ' 匯入';
              }
              groups.set(batchId, { batchId, title, items: [] });
          }
          groups.get(batchId)?.items.push(photo);
      });

      // 將 Map 轉為陣列，並依照批次時間倒序排列 (新的在上面)
      return Array.from(groups.values()).sort((a, b) => b.batchId - a.batchId);
  });

  activePlaylistPhotos = computed(() => {
      const playlist = this.activePlaylist();
      if (!playlist) return [];
      
      let items = this.photos().filter(p => playlist.photoIds.includes(p.id));
      
      switch (playlist.sortOrder) {
          case 'name_asc': return [...items].sort((a, b) => a.name.localeCompare(b.name));
          case 'name_desc': return [...items].sort((a, b) => b.name.localeCompare(a.name));
          case 'date_asc': return [...items].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          case 'date_desc': return [...items].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          case 'random': return items; 
          case 'custom': default: return items;
      }
  });

  private longPressTimeout: any;
  private pointerStartX = 0;
  private pointerStartY = 0;

  shapes: {id: ThumbnailShape, name: string}[] = [
    { id: 'squircle', name: 'Squircle' },
    { id: 'square', name: 'Square' },
    { id: 'rounded', name: 'Rounded' },
    { id: 'circle', name: 'Circle' },
    { id: 'bevel', name: 'Bevel' },
    { id: 'leaf', name: 'Leaf' },
    { id: 'hexagon', name: 'Hexagon' },
    { id: 'diamond', name: 'Diamond' },
  ];

  getShapeStyle(shape: ThumbnailShape): { [key: string]: string } {
    switch (shape) {
        case 'squircle': return { 'border-radius': '22%' };
        case 'square': return { 'border-radius': '0' };
        case 'rounded': return { 'border-radius': '12px' };
        case 'circle': return { 'border-radius': '50%' };
        case 'bevel': return { 'clip-path': 'polygon(20% 0%, 80% 0%, 100% 20%, 100% 80%, 80% 100%, 20% 100%, 0% 80%, 0% 20%)' };
        case 'leaf': return { 'border-radius': '0px 24px 0px 24px' };
        case 'hexagon': return { 'clip-path': 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' };
        case 'diamond': return { 'clip-path': 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' };
        default: return {};
    }
  }

  currentShapeStyle = computed(() => {
    return {
        ...this.getShapeStyle(this.settings.settings().thumbnailShape),
        overflow: 'hidden'
    };
  });

  constructor() {
      (window as any).onRestoreFileLoaded = (jsonContent: string) => {
          this.zone.run(() => {
              const result = this.photoService.restoreBackup(jsonContent);
              this.showToast(result.message);
          });
      };
  }

  getPhotoById(id: string): Photo | undefined {
      return this.photos().find(p => p.id === id);
  }

  isAllSelected = computed(() => {
    const total = this.photoService.activePlaylistId() ? this.activePlaylistPhotos().length : this.photos().length;
    return total > 0 && this.selectedIds().length === total;
  });

  toggleSelectAll() {
    if (this.isAllSelected()) {
      this.clearSelection();
    } else {
      const source = this.photoService.activePlaylistId() ? this.activePlaylistPhotos() : this.photos();
      this.selectedIds.set(source.map(p => p.id));
    }
  }

  // 🔥 [NEW] 批次全選功能
  selectBatch(group: PhotoGroup) {
      const batchIds = group.items.map(p => p.id);
      // 將這一批的 ID 加入目前的選取清單 (Set 邏輯，避免重複)
      const current = new Set(this.selectedIds());
      batchIds.forEach(id => current.add(id));
      this.selectedIds.set(Array.from(current));
      this.showToast(`已選取 ${batchIds.length} 張照片`);
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const count = await this.photoService.addPhotos(input.files);
      if (count > 0) {
        this.showToast(`已匯入 ${count} 張照片`);
      } else {
        this.showToast('沒有匯入新照片');
      }
    }
    input.value = '';
  }
  
  showToast(msg: string) {
      this.toastMessage.set(msg);
      setTimeout(() => this.toastMessage.set(null), 3000);
  }

  onPointerDown(event: PointerEvent, photoId: string) {
    if (event.button !== 0) return;
    this.pointerStartX = event.clientX;
    this.pointerStartY = event.clientY;

    this.longPressTimeout = setTimeout(() => {
      this.startSelectionMode(photoId);
    }, 400); 
  }

  onScroll() {
    if (this.longPressTimeout) {
      clearTimeout(this.longPressTimeout);
      this.longPressTimeout = null;
    }
  }

  onGlobalPointerMove(event: PointerEvent) {
    if (this.isSelecting()) {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const photoEl = target?.closest('[data-id]');
      
      if (photoEl) {
        const id = photoEl.getAttribute('data-id');
        if (id && !this.selectedIds().includes(id)) {
          this.selectedIds.update(ids => [...ids, id]);
          if (navigator.vibrate) navigator.vibrate(10); 
        }
      }
    } else {
      const dist = Math.hypot(event.clientX - this.pointerStartX, event.clientY - this.pointerStartY);
      if (dist > 15 && this.longPressTimeout) {
        clearTimeout(this.longPressTimeout);
        this.longPressTimeout = null;
      }
    }
  }

  onGlobalPointerUp() {
    if (this.longPressTimeout) {
      clearTimeout(this.longPressTimeout);
      this.longPressTimeout = null;
    }
    if (this.isSelecting()) {
      this.isSelecting.set(false);
    }
  }

  startSelectionMode(initialId: string) {
    this.isSelecting.set(true);
    if (!this.selectedIds().includes(initialId)) {
      this.selectedIds.update(ids => [...ids, initialId]);
    }
    if (navigator.vibrate) navigator.vibrate(50);
  }

  onPhotoClick(event: MouseEvent, photo: Photo) {
    event.stopPropagation();
    if (this.selectedIds().length > 0) {
      this.toggleSelection(photo.id);
    } else {
      this.selectPhoto.emit(photo.id);
    }
  }

  toggleSelection(id: string) {
    this.selectedIds.update(ids => {
      if (ids.includes(id)) return ids.filter(i => i !== id);
      return [...ids, id];
    });
  }

  onBackgroundClick(event: MouseEvent) {
    if (event.target === event.currentTarget && this.selectedIds().length > 0) {
        this.clearSelection();
    }
  }

  openActionMenu(event: Event) {
    event.stopPropagation();
    this.showActionMenu.set(true);
  }

  closeActionMenu() {
    this.showActionMenu.set(false);
  }

  toggleSettings() { this.showSettings.update(v => !v); }
  
  updateSetting(k: string, v: any) { 
      // 🔥 [FIX] 防呆：如果是 FPS 或 間隔，強制轉成數字再存
      if (['targetFps', 'thumbnailGap', 'globalMotionStrength'].includes(k)) {
          v = Number(v);
      }
      this.settings.updateSettings({[k]: v}); 
  }
  
  applyGlobalMotion() { 
      this.photoService.clearAllMotionOverrides();
      alert(`已將全域動態設定套用到所有照片 (已清除個別設定)。`); 
  }

  clearSelection() {
    this.selectedIds.set([]);
    this.showActionMenu.set(false);
  }

  addToPlaylist(playlistId: string) {
    this.photoService.addToPlaylist(playlistId, this.selectedIds());
    this.clearSelection();
  }

  promptCreatePlaylist() {
    this.createPlaylistState.set({ visible: true, name: '' });
  }

  updateCreatePlaylistName(event: Event) {
      const input = event.target as HTMLInputElement;
      this.createPlaylistState.update(s => ({ ...s, name: input.value }));
  }

  confirmCreatePlaylist() {
      const name = this.createPlaylistState().name.trim();
      if (name) {
          const newId = this.photoService.createPlaylist(name);
          if (this.selectedIds().length > 0) {
              this.photoService.addToPlaylist(newId, this.selectedIds());
              this.clearSelection();
          }
      }
      this.cancelCreatePlaylist();
  }

  cancelCreatePlaylist() {
      this.createPlaylistState.set({ visible: false, name: '' });
  }

  showDetails() {
    const id = this.selectedIds()[0];
    const photo = this.photos().find(p => p.id === id);
    if (photo) {
      this.detailsState.set({ visible: true, photo });
      this.closeActionMenu();
    }
  }

  closeDetails() {
    this.detailsState.set({ visible: false, photo: null });
  }

  requestDelete(event?: Event) {
    event?.stopPropagation(); 
    if (this.selectedIds().length === 0) return;
    this.showDeleteConfirm.set(true);
  }

  cancelDelete() {
    this.showDeleteConfirm.set(false);
  }

  confirmDelete() {
    const ids = this.selectedIds();
    const playlistId = this.photoService.activePlaylistId();
    if (playlistId) {
        this.photoService.removeFromPlaylist(playlistId, ids);
    } else {
        this.photoService.moveToTrash(ids);
    }
    this.clearSelection();
    this.showDeleteConfirm.set(false);
  }

  cleanAllTrash() {
    this.showEmptyTrashConfirm.set(true);
  }

  confirmEmptyTrash() {
    this.photoService.emptyTrash();
    this.showEmptyTrashConfirm.set(false);
  }

  cancelEmptyTrash() {
    this.showEmptyTrashConfirm.set(false);
  }

  restoreAllTrash() {
    this.photoService.restoreAllFromTrash();
  }

  enterPlaylist(id: string) {
      this.photoService.activePlaylistId.set(id);
      this.clearSelection();
  }

  exitPlaylist() {
      this.photoService.activePlaylistId.set(null);
      this.clearSelection();
  }

  openPlaylistSettings() {
      const pl = this.activePlaylist();
      if (!pl) return;
      this.tempPlaylistName = pl.name;
      this.tempPlaylistInterval = pl.interval;
      this.tempSortOrder = pl.sortOrder;
      this.playlistSettingsState.set({ visible: true, playlistId: pl.id });
  }

  closePlaylistSettings() {
      this.playlistSettingsState.set({ visible: false, playlistId: null });
  }

  savePlaylistSettings() {
      const id = this.playlistSettingsState().playlistId;
      if (id) {
          this.photoService.updatePlaylist(id, {
              name: this.tempPlaylistName,
              interval: this.tempPlaylistInterval,
              sortOrder: this.tempSortOrder
          });
      }
      this.closePlaylistSettings();
  }

  requestDeletePlaylist() {
      const id = this.playlistSettingsState().playlistId;
      if (!id) return;

      this.pendingDeletePlaylistId.set(id);
      this.closePlaylistSettings();
      this.deletePlaylistConfirmVisible.set(true);
  }

  cancelDeletePlaylist() {
      this.deletePlaylistConfirmVisible.set(false);
      this.pendingDeletePlaylistId.set(null);
  }

  confirmDeletePlaylist() {
      const id = this.pendingDeletePlaylistId();
      if (id) {
          this.exitPlaylist(); 
          this.photoService.deletePlaylist(id);
      }
      this.deletePlaylistConfirmVisible.set(false);
      this.pendingDeletePlaylistId.set(null);
  }
  
  openWallpaperMenu() {
      this.showWallpaperMenu.set(true);
  }
  
  closeWallpaperMenu() {
      this.showWallpaperMenu.set(false);
  }

  openDoubleTapConfirm(type: 'home' | 'lock' | 'both') {
      this.closeWallpaperMenu();
      this.pendingWallpaperType.set(type);
      this.showDoubleTapConfirm.set(true);
  }

  cancelDoubleTapConfirm() {
      this.showDoubleTapConfirm.set(false);
      this.pendingWallpaperType.set(null);
  }

  confirmDoubleTap(enable: boolean) {
      this.settings.updateSettings({ doubleTapToChange: enable });
      const type = this.pendingWallpaperType();
      if (type) {
          this.applyPlaylistWallpaper(type);
      }
      this.showDoubleTapConfirm.set(false);
      this.pendingWallpaperType.set(null);
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // 🔥🔥🔥 修正版：支援獨立秒數設定 (Home/Lock 分開存)
  async applyPlaylistWallpaper(type: 'home' | 'lock' | 'both') {
      const playlist = this.activePlaylist();
      if (!playlist || playlist.photoIds.length === 0) {
        this.showToast('錯誤：播放清單是空的');
        return;
      }

      this.showToast(`處理中... 共 ${playlist.photoIds.length} 張照片 (${type.toUpperCase()})`);

      try {
          const playlistPaths: string[] = [];
          const playlistConfigs: any[] = []; 
          let newFilesCount = 0;

          // --- 1. 圖片處理迴圈 (檢查快取、複製檔案) ---
          for (let i = 0; i < playlist.photoIds.length; i++) {
              const photoId = playlist.photoIds[i];
              const photo = this.getPhotoById(photoId);
              if (!photo) continue;

              // 建立個別設定 (Motion/Scale)
              const specificConfig = {
                  motionStrength: photo.motionSettings ? photo.motionSettings.strength : this.settings.settings().globalMotionStrength,
                  motionEnabled: photo.motionSettings ? photo.motionSettings.enabled : true,
                  scale: photo.viewSettings ? photo.viewSettings.scale : 1.1,
                  panX: photo.viewSettings ? photo.viewSettings.panX : 0,
                  panY: photo.viewSettings ? photo.viewSettings.panY : 0
              };
              playlistConfigs.push(specificConfig);

              const fileName = `cached_${photoId}.jpg`;
              
              // 檢查快取是否存在
              try {
                  const stat = await Filesystem.stat({
                      path: fileName,
                      directory: Directory.Data
                  });
                  playlistPaths.push(stat.uri.replace('file://', ''));
                  continue; 
              } catch (e) { }

              // 準備來源路徑
              const sourcePath = (photo as any).path || (photo as any).webPath;
              let copySuccess = false;

              // 嘗試直接複製 (效能較好)
              if (sourcePath && sourcePath.startsWith('file://')) {
                  try {
                      await Filesystem.copy({
                          from: sourcePath,
                          to: fileName,
                          toDirectory: Directory.Data
                      });
                      const stat = await Filesystem.stat({
                          path: fileName,
                          directory: Directory.Data
                      });
                      playlistPaths.push(stat.uri.replace('file://', ''));
                      copySuccess = true;
                  } catch (copyError) {}
              }

              // 如果複製失敗 (例如來自 Web 或相簿 URI)，則讀取並寫入
              if (!copySuccess) {
                  let base64Data: string;
                  if (sourcePath) {
                      const file = await Filesystem.readFile({ path: sourcePath });
                      base64Data = file.data as string;
                  } else if (photo.url) {
                      const response = await fetch(photo.url);
                      const blob = await response.blob();
                      base64Data = await this.blobToBase64(blob);
                  } else {
                      continue;
                  }

                  const savedFile = await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Directory.Data,
                    recursive: true
                  });
                  playlistPaths.push(savedFile.uri.replace('file://', ''));
              }
              
              newFilesCount++;
              if (newFilesCount % 10 === 0) {
                  this.showToast(`正在最佳化新照片... (${newFilesCount})`);
              }
          }

          if (playlistPaths.length === 0) throw new Error('沒有任何照片處理成功');

          // --- 2. 準備設定 Payload ---
          
          // 取得當前清單設定的秒數
          const newInterval = playlist.interval || 60;

          const updatePayload: any = {
              mode: 'playlist',
              sortOrder: playlist.sortOrder,
              motionStrength: this.settings.settings().globalMotionStrength,
              targetFps: this.settings.settings().targetFps,
              doubleTapToChange: this.settings.settings().doubleTapToChange
          };

          // --- 3. 根據類型寫入對應欄位 (包含路徑與秒數) ---
          
          if (type === 'home' || type === 'both') {
              updatePayload.playlist = playlistPaths;
              updatePayload.playlistConfigs = playlistConfigs;
              updatePayload.home_interval = newInterval; // 🔥 寫入主畫面秒數
          }
          
          if (type === 'lock' || type === 'both') {
              updatePayload.lock_playlist = playlistPaths;
              updatePayload.lock_playlistConfigs = playlistConfigs;
              updatePayload.lock_interval = newInterval; // 🔥 寫入鎖定畫面秒數
          }

          // --- 4. 透過 Service 統一更新 (存檔 + 通知) ---
          this.settings.updateSettings(updatePayload);

          // --- 5. 觸發 Android 桌布重整 ---
          if ((window as any).Android && (window as any).Android.setWallpaper) {
              // 傳送第一張圖路徑是為了觸發 Service 的重繪機制
              (window as any).Android.setWallpaper(playlistPaths[0]);
              
              if (newFilesCount === 0) {
                  this.showToast('設定成功！(秒速套用)');
              } else {
                  this.showToast(`成功！已設定 ${playlistPaths.length} 張輪播桌布`);
              }
          } else {
              this.showToast('已儲存 (Bridge Inactive)');
          }

      } catch (e) {
          console.error(e);
          this.showToast('設定失敗: ' + (e as any).message);
      }
  }

  formatSortOrder(order: SortOrder | undefined): string {
      switch(order) {
          case 'random': return '隨機';
          case 'name_asc': return '名稱 (A-Z)';
          case 'name_desc': return '名稱 (Z-A)';
          case 'date_asc': return '日期 (舊到新)';
          case 'date_desc': return '日期 (新到舊)';
          case 'custom': return '自訂';
          default: return '自訂';
      }
  }

  formatBytes(bytes?: number) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // --- NATIVE BACKUP & RESTORE ---

  downloadBackup() {
      const data = this.photoService.generateBackup();
      if ((window as any).Android && (window as any).Android.backupSettings) {
          (window as any).Android.backupSettings(data);
      } else {
          const blob = new Blob([data], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `parallax-backup-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
      }
  }

  triggerRestore() {
      if ((window as any).Android && (window as any).Android.restoreSettings) {
          (window as any).Android.restoreSettings();
      } else {
          this.restoreInput()?.nativeElement.click();
      }
  }

  onRestoreFileSelected(event: Event) {
      const input = event.target as HTMLInputElement;
      if (input.files && input.files[0]) {
          const file = input.files[0];
          const reader = new FileReader();
          
          reader.onload = (e) => {
              const content = e.target?.result as string;
              if (content) {
                  const result = this.photoService.restoreBackup(content);
                  this.showToast(result.message);
              }
          };
          
          reader.readAsText(file);
      }
      input.value = ''; 
  }
}
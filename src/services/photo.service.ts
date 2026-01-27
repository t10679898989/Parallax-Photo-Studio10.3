import { Injectable, signal, inject, effect } from '@angular/core';
import { SettingsService, AppSettings } from './settings.service';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

export interface ViewSettings {
  fitMode: 'height' | 'width';
  panX: number;
  panY: number;
  scale: number;
}

export interface Photo {
  id: string;
  url: string; // 這是顯示用的 Blob URL 或 Capacitor URL
  name: string;
  
  // 🔥 [FIX] 改為可選 (Optional)，因為從存檔讀回來時，我們拿不到原始 File 物件
  file?: File; 
  size?: number; // 新增 size 欄位來記錄檔案大小 (取代 file.size)
  
  caption?: string;
  motionSettings?: {
    strength: number;
    enabled: boolean;
  };
  viewSettings?: ViewSettings;
  
  // 🔥 [NEW] 用來記錄檔案存在手機裡的實際路徑 (Persistence)
  savedPath?: string; 
}

export type SortOrder = 'random' | 'name_asc' | 'name_desc' | 'date_asc' | 'date_desc' | 'custom';

export interface Playlist {
  id: string;
  name: string;
  photoIds: string[];
  interval: number;
  sortOrder: SortOrder; 
}

// Backup Data Structure
export interface BackupData {
  version: number;
  timestamp: number;
  globalSettings: AppSettings;
  playlists: Playlist[];
  photos: Photo[]; // 這裡我們直接儲存 Photo 結構 (不含 file 物件)
}

@Injectable({
  providedIn: 'root'
})
export class PhotoService {
  photos = signal<Photo[]>([]);
  trash = signal<Photo[]>([]);
  playlists = signal<Playlist[]>([]);
  
  settingsService = inject(SettingsService);

  activePhotoId = signal<string | null>(null);
  activePlaylistId = signal<string | null>(null);

  private STORAGE_KEY = 'my_parallax_photos';
  private PLAYLIST_KEY = 'my_parallax_playlists';

  constructor() {
    // 🔥 1. App 啟動時，嘗試讀取上次存的資料
    this.loadFromStorage();

    // 🔥 2. 設置自動存檔機制 (只要 photos 或 playlists 變動就存檔)
    effect(() => {
        const currentPhotos = this.photos();
        this.savePhotosToStorage(currentPhotos);
    });

    effect(() => {
        const currentPlaylists = this.playlists();
        localStorage.setItem(this.PLAYLIST_KEY, JSON.stringify(currentPlaylists));
    });
  }

  // --- Persistence Logic (存檔與讀檔) ---

  private savePhotosToStorage(photos: Photo[]) {
      // 存檔前，我們要過濾掉 File 物件 (因為它不能被 JSON 序列化)
      // 我們只存 metadata 和 savedPath
      const dataToSave = photos.map(p => ({
          ...p,
          file: undefined, // 移除 file
          url: '' // 暫時清空 url，因為 Blob URL 重開機後會失效，我們要靠 savedPath 重建
      }));
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(dataToSave));
  }

  private async loadFromStorage() {
      try {
          // 1. 載入播放清單
          const playlistJson = localStorage.getItem(this.PLAYLIST_KEY);
          if (playlistJson) {
              this.playlists.set(JSON.parse(playlistJson));
          }

          // 2. 載入照片
          const photosJson = localStorage.getItem(this.STORAGE_KEY);
          if (photosJson) {
              const savedPhotos: Photo[] = JSON.parse(photosJson);
              const restoredPhotos: Photo[] = [];

              for (const p of savedPhotos) {
                  // 重建可用的圖片網址
                  let displayUrl = '';
                  
                  if (p.savedPath) {
                      // 如果有存過路徑，轉換成 Capacitor 的 WebView 路徑
                      const uri = await Filesystem.getUri({
                          path: p.savedPath,
                          directory: Directory.Data
                      });
                      displayUrl = Capacitor.convertFileSrc(uri.uri);
                  } else {
                      // 如果是舊資料沒有 savedPath，先跳過或給一個預設圖
                      continue; 
                  }

                  restoredPhotos.push({
                      ...p,
                      url: displayUrl // 填回可顯示的 URL
                  });
              }
              
              if (restoredPhotos.length > 0) {
                  this.photos.set(restoredPhotos);
              }
          }
      } catch (e) {
          console.error('Failed to load photos from storage', e);
      }
  }

  // --- ID Generator ---
  private generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        try { return crypto.randomUUID(); } catch (e) {}
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
  }

  // --- Add Photos (Modified for Persistence) ---
  async addPhotos(files: FileList | null): Promise<number> {
    if (!files) return 0;

    const currentPhotos = this.photos();
    const existingSignatures = new Set(currentPhotos.map(p => p.name + '-' + (p.size || 0)));
    const newPhotos: Photo[] = [];

    // 我們需要把檔案寫入手機儲存空間，這樣重開機才找得到
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;

        const signature = file.name + '-' + file.size;
        if (existingSignatures.has(signature)) continue;

        const id = this.generateId();
        const fileName = `photo_${id}_${Date.now()}.jpg`; // 產生一個唯一檔名

        try {
            // 1. 讀取檔案轉 Base64
            const base64 = await this.fileToBase64(file);
            
            // 2. 寫入到手機硬碟 (Data Directory)
            const savedFile = await Filesystem.writeFile({
                path: fileName,
                data: base64,
                directory: Directory.Data,
                recursive: true
            });

            // 3. 取得可顯示的 Web URL
            const uri = await Filesystem.getUri({
                path: fileName,
                directory: Directory.Data
            });
            const webUrl = Capacitor.convertFileSrc(uri.uri);

            newPhotos.push({
                id: id,
                url: webUrl,
                name: file.name,
                size: file.size, // 另外紀錄 size
                savedPath: fileName, // 🔥 關鍵：記住這個檔名
                // file: file // 不存 file 物件了，為了省記憶體和方便存檔
            });

            existingSignatures.add(signature);

        } catch (e) {
            console.error('Failed to save imported photo:', file.name, e);
        }
    }

    if (newPhotos.length > 0) {
        this.photos.update(current => [...current, ...newPhotos]);
    }
    
    return newPhotos.length;
  }

  private fileToBase64(file: File): Promise<string> {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => {
              const result = reader.result as string;
              // 移除 "data:image/jpeg;base64," 前綴，Filesystem API 只需要純 Base64
              const base64 = result.split(',')[1]; 
              resolve(base64);
          };
          reader.onerror = error => reject(error);
      });
  }

  // --- Delete Logic (Update to delete file) ---
  moveToTrash(ids: string[]) {
    const photosToTrash = this.photos().filter(p => ids.includes(p.id));
    this.trash.update(current => [...current, ...photosToTrash]);
    this.photos.update(current => current.filter(p => !ids.includes(p.id)));
    
    const active = this.activePhotoId();
    if (active && ids.includes(active)) this.activePhotoId.set(null);

    this.playlists.update(playlists => 
      playlists.map(pl => ({
        ...pl,
        photoIds: pl.photoIds.filter(pid => !ids.includes(pid))
      }))
    );
  }

  async emptyTrash() {
    const items = this.trash();
    // 永久刪除時，順便把硬碟裡的檔案刪掉
    for (const p of items) {
        if (p.savedPath) {
            try {
                await Filesystem.deleteFile({
                    path: p.savedPath,
                    directory: Directory.Data
                });
            } catch (e) {}
        }
    }
    this.trash.set([]);
  }

  restoreAllFromTrash() {
    const items = this.trash();
    this.photos.update(current => [...current, ...items]);
    this.trash.set([]);
  }

  // --- Other Methods (Keep as is) ---
  selectPhoto(id: string) { this.activePhotoId.set(id); }
  clearSelection() { this.activePhotoId.set(null); }

  updateCaption(id: string, caption: string) {
    this.photos.update(photos => photos.map(p => p.id === id ? { ...p, caption } : p));
  }

  updatePhotoMotion(id: string, motionSettings: { strength: number; enabled: boolean } | undefined, viewSettings?: ViewSettings) {
    this.photos.update(photos => photos.map(p => p.id === id ? { ...p, motionSettings, viewSettings } : p));
  }

  clearAllMotionOverrides() {
    this.photos.update(photos => photos.map(p => ({ ...p, motionSettings: undefined })));
  }

  getActivePhoto(): Photo | undefined {
    const id = this.activePhotoId();
    return this.photos().find(p => p.id === id);
  }
  
  createPlaylist(name: string): string {
    const newId = this.generateId();
    const newPlaylist: Playlist = {
      id: newId,
      name,
      photoIds: [],
      interval: 60,
      sortOrder: 'custom'
    };
    this.playlists.update(p => [...p, newPlaylist]);
    return newId;
  }

  addToPlaylist(playlistId: string, photoIds: string[]) {
    this.playlists.update(playlists => 
      playlists.map(p => p.id === playlistId ? { ...p, photoIds: Array.from(new Set([...p.photoIds, ...photoIds])) } : p)
    );
  }

  removeFromPlaylist(playlistId: string, photoIds: string[]) {
    this.playlists.update(playlists =>
        playlists.map(p => p.id === playlistId ? { ...p, photoIds: p.photoIds.filter(pid => !photoIds.includes(pid)) } : p)
    );
  }

  deletePlaylist(playlistId: string) {
      this.playlists.update(current => current.filter(p => p.id !== playlistId));
  }

  updatePlaylist(playlistId: string, changes: Partial<Playlist>) {
      this.playlists.update(playlists =>
        playlists.map(p => p.id === playlistId ? { ...p, ...changes } : p)
      );
  }

  // --- BACKUP & RESTORE ---
  generateBackup(): string {
    const backup: BackupData = {
      version: 2, // Bump version
      timestamp: Date.now(),
      globalSettings: this.settingsService.settings(),
      playlists: this.playlists(),
      photos: this.photos() // Photos now contain savedPath
    };
    return JSON.stringify(backup, null, 2);
  }

  restoreBackup(jsonString: string): { success: boolean; message: string; restoredCount: number } {
    try {
      const backup: BackupData = JSON.parse(jsonString);
      
      if (!backup.photos) {
        return { success: false, message: 'Invalid backup format.', restoredCount: 0 };
      }

      if (backup.globalSettings) {
        this.settingsService.updateSettings(backup.globalSettings);
      }

      // 注意：還原備份有點複雜，因為舊的檔案路徑在備份檔裡可能在新手機上無效
      // 這裡暫時假設是「原地還原」或是「設定檔還原」，若涉及換手機，需要更複雜的匯入邏輯
      // 簡單起見，我們信任備份檔裡的設定，但會過濾掉不存在的檔案
      
      const restoredPhotos = backup.photos.map(p => ({
          ...p,
          url: '' // Reset URL, let loadFromStorage handle it or need re-import logic
      }));

      // 這裡簡單覆蓋，實務上可能需要更聰明的合併
      // 因為這部分邏輯較多，為了先解決「消失問題」，我們這裡從簡
      // 建議使用者先匯入照片，再還原設定
      
      // 這裡我們只還原「清單設定」和「圖片設定」，但不強制覆蓋照片清單，避免清空
      // 而是嘗試根據 ID 匹配
      
      let matchCount = 0;
      const currentPhotos = this.photos();
      const updatedPhotos = currentPhotos.map(curr => {
          const match = backup.photos.find(b => b.id === curr.id || (b.name === curr.name && b.size === curr.size));
          if (match) {
              matchCount++;
              return {
                  ...curr,
                  caption: match.caption,
                  motionSettings: match.motionSettings,
                  viewSettings: match.viewSettings
              };
          }
          return curr;
      });
      
      this.photos.set(updatedPhotos);

      if (backup.playlists) {
          this.playlists.set(backup.playlists);
      }

      return { 
          success: true, 
          message: `設定已還原。匹配了 ${matchCount} 張現有照片。`,
          restoredCount: matchCount
      };

    } catch (e) {
      console.error(e);
      return { success: false, message: 'Failed to parse backup.', restoredCount: 0 };
    }
  }
}
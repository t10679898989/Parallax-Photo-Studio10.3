import { Injectable, signal, inject, effect } from '@angular/core';
import { SettingsService, AppSettings } from './settings.service';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

export interface ViewSettings {
  fitMode: 'height' | 'width';
  panX: number;
  panY: number;
  scale: number;
  // 🔥 [NEW] 新增比例欄位合約，專供 Android 端對齊使用
  ratioX?: number; 
  ratioY?: number; 
}

export interface Photo {
  id: string;
  url: string;
  name: string;
  file?: File;
  size?: number;
  caption?: string;
  motionSettings?: {
    strength: number;
    enabled: boolean;
  };
  viewSettings?: ViewSettings;
  savedPath?: string;
  
  batchId?: number; 
  timestamp?: number;
}

export type SortOrder = 'random' | 'name_asc' | 'name_desc' | 'date_asc' | 'date_desc' | 'custom';

export interface Playlist {
  id: string;
  name: string;
  photoIds: string[];
  interval: number;
  sortOrder: SortOrder; 
}

export interface BackupData {
  version: number;
  timestamp: number;
  globalSettings: AppSettings;
  playlists: Playlist[];
  photos: Photo[];
}

export interface ImportProgress {
    current: number;
    total: number;
    isImporting: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PhotoService {
  photos = signal<Photo[]>([]);
  trash = signal<Photo[]>([]);
  playlists = signal<Playlist[]>([]);
  
  importProgress = signal<ImportProgress>({ current: 0, total: 0, isImporting: false });

  settingsService = inject(SettingsService);

  activePhotoId = signal<string | null>(null);
  activePlaylistId = signal<string | null>(null);

  private STORAGE_KEY = 'my_parallax_photos';
  private PLAYLIST_KEY = 'my_parallax_playlists';

  constructor() {
    this.loadFromStorage();

    effect(() => {
        const currentPhotos = this.photos();
        this.savePhotosToStorage(currentPhotos);
    });

    effect(() => {
        const currentPlaylists = this.playlists();
        localStorage.setItem(this.PLAYLIST_KEY, JSON.stringify(currentPlaylists));
    });
  }

  private savePhotosToStorage(photos: Photo[]) {
      const dataToSave = photos.map(p => ({
          ...p,
          file: undefined,
          url: '' 
      }));
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(dataToSave));
  }

  private async loadFromStorage() {
      try {
          const playlistJson = localStorage.getItem(this.PLAYLIST_KEY);
          if (playlistJson) {
              this.playlists.set(JSON.parse(playlistJson));
          }

          const photosJson = localStorage.getItem(this.STORAGE_KEY);
          if (photosJson) {
              const savedPhotos: Photo[] = JSON.parse(photosJson);
              const restoredPhotos: Photo[] = [];

              for (const p of savedPhotos) {
                  let displayUrl = '';
                  if (p.savedPath) {
                      try {
                          const uri = await Filesystem.getUri({
                              path: p.savedPath,
                              directory: Directory.Data
                          });
                          displayUrl = Capacitor.convertFileSrc(uri.uri);
                      } catch (e) { continue; }
                  } else {
                      continue; 
                  }

                  restoredPhotos.push({
                      ...p,
                      url: displayUrl
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

  private generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        try { return crypto.randomUUID(); } catch (e) {}
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
  }

  async addPhotos(files: FileList | null): Promise<number> {
    if (!files || files.length === 0) return 0;

    this.importProgress.set({ current: 0, total: files.length, isImporting: true });
    const currentBatchId = Date.now();
    const newPhotos: Photo[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        this.importProgress.update(p => ({ ...p, current: i + 1 }));

        if (!file.type.startsWith('image/')) continue;

        const id = this.generateId();
        const fileName = `photo_${id}_${currentBatchId}.jpg`;

        try {
            const base64 = await this.fileToBase64(file);
            
            await Filesystem.writeFile({
                path: fileName,
                data: base64,
                directory: Directory.Data,
                recursive: true
            });

            const uri = await Filesystem.getUri({
                path: fileName,
                directory: Directory.Data
            });
            const webUrl = Capacitor.convertFileSrc(uri.uri);

            newPhotos.push({
                id: id,
                url: webUrl,
                name: file.name,
                size: file.size, 
                savedPath: fileName,
                batchId: currentBatchId, 
                timestamp: Date.now()    
            });

        } catch (e) {
            console.error('Failed to save imported photo:', file.name, e);
        }
    }

    if (newPhotos.length > 0) {
        this.photos.update(current => [...newPhotos, ...current]);
    }
    
    setTimeout(() => {
        this.importProgress.set({ current: 0, total: 0, isImporting: false });
    }, 500);

    return newPhotos.length;
  }

  private fileToBase64(file: File): Promise<string> {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => {
              const result = reader.result as string;
              const base64 = result.split(',')[1]; 
              resolve(base64);
          };
          reader.onerror = error => reject(error);
      });
  }

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

  generateBackup(): string {
    const backup: BackupData = {
      version: 3, 
      timestamp: Date.now(),
      globalSettings: this.settingsService.settings(),
      playlists: this.playlists(),
      photos: this.photos()
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

      const restoredPhotos = backup.photos.map(p => ({
          ...p,
          url: '' 
      }));

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
                  viewSettings: match.viewSettings,
                  batchId: match.batchId, 
                  timestamp: match.timestamp
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
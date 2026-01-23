import { Injectable, signal, inject } from '@angular/core';
import { SettingsService, AppSettings } from './settings.service';

export interface ViewSettings {
  fitMode: 'height' | 'width';
  panX: number;
  panY: number;
  scale: number; // New: Zoom level (1.0 to 3.0+)
}

export interface Photo {
  id: string;
  url: string;
  name: string;
  file: File; // We keep the original file for details (size, type)
  caption?: string;
  // Individual motion overrides.
  motionSettings?: {
    strength: number;
    enabled: boolean;
  };
  // Individual view overrides (Positioning)
  viewSettings?: ViewSettings;
}

// Updated Sort Definition
export type SortOrder = 'random' | 'name_asc' | 'name_desc' | 'date_asc' | 'date_desc' | 'custom';

export interface Playlist {
  id: string;
  name: string;
  photoIds: string[];
  interval: number; // Wallpaper cycle interval in seconds
  sortOrder: SortOrder; 
}

// Backup Data Structure
export interface BackupData {
  version: number;
  timestamp: number;
  globalSettings: AppSettings;
  playlists: Playlist[];
  photos: {
    id: string;
    name: string;
    size: number; // Used for fuzzy matching if ID changes
    caption?: string;
    motionSettings?: { strength: number; enabled: boolean };
    viewSettings?: ViewSettings;
  }[];
}

@Injectable({
  providedIn: 'root'
})
export class PhotoService {
  photos = signal<Photo[]>([]);
  trash = signal<Photo[]>([]);
  playlists = signal<Playlist[]>([]);
  
  settingsService = inject(SettingsService);

  // Navigation State
  activePhotoId = signal<string | null>(null);
  activePlaylistId = signal<string | null>(null); // Persist playlist navigation

  constructor() {
    // No default playlists, start clean.
  }

  // Robust ID generator to avoid crypto.randomUUID errors in non-secure contexts
  private generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        try {
            return crypto.randomUUID();
        } catch (e) {
            console.warn('crypto.randomUUID failed, using fallback', e);
        }
    }
    // Fallback UUID generator
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
  }

  addPhotos(files: FileList | null): number {
    if (!files) return 0;

    const currentPhotos = this.photos();
    // Create a set of existing signatures (Name + Size) to prevent exact duplicates
    const existingSignatures = new Set(currentPhotos.map(p => p.name + '-' + p.file.size));

    const newPhotos: Photo[] = [];
    Array.from(files).forEach(file => {
      // Only accept images
      if (file.type.startsWith('image/')) {
        const signature = file.name + '-' + file.size;
        
        if (!existingSignatures.has(signature)) {
            const url = URL.createObjectURL(file);
            newPhotos.push({
              id: this.generateId(),
              url,
              name: file.name,
              file
            });
            // Add to local set to prevent duplicates within the same import batch
            existingSignatures.add(signature);
        }
      }
    });

    if (newPhotos.length > 0) {
        this.photos.update(current => [...current, ...newPhotos]);
    }
    
    return newPhotos.length;
  }

  moveToTrash(ids: string[]) {
    // Identify photos to move
    const photosToTrash = this.photos().filter(p => ids.includes(p.id));
    
    // Add to trash
    this.trash.update(current => [...current, ...photosToTrash]);

    // Remove from main list
    this.photos.update(current => current.filter(p => !ids.includes(p.id)));
    
    // Remove from active selection if applicable
    const active = this.activePhotoId();
    if (active && ids.includes(active)) {
      this.activePhotoId.set(null);
    }

    // Remove from all playlists (Trash implies removing references everywhere)
    this.playlists.update(playlists => 
      playlists.map(pl => ({
        ...pl,
        photoIds: pl.photoIds.filter(pid => !ids.includes(pid))
      }))
    );
  }

  emptyTrash() {
    // Revoke object URLs to free memory
    this.trash().forEach(p => URL.revokeObjectURL(p.url));
    this.trash.set([]);
  }

  restoreAllFromTrash() {
    const items = this.trash();
    this.photos.update(current => [...current, ...items]);
    this.trash.set([]);
  }

  selectPhoto(id: string) {
    this.activePhotoId.set(id);
  }

  clearSelection() {
    this.activePhotoId.set(null);
  }

  updateCaption(id: string, caption: string) {
    this.photos.update(photos => 
      photos.map(p => p.id === id ? { ...p, caption } : p)
    );
  }

  // Update specific motion settings for a photo
  updatePhotoMotion(id: string, motionSettings: { strength: number; enabled: boolean } | undefined, viewSettings?: ViewSettings) {
    this.photos.update(photos =>
      photos.map(p => p.id === id ? { ...p, motionSettings, viewSettings } : p)
    );
  }

  // Clear all individual overrides, effectively "Applying Global to All"
  clearAllMotionOverrides() {
    this.photos.update(photos =>
        photos.map(p => ({ ...p, motionSettings: undefined }))
    );
  }

  getActivePhoto(): Photo | undefined {
    const id = this.activePhotoId();
    return this.photos().find(p => p.id === id);
  }
  
  // --- Playlist Management ---

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
      playlists.map(p => 
        p.id === playlistId 
          ? { ...p, photoIds: Array.from(new Set([...p.photoIds, ...photoIds])) } 
          : p
      )
    );
  }

  removeFromPlaylist(playlistId: string, photoIds: string[]) {
    this.playlists.update(playlists =>
        playlists.map(p =>
            p.id === playlistId
            ? { ...p, photoIds: p.photoIds.filter(pid => !photoIds.includes(pid)) }
            : p
        )
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

  // --- BACKUP & RESTORE SYSTEM ---

  generateBackup(): string {
    const backup: BackupData = {
      version: 1,
      timestamp: Date.now(),
      globalSettings: this.settingsService.settings(),
      playlists: this.playlists(),
      // We only map necessary config, NOT the file blob
      photos: this.photos().map(p => ({
        id: p.id,
        name: p.name,
        size: p.file.size,
        caption: p.caption,
        motionSettings: p.motionSettings,
        viewSettings: p.viewSettings
      }))
    };
    return JSON.stringify(backup, null, 2);
  }

  restoreBackup(jsonString: string): { success: boolean; message: string; restoredCount: number } {
    try {
      const backup: BackupData = JSON.parse(jsonString);
      
      if (!backup.version || !backup.photos) {
        return { success: false, message: 'Invalid backup file format.', restoredCount: 0 };
      }

      // 1. Restore Global Settings
      if (backup.globalSettings) {
        this.settingsService.updateSettings(backup.globalSettings);
      }

      // 2. Smart Match Photos (The Core Logic)
      // We need to map [Backup ID] -> [Current Live ID] to fix playlists later
      const idMapping = new Map<string, string>(); 
      let matchCount = 0;

      const updatedPhotos = this.photos().map(currentPhoto => {
         // Strategy A: Exact ID Match
         let match = backup.photos.find(bp => bp.id === currentPhoto.id);
         
         // Strategy B: Name + Size Match (Re-import scenario)
         if (!match) {
           match = backup.photos.find(bp => bp.name === currentPhoto.name && bp.size === currentPhoto.file.size);
         }

         if (match) {
            matchCount++;
            // Record mapping: BackupID -> CurrentID
            idMapping.set(match.id, currentPhoto.id);

            // Apply settings
            return {
               ...currentPhoto,
               caption: match.caption || currentPhoto.caption,
               motionSettings: match.motionSettings,
               viewSettings: match.viewSettings
            };
         }

         return currentPhoto;
      });

      // Update state
      this.photos.set(updatedPhotos);

      // 3. Restore Playlists
      // We need to recreate playlists, but translate the IDs using our mapping
      // If a photo in the backup isn't found in current app, it is removed from playlist.
      if (backup.playlists) {
          const restoredPlaylists = backup.playlists.map(bp => {
              // Map old IDs to new IDs
              const validPhotoIds = bp.photoIds
                  .map(oldId => idMapping.get(oldId) || oldId) // Use new ID if mapped, else keep old (might match exactly)
                  .filter(id => updatedPhotos.some(p => p.id === id)); // Only keep if exists in app

              return {
                  ...bp,
                  photoIds: validPhotoIds
              };
          });
          
          // Replace all playlists
          this.playlists.set(restoredPlaylists);
      }

      return { 
          success: true, 
          message: `Restore complete. Configured ${matchCount} photos and ${backup.playlists?.length || 0} playlists.`,
          restoredCount: matchCount
      };

    } catch (e) {
      console.error(e);
      return { success: false, message: 'Failed to parse backup file.', restoredCount: 0 };
    }
  }
}
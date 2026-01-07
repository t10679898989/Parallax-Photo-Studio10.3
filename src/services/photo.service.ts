
import { Injectable, signal } from '@angular/core';

export interface ViewSettings {
  fitMode: 'height' | 'width';
  panX: number;
  panY: number;
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

@Injectable({
  providedIn: 'root'
})
export class PhotoService {
  photos = signal<Photo[]>([]);
  trash = signal<Photo[]>([]);
  playlists = signal<Playlist[]>([]);
  
  // Navigation State
  activePhotoId = signal<string | null>(null);
  activePlaylistId = signal<string | null>(null); // Persist playlist navigation

  constructor() {
    // Initialize with a default playlist for demo purposes
    this.playlists.set([
      { id: 'favs', name: 'Favorites', photoIds: [], interval: 60, sortOrder: 'custom' },
      { id: 'wallpapers', name: 'Wallpapers', photoIds: [], interval: 300, sortOrder: 'random' }
    ]);
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
}

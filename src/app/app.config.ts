
import { ApplicationConfig, provideZoneChangeDetection, provideExperimentalZonelessChangeDetection } from '@angular/core';

export const appConfig: ApplicationConfig = {
  providers: [
    // Using Zoneless for performance in the Loop (Render Cycle)
    provideExperimentalZonelessChangeDetection()
  ]
};

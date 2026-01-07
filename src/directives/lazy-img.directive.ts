
import { Directive, ElementRef, input, OnDestroy, OnInit, effect } from '@angular/core';

@Directive({
  selector: 'img[appLazyLoad]',
  standalone: true
})
export class LazyImgDirective implements OnInit, OnDestroy {
  appLazyLoad = input.required<string>(); // The source URL
  
  private observer: IntersectionObserver | null = null;
  private isLoaded = false;

  constructor(private el: ElementRef<HTMLImageElement>) {
    // Reset if URL changes (though unlikely with trackBy id)
    effect(() => {
        const url = this.appLazyLoad();
        if (this.isLoaded) {
            // If we were already loaded but url changed, strictly speaking we should reload
            // But usually this directive is destroyed/recreated. 
            // We'll just update src if we are already visible.
            if (this.el.nativeElement.src !== url) {
               this.el.nativeElement.style.opacity = '0';
               this.el.nativeElement.src = url;
            }
        }
    });
  }

  ngOnInit() {
    this.el.nativeElement.style.opacity = '0';
    this.el.nativeElement.style.transition = 'opacity 0.4s ease-out';

    // Disconnect previous observer if any
    this.observer?.disconnect();

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.loadImage();
          this.observer?.disconnect();
          this.observer = null;
        }
      });
    }, { 
      rootMargin: '50px',
      threshold: 0.01 
    });
    
    this.observer.observe(this.el.nativeElement);
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }

  private loadImage() {
    this.isLoaded = true;
    const img = this.el.nativeElement;
    img.src = this.appLazyLoad();
    
    const onLoaded = () => {
        img.style.opacity = '1';
    };

    if (img.complete && img.naturalHeight > 0) {
        onLoaded();
    } else {
        img.onload = onLoaded;
        img.onerror = () => {
            // Optional: Handle error state
            img.style.opacity = '0.5'; 
        };
    }
  }
}

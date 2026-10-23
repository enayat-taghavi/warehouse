import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter, fromEvent } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Injectable({
  providedIn: 'root'
})
export class NavigationHistoryService {
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  private history: string[] = [];
  private currentIndex = signal<number>(-1);
  private isNavigatingViaHistory = false;

  readonly canGoBack = computed(() => this.currentIndex() > 0);
  readonly canGoForward = computed(() => this.currentIndex() >= 0 && this.currentIndex() < this.history.length - 1);

  constructor() {
    // Track Angular router navigation
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((event) => {
      this.handleNavigationEnd(event.urlAfterRedirects || event.url);
    });

    // Support keyboard shortcuts (Alt + Right Arrow for Back, Alt + Left Arrow for Forward in RTL)
    if (typeof window !== 'undefined') {
      fromEvent<KeyboardEvent>(window, 'keydown').pipe(
        takeUntilDestroyed(this.destroyRef)
      ).subscribe((e) => {
        this.handleKeyDown(e);
      });
    }
  }

  private handleNavigationEnd(url: string): void {
    // If navigation was triggered programmatically by back() / forward()
    if (this.isNavigatingViaHistory) {
      this.isNavigatingViaHistory = false;
      return;
    }

    const currentIdx = this.currentIndex();

    // Ignore duplicate navigation to exact same URL
    if (currentIdx >= 0 && this.history[currentIdx] === url) {
      return;
    }

    // Support browser / mouse Back button without destroying forward stack
    if (currentIdx > 0 && this.history[currentIdx - 1] === url) {
      this.currentIndex.set(currentIdx - 1);
      return;
    }

    // Support browser / mouse Forward button
    if (currentIdx >= 0 && currentIdx < this.history.length - 1 && this.history[currentIdx + 1] === url) {
      this.currentIndex.set(currentIdx + 1);
      return;
    }

    // User navigated to a new route: prune forward stack and append
    if (currentIdx >= 0) {
      this.history = this.history.slice(0, currentIdx + 1);
    }
    this.history.push(url);
    this.currentIndex.set(this.history.length - 1);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
      if (e.key === 'ArrowRight') {
        if (this.canGoBack()) {
          e.preventDefault();
          this.back();
        }
      } else if (e.key === 'ArrowLeft') {
        if (this.canGoForward()) {
          e.preventDefault();
          this.forward();
        }
      }
    }
  }

  back(): void {
    if (!this.canGoBack()) return;
    const targetIdx = this.currentIndex() - 1;
    const targetUrl = this.history[targetIdx];
    this.isNavigatingViaHistory = true;
    this.currentIndex.set(targetIdx);
    this.router.navigateByUrl(targetUrl).catch(() => {
      this.isNavigatingViaHistory = false;
    });
  }

  forward(): void {
    if (!this.canGoForward()) return;
    const targetIdx = this.currentIndex() + 1;
    const targetUrl = this.history[targetIdx];
    this.isNavigatingViaHistory = true;
    this.currentIndex.set(targetIdx);
    this.router.navigateByUrl(targetUrl).catch(() => {
      this.isNavigatingViaHistory = false;
    });
  }

  getHistoryStack(): readonly string[] {
    return this.history;
  }

  getCurrentIndex(): number {
    return this.currentIndex();
  }
}

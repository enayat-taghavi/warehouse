import { Directive, ElementRef, Inject, PLATFORM_ID, AfterViewInit } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Directive({
  selector: '[appDraggable]',
  standalone: true
})
export class DraggableDirective implements AfterViewInit {
  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private currentX = 0;
  private currentY = 0;
  private initialX = 0;
  private initialY = 0;
  private handleElement: HTMLElement | null = null;

  constructor(
    private el: ElementRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.handleElement = this.el.nativeElement.querySelector('.modal-header-handle') || this.el.nativeElement.firstElementChild;
      
      if (this.handleElement) {
        this.handleElement.style.cursor = 'move';
        this.handleElement.addEventListener('mousedown', this.onMouseDown.bind(this));
      } else {
        this.el.nativeElement.style.cursor = 'move';
        this.el.nativeElement.addEventListener('mousedown', this.onMouseDown.bind(this));
      }
    }
  }

  onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return; // Only left click
    
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) return;

    this.isDragging = true;
    this.startX = e.clientX - this.initialX;
    this.startY = e.clientY - this.initialY;

    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
    e.preventDefault();
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) return;

    this.currentX = e.clientX - this.startX;
    this.currentY = e.clientY - this.startY;
    this.initialX = this.currentX;
    this.initialY = this.currentY;

    this.el.nativeElement.style.transform = `translate(${this.currentX}px, ${this.currentY}px)`;
  };

  private onMouseUp = () => {
    this.isDragging = false;
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  };
}

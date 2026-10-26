import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SvgIconDirective } from '../../icons/svg-icon.directive';
import { ActionButtonComponent } from '../action-button/action-button.component';
import { ToastService } from '../toast/toast.component';

@Component({
  selector: 'app-avatar-cropper-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, SvgIconDirective, ActionButtonComponent],
  templateUrl: './avatar-cropper-modal.html',
  styleUrl: './avatar-cropper-modal.css'
})
export class AvatarCropperModal implements OnInit, OnDestroy, AfterViewInit {
  private readonly toast = inject(ToastService);
  @Input() title = 'مدیریت و ویرایش تصویر پرسنلی';
  @Input() currentAvatarUrl: string | null = null;
  @Input() initialAspectRatio: '1:1' | '3:4' = '1:1';
  @Input() isSaving = false;

  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<Blob>();
  @Output() removed = new EventEmitter<void>();

  @ViewChild('cropCanvas') cropCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('cameraVideo') cameraVideoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;

  activeMode: 'crop' | 'camera' = 'crop';
  aspectRatio: '1:1' | '3:4' = '1:1';
  
  // Image & Canvas state
  imageLoaded = false;
  private sourceImage: HTMLImageElement | null = null;
  
  zoom = 1.0;
  rotation = 0; // in degrees: 0, 90, 180, 270
  panX = 0;
  panY = 0;
  
  // Mouse Pointer state
  private isDragging = false;
  private activePointerId: number | null = null;
  private dragStartX = 0;
  private dragStartY = 0;

  // Touch Pinch-to-Zoom state
  private isPinching = false;
  private initialPinchDist = 0;
  private initialPinchZoom = 1.0;
  private touchStartX = 0;
  private touchStartY = 0;

  // Camera state
  videoStream: MediaStream | null = null;
  cameraError: string | null = null;
  cameraAvailable = false;
  isCameraReady = false;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.aspectRatio = this.initialAspectRatio || '1:1';
    // Check if camera API is supported
    if (typeof navigator !== 'undefined' && !!navigator.mediaDevices && 'getUserMedia' in navigator.mediaDevices) {
      this.cameraAvailable = true;
    }
  }

  ngAfterViewInit() {
    if (this.currentAvatarUrl) {
      this.loadImageFromUrl(this.currentAvatarUrl);
    }
  }

  ngOnDestroy() {
    this.stopCamera();
  }

  // ── File Selection ───────────────────────────────────────────────
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.loadFile(input.files[0]);
    }
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
      this.loadFile(event.dataTransfer.files[0]);
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  private loadFile(file: File) {
    if (!file.type.startsWith('image/')) {
      this.toast.error('لطفاً یک فایل تصویری معتبر (JPG, PNG, WebP) انتخاب کنید.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      this.loadImageFromUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  private loadImageFromUrl(url: string) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.sourceImage = img;
      this.imageLoaded = true;
      this.resetTransform();
      this.activeMode = 'crop';
      this.cdr.detectChanges();
      requestAnimationFrame(() => {
        this.drawCanvas();
        setTimeout(() => this.drawCanvas(), 60);
      });
    };
    img.onerror = () => {
      this.imageLoaded = false;
      this.cdr.detectChanges();
    };
    img.src = url;
  }

  // ── Camera Handling ──────────────────────────────────────────────
  async startCamera() {
    this.stopCamera();
    this.cameraError = null;
    this.isCameraReady = false;
    this.activeMode = 'camera';
    this.cdr.detectChanges();

    try {
      this.videoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false
      });

      this.cdr.detectChanges();

      setTimeout(() => {
        if (this.cameraVideoRef?.nativeElement && this.videoStream) {
          const video = this.cameraVideoRef.nativeElement;
          video.srcObject = this.videoStream;
          video.onloadedmetadata = () => {
            video.play()
              .then(() => {
                this.isCameraReady = true;
                this.cdr.detectChanges();
              })
              .catch(() => {
                this.isCameraReady = true;
                this.cdr.detectChanges();
              });
          };
        }
      }, 50);
    } catch (err: any) {
      this.cameraError = 'دسترسی به دوربین برقرار نشد. لطفاً مجوز دسترسی به دوربین را در مرورگر فعال کنید.';
      this.cdr.detectChanges();
    }
  }

  stopCamera() {
    if (this.videoStream) {
      this.videoStream.getTracks().forEach(track => track.stop());
      this.videoStream = null;
    }
    this.isCameraReady = false;
  }

  captureFromCamera() {
    if (!this.cameraVideoRef?.nativeElement) return;
    const video = this.cameraVideoRef.nativeElement;

    const vw = video.videoWidth || video.clientWidth || 640;
    const vh = video.videoHeight || video.clientHeight || 480;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = vw;
    tempCanvas.height = vh;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;

    // Flip horizontally for mirror effect (selfie camera)
    ctx.translate(vw, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, vw, vh);

    const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.95);
    this.stopCamera();
    this.loadImageFromUrl(dataUrl);
  }

  cancelCamera() {
    this.stopCamera();
    this.activeMode = 'crop';
    this.cdr.detectChanges();
    if (this.imageLoaded) {
      requestAnimationFrame(() => this.drawCanvas());
    }
  }

  // ── Canvas Transformation & Drawing ──────────────────────────────
  setAspectRatio(ratio: '1:1' | '3:4') {
    this.aspectRatio = ratio;
    this.resetTransform();
    this.cdr.detectChanges();
    requestAnimationFrame(() => this.drawCanvas());
  }

  resetTransform() {
    this.zoom = 1.0;
    this.rotation = 0;
    this.panX = 0;
    this.panY = 0;
    this.drawCanvas();
  }

  rotateRight() {
    this.rotation = (this.rotation + 90) % 360;
    this.drawCanvas();
  }

  rotateLeft() {
    this.rotation = (this.rotation - 90 + 360) % 360;
    this.drawCanvas();
  }

  onZoomChange() {
    this.drawCanvas();
  }

  // ── Mouse & Pointer Dragging ─────────────────────────────────────
  onPointerDown(e: PointerEvent) {
    if (!this.imageLoaded || e.pointerType === 'touch') return; // Handled by touch events on mobile
    e.preventDefault();
    this.isDragging = true;
    this.activePointerId = e.pointerId;
    this.dragStartX = e.clientX - this.panX;
    this.dragStartY = e.clientY - this.panY;
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  }

  onPointerMove(e: PointerEvent) {
    if (!this.isDragging || (this.activePointerId !== null && e.pointerId !== this.activePointerId)) return;
    e.preventDefault();
    this.panX = Math.round(e.clientX - this.dragStartX);
    this.panY = Math.round(e.clientY - this.dragStartY);
    this.drawCanvas();
  }

  onPointerUp(e: PointerEvent) {
    if (this.isDragging) {
      this.isDragging = false;
      this.activePointerId = null;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  }

  // ── Mobile Touch Gestures (Single finger Pan & Pinch-to-Zoom) ───
  onTouchStart(e: TouchEvent) {
    if (!this.imageLoaded) return;
    if (e.touches.length === 2) {
      // Pinch gesture start
      e.preventDefault();
      this.isPinching = true;
      this.isDragging = false;
      this.initialPinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      this.initialPinchZoom = this.zoom;
    } else if (e.touches.length === 1) {
      // Single finger drag start
      this.isPinching = false;
      this.isDragging = true;
      this.touchStartX = e.touches[0].clientX - this.panX;
      this.touchStartY = e.touches[0].clientY - this.panY;
    }
  }

  onTouchMove(e: TouchEvent) {
    if (!this.imageLoaded) return;
    if (e.touches.length === 2 && this.isPinching) {
      // Pinch zoom in progress
      e.preventDefault();
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (this.initialPinchDist > 0) {
        const factor = currentDist / this.initialPinchDist;
        this.zoom = Math.min(Math.max(0.5, this.initialPinchZoom * factor), 3.0);
        this.drawCanvas();
      }
    } else if (e.touches.length === 1 && this.isDragging && !this.isPinching) {
      // Single finger drag in progress
      e.preventDefault();
      this.panX = Math.round(e.touches[0].clientX - this.touchStartX);
      this.panY = Math.round(e.touches[0].clientY - this.touchStartY);
      this.drawCanvas();
    }
  }

  onTouchEnd(e: TouchEvent) {
    if (e.touches.length === 0) {
      this.isDragging = false;
      this.isPinching = false;
    } else if (e.touches.length === 1) {
      this.isPinching = false;
      this.touchStartX = e.touches[0].clientX - this.panX;
      this.touchStartY = e.touches[0].clientY - this.panY;
    }
  }

  onWheel(e: WheelEvent) {
    if (!this.imageLoaded) return;
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 0.08 : -0.08;
    this.zoom = Math.min(Math.max(0.5, this.zoom + zoomDelta), 3.0);
    this.drawCanvas();
  }

  drawCanvas() {
    if (!this.cropCanvasRef?.nativeElement || !this.sourceImage || !this.imageLoaded) return;
    const canvas = this.cropCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cw = canvas.width;
    const ch = canvas.height;

    ctx.clearRect(0, 0, cw, ch);

    // Save context for transform
    ctx.save();

    // Center origin with pan offset
    ctx.translate(cw / 2 + this.panX, ch / 2 + this.panY);
    ctx.rotate((this.rotation * Math.PI) / 180);
    ctx.scale(this.zoom, this.zoom);

    // Determine draw scale based on aspect ratio
    const img = this.sourceImage;
    const scale = Math.max(cw / img.width, ch / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;

    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

    ctx.restore();
  }

  // ── Final Crop Export ────────────────────────────────────────────
  saveCroppedImage() {
    if (!this.sourceImage || !this.imageLoaded || !this.cropCanvasRef?.nativeElement) return;

    const previewCanvas = this.cropCanvasRef.nativeElement;
    const cw = previewCanvas.width;

    // Export high quality canvas
    const exportW = this.aspectRatio === '1:1' ? 600 : 450;
    const exportH = 600;
    const scaleFactor = exportW / cw;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = exportW;
    outCanvas.height = exportH;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.translate(exportW / 2 + (this.panX * scaleFactor), exportH / 2 + (this.panY * scaleFactor));
    ctx.rotate((this.rotation * Math.PI) / 180);
    ctx.scale(this.zoom, this.zoom);

    const img = this.sourceImage;
    const scale = Math.max(exportW / img.width, exportH / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;

    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    outCanvas.toBlob((blob) => {
      if (blob) {
        this.saved.emit(blob);
      }
    }, 'image/jpeg', 0.95);
  }

  removeAvatar() {
    this.removed.emit();
  }

  close() {
    this.stopCamera();
    this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  handleEscape() {
    if (this.activeMode === 'camera') {
      this.cancelCamera();
    } else {
      this.close();
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (this.isSaving) return;
    
    // Save on Ctrl+Enter
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      if (this.imageLoaded && this.activeMode === 'crop') {
        event.preventDefault();
        this.saveCroppedImage();
      }
    }

    // Zoom shortcuts (+, -)
    if (this.activeMode === 'crop' && this.imageLoaded) {
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        this.zoom = Math.min(3.0, +(this.zoom + 0.1).toFixed(1));
        this.onZoomChange();
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        this.zoom = Math.max(0.5, +(this.zoom - 0.1).toFixed(1));
        this.onZoomChange();
      } else if ((event.key === 'r' || event.key === 'R') && !event.ctrlKey && !event.metaKey) {
        // Rotate shortcut R
        event.preventDefault();
        this.rotateRight();
      }
    }
  }
}

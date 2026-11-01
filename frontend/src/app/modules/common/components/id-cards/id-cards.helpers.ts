import { QRCodeWriter, BarcodeFormat, EncodeHintType } from '@zxing/library';

export interface CardCustomTexts {
  companyName: string;
  companySub: string;
  backHeaderTitle: string;
  backHeaderSub: string;
  regulationsText: string;
  signatureTitle: string;
  signatureSub: string;
}

export const DEFAULT_CARD_TEXTS: CardCustomTexts = {
  companyName: 'فارس عــالیش',
  companySub: 'FARS AALISH CO. - REG: 420',
  backHeaderTitle: 'ضوابط و امنیت تردد سازمانی',
  backHeaderSub: 'SECURITY & SAFETY GUIDELINES',
  regulationsText: 'همراه داشتن این کارت در کلیه مبادی ورودی و محوطه سازمانی الزامی است. هرگونه واگذاری به غیر ممنوع می‌باشد.',
  signatureTitle: 'مهر و امضای حراست و انتظامات',
  signatureSub: 'SECURITY CLEARANCE'
};

export interface IdCardSettings {
  dataSource: 'db' | 'external';
  presetLayout: 'classic-vertical' | 'badge-horizontal' | 'industrial-security' | 'compact-minimal';
  cardType: 'pvc-vertical' | 'badge-horizontal';
  theme: 'corporate' | 'industrial' | 'security' | 'custom';
  customColor: string;
  customDomain?: string;
  photoPosition: 'center' | 'top' | 'left' | 'right';
  barcodeType: '1d' | '2d';
  barcodePlacement: 'front' | 'back' | 'both' | 'none';
  expiryDays: number;
  globalProjectNote: string;
  customTexts: CardCustomTexts;
  fields: {
    photo: boolean;
    role: boolean;
    nationalCode: boolean;
    personnelCode: boolean;
    projects: boolean;
    barcode: boolean;
    expiry: boolean;
    bloodType: boolean;
    emergencyContact: boolean;
    globalNote: boolean;
    signature: boolean;
    hologram: boolean;
    regulations: boolean;
  };
  printSide: 'front' | 'back' | 'both';
  printLayout: 'a4-grid' | 'laminate-side-by-side';
}

export function drawPure2DBarcode(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number): void {
  const qrWriter = new QRCodeWriter();
  const hints = new Map<EncodeHintType, any>();
  hints.set(EncodeHintType.MARGIN, 0);
  const bitMatrix = qrWriter.encode(text, BarcodeFormat.QR_CODE, 21, 21, hints);
  const matrixWidth = bitMatrix.getWidth();
  const matrixHeight = bitMatrix.getHeight();
  const cellW = w / matrixWidth;
  const cellH = h / matrixHeight;
  ctx.fillStyle = '#0f172a';
  for (let r = 0; r < matrixHeight; r++) {
    for (let c = 0; c < matrixWidth; c++) {
      if (bitMatrix.get(c, r)) {
        ctx.fillRect(x + c * cellW, y + r * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }
  }
}

export function drawCanvas1DBarcode(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number): void {
  // no code -> no barcode (never draw a fake sample number)
  const clean = text.replace(/[^0-9]/g, '');
  if (!clean) return;
  const pattern = [2, 1, 1, 2, 3, 1, 2, 2, 1, 3, 1, 2, 1, 3, 2, 1, 2, 1, 1, 3, 2, 2, 1, 1, 2, 3, 1, 1];
  let totalUnits = 0;
  for (let i = 0; i < 40; i++) {
    const charCode = clean.charCodeAt(i % clean.length);
    totalUnits += (charCode % 3) + 1;
  }
  const unitW = w / totalUnits;
  let curX = x;
  ctx.fillStyle = '#0f172a';
  for (let i = 0; i < 40; i++) {
    const charCode = clean.charCodeAt(i % clean.length);
    const barW = ((charCode % 3) + 1) * unitW;
    if (i % 2 === 0) {
      ctx.fillRect(curX, y, barW, h);
    }
    curX += barW;
  }
}

export function drawCanvas2DBarcode(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number): void {
  try {
    drawPure2DBarcode(ctx, text, x, y, w, h);
  } catch {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x, y, w, h);
  }
}

export function getBarcodeSvgString(code: string): string {
  const clean = code.replace(/[^0-9]/g, '');
  if (!clean) return '';
  let totalUnits = 0;
  for (let i = 0; i < 35; i++) {
    const charCode = clean.charCodeAt(i % clean.length);
    totalUnits += (charCode % 3) + 1;
  }
  const width = 160;
  const height = 40;
  const unitW = width / totalUnits;
  let curX = 0;
  let bars = '';
  for (let i = 0; i < 35; i++) {
    const charCode = clean.charCodeAt(i % clean.length);
    const barW = ((charCode % 3) + 1) * unitW;
    if (i % 2 === 0) {
      bars += `<rect x="${curX.toFixed(1)}" y="0" width="${barW.toFixed(1)}" height="${height}" fill="#0f172a" />`;
    }
    curX += barW;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" class="w-full h-full">${bars}</svg>`;
}

export function getQrCodeSvgString(text: string): string {
  try {
    const qrWriter = new QRCodeWriter();
    const hints = new Map<EncodeHintType, any>();
    hints.set(EncodeHintType.MARGIN, 0);
    const bitMatrix = qrWriter.encode(text, BarcodeFormat.QR_CODE, 25, 25, hints);
    const matrixWidth = bitMatrix.getWidth();
    const matrixHeight = bitMatrix.getHeight();
    let rects = '';
    for (let r = 0; r < matrixHeight; r++) {
      for (let c = 0; c < matrixWidth; c++) {
        if (bitMatrix.get(c, r)) {
          rects += `<rect x="${c}" y="${r}" width="1" height="1" fill="#0f172a" />`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${matrixWidth} ${matrixHeight}" class="w-full h-full shape-rendering-crispEdges">${rects}</svg>`;
  } catch {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" class="w-full h-full"><rect width="10" height="10" fill="#0f172a"/></svg>`;
  }
}

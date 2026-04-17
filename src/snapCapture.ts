/**
 * SnapCapture - DOM Capture Utility for Fixed Elements
 */

import { snapdom } from '@zumer/snapdom';

export interface CaptureOptions {
  scale?: number;
  backgroundColor?: string;
  exclude?: string[];
  contentSelector?: string;
}

interface FixedElementInfo {
  selector: string;
  rect: { width: number; height: number; top: number; bottom: number; left: number; right: number };
  isTopAnchored: boolean;
  isFullWidth: boolean;
  distanceFromTop: number;
  distanceFromBottom: number;
  distanceFromLeft: number;
}

function getSelector(el: Element): string {
  if (el.id) return `#${el.id}`;
  if (el.className && typeof el.className === 'string') {
    const classes = el.className.trim().split(/\s+/).join('.');
    if (classes) return `.${classes}`;
  }
  return el.tagName.toLowerCase();
}

function findFixedElements(container: Element): FixedElementInfo[] {
  const fixed: FixedElementInfo[] = [];
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  container.querySelectorAll('*').forEach(el => {
    const style = getComputedStyle(el);
    if (style.position !== 'fixed') return;

    const rect = el.getBoundingClientRect();
    const distanceFromTop = rect.top;
    const distanceFromBottom = viewportHeight - rect.bottom;

    fixed.push({
      selector: getSelector(el),
      rect: { width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
      isTopAnchored: distanceFromTop <= distanceFromBottom,
      isFullWidth: rect.width > viewportWidth * 0.8,
      distanceFromTop,
      distanceFromBottom,
      distanceFromLeft: rect.left
    });
  });

  return fixed;
}

function repositionFixedElement(el: HTMLElement, fixed: FixedElementInfo, containerHeight: number): void {
  el.style.position = 'absolute';
  el.style.bottom = 'auto';

  if (fixed.isTopAnchored) {
    el.style.top = `${fixed.distanceFromTop}px`;
  } else {
    el.style.top = `${containerHeight - fixed.rect.height - fixed.distanceFromBottom}px`;
  }

  if (fixed.isFullWidth) {
    el.style.left = '0';
    el.style.right = '0';
    el.style.width = 'auto';
  } else {
    el.style.left = `${fixed.distanceFromLeft}px`;
    el.style.right = 'auto';
    el.style.width = `${fixed.rect.width}px`;
  }
}

function createFullPagePlugin(fixedElements: FixedElementInfo[], totalHeight: number) {
  return {
    name: 'fixed-elements-full-page',
    afterClone(context: { clone: HTMLElement }) {
      const clone = context.clone;
      clone.style.position = 'relative';
      clone.style.height = `${totalHeight}px`;
      clone.style.overflow = 'visible';

      fixedElements.forEach(fixed => {
        const el = clone.querySelector(fixed.selector) as HTMLElement | null;
        if (el) repositionFixedElement(el, fixed, totalHeight);
      });
    }
  };
}

function createVisiblePlugin(fixedElements: FixedElementInfo[], scrollY: number, viewportHeight: number, contentSelector?: string) {
  return {
    name: 'fixed-elements-visible',
    afterClone(context: { clone: HTMLElement }) {
      const clone = context.clone;
      clone.style.position = 'relative';
      clone.style.height = `${viewportHeight}px`;
      clone.style.overflow = 'hidden';

      const selectors = contentSelector ? [contentSelector] : ['.content', 'main', '[data-content]', '[data-main-content]'];
      for (const selector of selectors) {
        const content = clone.querySelector(selector) as HTMLElement | null;
        if (content) {
          content.style.marginTop = `${-scrollY}px`;
          break;
        }
      }

      fixedElements.forEach(fixed => {
        const el = clone.querySelector(fixed.selector) as HTMLElement | null;
        if (el) repositionFixedElement(el, fixed, viewportHeight);
      });
    }
  };
}

function cropCanvas(sourceCanvas: HTMLCanvasElement, cropHeight: number): HTMLCanvasElement {
  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = sourceCanvas.width;
  croppedCanvas.height = cropHeight;
  const ctx = croppedCanvas.getContext('2d')!;
  ctx.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, cropHeight, 0, 0, sourceCanvas.width, cropHeight);
  return croppedCanvas;
}

function canvasToImage(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = canvas.toDataURL('image/png');
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Failed to create blob')), type, quality);
  });
}

export function createSnapCapture() {
  return {
    async fullPage(element: Element, options: CaptureOptions = {}) {
      const { contentSelector, ...snapdomOptions } = options;
      const fixedElements = findFixedElements(element);
      const contentSelectors = contentSelector ? [contentSelector] : ['.content', 'main', '[data-content]', '[data-main-content]'];
      
      let content: Element | null = null;
      for (const selector of contentSelectors) {
        content = element.querySelector(selector);
        if (content) break;
      }
      
      const totalHeight = content ? content.scrollHeight : element.scrollHeight;
      const result = await snapdom(element, { ...snapdomOptions, height: totalHeight, plugins: [[createFullPagePlugin(fixedElements, totalHeight)]] });
      return result.toPng();
    },

    async visible(element: Element, options: CaptureOptions = {}) {
      const { contentSelector, ...snapdomOptions } = options;
      const fixedElements = findFixedElements(element);
      const scrollY = window.scrollY || window.pageYOffset;
      const viewportHeight = window.innerHeight;
      const elementWidth = (element as HTMLElement).offsetWidth;

      const result = await snapdom(element, { ...snapdomOptions, plugins: [[createVisiblePlugin(fixedElements, scrollY, viewportHeight, contentSelector)]] });
      const fullCanvas = await result.toCanvas();
      const scaleFactor = fullCanvas.width / elementWidth;
      const cropHeight = Math.round(viewportHeight * scaleFactor);
      const croppedCanvas = cropCanvas(fullCanvas, cropHeight);
      return canvasToImage(croppedCanvas);
    },

    async fullPageBlob(element: Element, options: CaptureOptions & { type?: string; quality?: number } = {}) {
      const { contentSelector, type = 'image/png', quality = 0.92, ...snapdomOptions } = options;
      const fixedElements = findFixedElements(element);
      const contentSelectors = contentSelector ? [contentSelector] : ['.content', 'main', '[data-content]', '[data-main-content]'];
      
      let content: Element | null = null;
      for (const selector of contentSelectors) {
        content = element.querySelector(selector);
        if (content) break;
      }
      
      const totalHeight = content ? content.scrollHeight : element.scrollHeight;
      const result = await snapdom(element, { ...snapdomOptions, height: totalHeight, plugins: [[createFullPagePlugin(fixedElements, totalHeight)]] });
      const canvas = await result.toCanvas();
      return canvasToBlob(canvas, type, quality);
    },

    async visibleBlob(element: Element, options: CaptureOptions & { type?: string; quality?: number } = {}) {
      const { contentSelector, type = 'image/png', quality = 0.92, ...snapdomOptions } = options;
      const fixedElements = findFixedElements(element);
      const scrollY = window.scrollY || window.pageYOffset;
      const viewportHeight = window.innerHeight;
      const elementWidth = (element as HTMLElement).offsetWidth;

      const result = await snapdom(element, { ...snapdomOptions, plugins: [[createVisiblePlugin(fixedElements, scrollY, viewportHeight, contentSelector)]] });
      const fullCanvas = await result.toCanvas();
      const scaleFactor = fullCanvas.width / elementWidth;
      const cropHeight = Math.round(viewportHeight * scaleFactor);
      const croppedCanvas = cropCanvas(fullCanvas, cropHeight);
      return canvasToBlob(croppedCanvas, type, quality);
    },

    download(source: HTMLImageElement | Blob | string, filename = 'capture.png') {
      const link = document.createElement('a');
      link.download = filename;

      if (source instanceof Blob) {
        link.href = URL.createObjectURL(source);
        link.click();
        URL.revokeObjectURL(link.href);
      } else if (typeof source === 'string') {
        link.href = source;
        link.click();
      } else if (source instanceof HTMLImageElement) {
        link.href = source.src;
        link.click();
      }
    }
  };
}

export default createSnapCapture;

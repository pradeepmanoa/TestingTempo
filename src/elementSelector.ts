// ============================================================================
// ElementSelector — custom element selection module for iframe apps.
// Standalone DOM-based hover/click selector that communicates with the
// parent frame via postMessage.
// ============================================================================

import { extractDOM } from './domSerializer';
import { snapdom } from '@zumer/snapdom';
import { createSnapCapture } from './snapCapture';

const OVERLAY_DATA_ATTR = 'data-element-selector-overlay';
const MAX_CONTENT_LENGTH = 5000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ElementSelectorOptions {
  targetOrigin?: string; // postMessage target origin, defaults to '*'
}

export interface SourceAttribution {
  componentName: string;
  fileName: string | null;
  lineNumber: number | null;
}

export interface ElementSelectedPayload {
  type: 'element-selected';
  content: string;
  elements: Array<{ tagName: string; className: string; id: string }>;
  boundingRect: {
    top: number;
    left: number;
    width: number;
    height: number;
  } | null;
  sourceAttribution: SourceAttribution | null;
  /** Raw data-source-id value, e.g. "src/App.tsx:10:4" */
  sourceId: string | null;
  /** Computed styles for the visual editor */
  computedStyles: Record<string, string>;
  shiftKey?: boolean;
  /** Unique ID for this selection overlay — use to target removal */
  uid: string;
  /** JSX tag name from data-source-tag, e.g. "Button", "div" */
  sourceTag: string | null;
  /** Static props from data-source-props */
  sourceProps: Record<string, any> | null;
  /** Component name from data-component wrapper */
  componentName: string | null;
}

type SelectorState = 'inactive' | 'hovering' | 'selected';

// ---------------------------------------------------------------------------
// ElementSelector class
// ---------------------------------------------------------------------------

export class ElementSelector {
  private state: SelectorState = 'inactive';
  private hoverOverlay: HTMLDivElement | null = null;
  private selectedOverlays: Array<{ overlay: HTMLDivElement; element: Element; uid: string }> = [];
  private currentTarget: Element | null = null;
  private options: Required<ElementSelectorOptions>;
  private uidCounter = 0;

  // Bound handler references for cleanup
  private boundHandleMouseMove: (e: MouseEvent) => void;
  private boundHandleClick: (e: MouseEvent) => void;
  private boundHandleMessage: (e: MessageEvent) => void;
  private boundHandleScroll: () => void;

  // Observers for tracking element changes
  private resizeObserver: ResizeObserver;
  private mutationObservers: Map<Element, MutationObserver> = new Map();
  private observerRafId: number | null = null;

  constructor(options?: ElementSelectorOptions) {
    this.options = {
      targetOrigin: options?.targetOrigin ?? '*',
    };

    // Bind handlers once so we can add/remove the same references
    this.boundHandleMouseMove = this.handleMouseMove.bind(this);
    this.boundHandleClick = this.handleClick.bind(this);
    this.boundHandleMessage = this.handleMessage.bind(this);
    this.boundHandleScroll = this.handleScroll.bind(this);

    // ResizeObserver for size changes (single instance, multiple targets)
    this.resizeObserver = new ResizeObserver(() => this.scheduleRepositionOverlays());
  }

  private scheduleRepositionOverlays(): void {
    if (this.observerRafId !== null) return;
    this.observerRafId = requestAnimationFrame(() => {
      this.observerRafId = null;
      this.repositionAllOverlays();
    });
  }

  private repositionAllOverlays(): void {
    for (const s of this.selectedOverlays) {
      this.positionOverlay(s.overlay, s.element);
    }
  }

  private observeElement(element: Element): void {
    this.resizeObserver.observe(element);
    const mo = new MutationObserver(() => this.scheduleRepositionOverlays());
    mo.observe(element, { attributes: true, attributeFilter: ['style', 'class'] });
    this.mutationObservers.set(element, mo);
  }

  private unobserveElement(element: Element): void {
    this.resizeObserver.unobserve(element);
    const mo = this.mutationObservers.get(element);
    if (mo) {
      mo.disconnect();
      this.mutationObservers.delete(element);
    }
  }

  private nextUid(): string {
    return `es-${Date.now()}-${++this.uidCounter}`;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Start listening for postMessages from the parent frame.
   * Should be called once at initialisation.
   */
  listen(): void {
    window.addEventListener('message', this.boundHandleMessage);
  }

  /**
   * Activate hover highlighting and click selection.
   * Transitions: inactive → hovering, selected → hovering.
   * When called from selected state, keeps existing selected overlays
   * so the user can pick additional elements (multi-select).
   * Idempotent when already in hovering state.
   */
  activate(): void {
    if (this.state === 'hovering') return; // idempotent

    // Keep selected overlays — don't clear them on re-activate.
    // This enables multi-element selection across activate cycles.

    this.state = 'hovering';
    document.addEventListener('mousemove', this.boundHandleMouseMove, true);
    document.addEventListener('click', this.boundHandleClick, true);
    // Listen for scroll so hover overlay tracks the element under the cursor
    window.addEventListener('scroll', this.boundHandleScroll, true);
  }

  /**
   * Deactivate hover/click mode but keep selected overlays visible.
   * This allows the selection highlight to persist while the user is
   * commenting. Only removes hover overlay and listeners.
   * Idempotent when already inactive.
   */
  deactivate(): void {
    if (this.state === 'inactive') return; // idempotent

    document.removeEventListener('mousemove', this.boundHandleMouseMove, true);
    document.removeEventListener('click', this.boundHandleClick, true);
    this.removeHoverOverlay();
    this.currentTarget = null;

    // If we have selected overlays, stay in selected state so they remain visible.
    // Keep scroll listener so selected overlays track on scroll.
    // Otherwise transition to inactive and remove scroll listener.
    if (this.selectedOverlays.length > 0) {
      this.state = 'selected';
    } else {
      this.state = 'inactive';
      window.removeEventListener('scroll', this.boundHandleScroll, true);
    }
  }

  /**
   * Clear all persistent highlights on selected elements.
   * Transitions to inactive. No-op if no highlights are displayed.
   */
  clearHighlight(): void {
    if (this.selectedOverlays.length === 0 && this.state === 'inactive') return;

    this.removeAllSelectedOverlays();
    this.currentTarget = null;
    this.state = 'inactive';
  }

  /**
   * Remove a single selected overlay by its unique ID.
   * If no overlays remain, transitions to inactive.
   */
  removeHighlight(uid: string): void {
    const idx = this.selectedOverlays.findIndex(s => s.uid === uid);
    if (idx === -1) return;

    this.unobserveElement(this.selectedOverlays[idx].element);
    this.selectedOverlays[idx].overlay.remove();
    this.selectedOverlays.splice(idx, 1);

    if (this.selectedOverlays.length === 0) {
      this.currentTarget = null;
      this.state = 'inactive';
      window.removeEventListener('scroll', this.boundHandleScroll, true);
    }
  }

  /**
   * Full cleanup — remove all listeners, overlays, and references.
   */
  destroy(): void {
    document.removeEventListener('mousemove', this.boundHandleMouseMove, true);
    document.removeEventListener('click', this.boundHandleClick, true);
    window.removeEventListener('scroll', this.boundHandleScroll, true);
    if (this.scrollRafId !== null) {
      cancelAnimationFrame(this.scrollRafId);
      this.scrollRafId = null;
    }
    if (this.observerRafId !== null) {
      cancelAnimationFrame(this.observerRafId);
      this.observerRafId = null;
    }
    this.resizeObserver.disconnect();
    for (const mo of this.mutationObservers.values()) {
      mo.disconnect();
    }
    this.mutationObservers.clear();
    this.removeHoverOverlay();
    this.removeAllSelectedOverlays();
    this.currentTarget = null;
    this.state = 'inactive';
    window.removeEventListener('message', this.boundHandleMessage);
  }

  // -------------------------------------------------------------------------
  // Message handling
  // -------------------------------------------------------------------------

  private handleMessage(e: MessageEvent): void {
    const type = e.data?.type;
    switch (type) {
      case 'enable-element-selector':
        this.activate();
        break;
      case 'disable-element-selector':
        this.deactivate();
        break;
      case 'clear-highlight':
        this.clearHighlight();
        break;
      case 'remove-highlight':
        if (e.data?.uid) {
          this.removeHighlight(e.data.uid);
        }
        break;
      case 'apply-style':
        if (e.data?.sourceId && e.data?.styles) {
          const el = document.querySelector(`[data-source-id="${e.data.sourceId}"]`) as HTMLElement | null;
          if (el) Object.assign(el.style, e.data.styles);
        }
        break;
      case 'comment-submitted':
        this.clearHighlight();
        break;
      case 'comment-discarded':
        this.clearHighlight();
        break;
      case 'scroll-test':
        // Support scroll-test from test harness (cross-origin fallback)
        window.scrollBy({ top: e.data.delta ?? 40, behavior: 'smooth' });
        break;
      case 'extract-dom':
        extractDOM(this.options.targetOrigin);
        break;
      case 'capture-png':
        this.capturePng(e.data.mode ?? 'viewport');
        break;
      case 'take-picture':
        this.takePicture(e.data.mode ?? 'visible');
        break;
      // Unknown message types are silently ignored
    }
  }

  // -------------------------------------------------------------------------
  // PNG capture
  // -------------------------------------------------------------------------
  
  private async capturePng(mode: 'viewport' | 'full' = 'viewport'): Promise<void> {
    const overlayEls = document.querySelectorAll(`[${OVERLAY_DATA_ATTR}]`);
    overlayEls.forEach(el => (el as HTMLElement).style.display = 'none');

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const sy = window.scrollY;
    const sx = window.scrollX;
    const fullW = document.body.scrollWidth;
    const fullH = document.body.scrollHeight;
    const isFullPage = mode === 'full';

    // Step 1: Collect visual state from live DOM
    const origEls = document.body.querySelectorAll('*');
    const fixups = new Map<number, {
      position?: 'fixed' | 'sticky';
      rect?: DOMRect;
      scrollLeft?: number;
      scrollTop?: number;
    }>();

    origEls.forEach((el, i) => {
      const entry: { position?: 'fixed' | 'sticky'; rect?: DOMRect; scrollLeft?: number; scrollTop?: number } = {};
      let needsEntry = false;

      const computed = window.getComputedStyle(el);
      const pos = computed.position;
      if (pos === 'fixed' || pos === 'sticky') {
        entry.position = pos as 'fixed' | 'sticky';
        entry.rect = el.getBoundingClientRect();
        needsEntry = true;
      }

      if (el.scrollLeft > 0 || el.scrollTop > 0) {
        entry.scrollLeft = el.scrollLeft;
        entry.scrollTop = el.scrollTop;
        needsEntry = true;
      }

      if (needsEntry) fixups.set(i, entry);
    });

    // Step 2: Clone and apply fixups
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(`[${OVERLAY_DATA_ATTR}]`).forEach(el => el.remove());

    const cloneEls = clone.querySelectorAll('*');
    
    fixups.forEach((info, i) => {
      if (i >= cloneEls.length) return;
      const cloneEl = cloneEls[i] as HTMLElement;

      // Fix fixed/sticky: convert to absolute at exact visual position
      if (info.position && info.rect) {
        const r = info.rect;
        
        if (info.position === 'sticky') {
          // For sticky elements: just remove the sticky positioning
          // Since we don't translate scroll containers with sticky descendants,
          // the sticky element will naturally appear at its visual position
          cloneEl.style.position = 'relative';
        } else {
          // Fixed elements: convert to absolute at exact visual position
          cloneEl.style.position = 'absolute';
          cloneEl.style.top = `${r.top + sy}px`;
          cloneEl.style.left = `${r.left + sx}px`;
          cloneEl.style.width = `${r.width}px`;
          cloneEl.style.height = `${r.height}px`;
          cloneEl.style.bottom = 'auto';
          cloneEl.style.right = 'auto';
          cloneEl.style.margin = '0';
        }
      }

      // Fix scroll: translate children to show scrolled state
      if (info.scrollLeft || info.scrollTop) {
        const sLeft = info.scrollLeft || 0;
        const sTop = info.scrollTop || 0;
        
        // Find sticky elements within this scroll container (direct or nested)
        const stickyEls = new Set<Element>();
        origEls[i].querySelectorAll('*').forEach(desc => {
          if (window.getComputedStyle(desc).position === 'sticky') {
            stickyEls.add(desc);
          }
        });
        
        // Map original sticky elements to their clone counterparts by index
        const stickyCloneEls = new Set<Element>();
        stickyEls.forEach(stickyEl => {
          // Find index of sticky element in origEls
          for (let j = 0; j < origEls.length; j++) {
            if (origEls[j] === stickyEl && j < cloneEls.length) {
              stickyCloneEls.add(cloneEls[j]);
              break;
            }
          }
        });
        
        cloneEl.style.overflow = 'hidden';
        
        // Create wrapper for non-sticky content
        const wrapper = document.createElement('div');
        wrapper.style.transform = `translate(${-sLeft}px, ${-sTop}px)`;
        wrapper.style.width = '100%';
        wrapper.style.minHeight = '100%';
        
        // Move all children to wrapper
        while (cloneEl.firstChild) {
          wrapper.appendChild(cloneEl.firstChild);
        }
        cloneEl.appendChild(wrapper);
        
        // Now fix sticky elements: move them out of wrapper and position absolutely
        stickyCloneEls.forEach(stickyClone => {
          const stickyEl = stickyClone as HTMLElement;
          // Get the sticky element's original rect relative to scroll container
          const origIdx = Array.from(cloneEls).indexOf(stickyClone);
          if (origIdx >= 0 && origIdx < origEls.length) {
            const origSticky = origEls[origIdx] as HTMLElement;
            const stickyRect = origSticky.getBoundingClientRect();
            const containerRect = (origEls[i] as HTMLElement).getBoundingClientRect();
            
            // Clone the sticky element and position it absolutely
            const stickyCloneFixed = stickyEl.cloneNode(true) as HTMLElement;
            stickyCloneFixed.style.position = 'absolute';
            stickyCloneFixed.style.top = `${stickyRect.top - containerRect.top}px`;
            stickyCloneFixed.style.left = `${stickyRect.left - containerRect.left}px`;
            stickyCloneFixed.style.width = `${stickyRect.width}px`;
            stickyCloneFixed.style.zIndex = '100';
            stickyCloneFixed.style.margin = '0';
            
            // Add to scroll container (outside wrapper)
            cloneEl.appendChild(stickyCloneFixed);
            
            // Hide the original in the wrapper
            stickyEl.style.visibility = 'hidden';
          }
        });
      }
    });

    // Step 3: Build offscreen capture container
    const clipW = isFullPage ? fullW : vw;
    const clipH = isFullPage ? fullH : vh;

    clone.style.position = 'relative';
    clone.style.top = isFullPage ? '0' : `${-sy}px`;
    clone.style.left = isFullPage ? '0' : `${-sx}px`;
    clone.style.width = `${fullW}px`;
    clone.style.height = `${fullH}px`;
    clone.style.margin = '0';

    const clip = document.createElement('div');
    clip.style.cssText = `position:absolute;left:-99999px;top:0;width:${clipW}px;height:${clipH}px;overflow:hidden;`;
    clip.appendChild(clone);
    document.documentElement.appendChild(clip);

    try {
      const result = await snapdom(clip, { embedFonts: true });
      const blob = await result.toBlob({ type: 'png' });

      const reader = new FileReader();
      reader.onload = () => this.postToParent({ type: 'png-ready', data: reader.result });
      reader.onerror = () => this.postToParent({ type: 'png-error', error: 'Failed to read captured image' });
      reader.readAsDataURL(blob);
    } catch (error) {
      this.postToParent({
        type: 'png-error',
        error: error instanceof Error ? error.message : 'PNG capture failed',
      });
    } finally {
      clip.remove();
      overlayEls.forEach(el => (el as HTMLElement).style.display = '');
    }
  }

  // -------------------------------------------------------------------------
  // Take Picture (using SnapCapture)
  // -------------------------------------------------------------------------

  private async takePicture(mode: 'visible' | 'fullPage' = 'visible'): Promise<void> {
    const overlayEls = document.querySelectorAll(`[${OVERLAY_DATA_ATTR}]`);
    overlayEls.forEach(el => (el as HTMLElement).style.display = 'none');

    try {
      const capture = createSnapCapture();
      const blob = mode === 'fullPage'
        ? await capture.fullPageBlob(document.body)
        : await capture.visibleBlob(document.body);

      // Download the image
      const filename = `capture-${mode}-${Date.now()}.png`;
      capture.download(blob, filename);

      const reader = new FileReader();
      reader.onload = () => this.postToParent({ type: 'picture-ready', data: reader.result, mode });
      reader.onerror = () => this.postToParent({ type: 'picture-error', error: 'Failed to read captured image' });
      reader.readAsDataURL(blob);
    } catch (error) {
      this.postToParent({
        type: 'picture-error',
        error: error instanceof Error ? error.message : 'Picture capture failed',
      });
    } finally {
      overlayEls.forEach(el => (el as HTMLElement).style.display = '');
    }
  }

  // -------------------------------------------------------------------------
  // Mouse event handlers
  // -------------------------------------------------------------------------

  private handleMouseMove(e: MouseEvent): void {
    if (this.state !== 'hovering') return;

    // Find the deepest element under the cursor, skipping our own overlays
    const target = this.getDeepestElement(e.clientX, e.clientY);

    if (!target) {
      // Cursor is outside all elements — remove hover overlay
      this.removeHoverOverlay();
      this.currentTarget = null;
      return;
    }

    // Same element — no update needed
    if (target === this.currentTarget) {
      // Still reposition in case the element moved/resized
      if (this.hoverOverlay) {
        this.positionOverlay(this.hoverOverlay, target);
      }
      return;
    }

    this.currentTarget = target;

    if (!this.hoverOverlay) {
      this.hoverOverlay = this.createOverlay('hover');
      document.body.appendChild(this.hoverOverlay);
    }

    this.positionOverlay(this.hoverOverlay, target);
  }

  private handleClick(e: MouseEvent): void {
    if (this.state !== 'hovering') return;

    e.preventDefault();
    e.stopPropagation();

    const target = this.getDeepestElement(e.clientX, e.clientY);
    if (!target) return;

    // Remove hover overlay
    this.removeHoverOverlay();

    if (e.shiftKey) {
      // Shift+click: toggle this element in the selection
      const existingIdx = this.selectedOverlays.findIndex(s => s.element === target);
      if (existingIdx !== -1) {
        // Already selected — remove it (deselect)
        this.unobserveElement(this.selectedOverlays[existingIdx].element);
        this.selectedOverlays[existingIdx].overlay.remove();
        this.selectedOverlays.splice(existingIdx, 1);
      } else {
        // Not selected — add it
        const uid = this.nextUid();
        const overlay = this.createOverlay('selected');
        document.body.appendChild(overlay);
        this.positionOverlay(overlay, target);
        this.selectedOverlays.push({ overlay, element: target, uid });
        this.observeElement(target);
      }
    } else {
      // Normal click: replace entire selection with just this element
      this.removeAllSelectedOverlays();
      const uid = this.nextUid();
      const overlay = this.createOverlay('selected');
      document.body.appendChild(overlay);
      this.positionOverlay(overlay, target);
      this.selectedOverlays.push({ overlay, element: target, uid });
      this.observeElement(target);
    }

    this.currentTarget = target;

    // Remove hover/click listeners — we're done until parent re-enables
    document.removeEventListener('mousemove', this.boundHandleMouseMove, true);
    document.removeEventListener('click', this.boundHandleClick, true);

    // Transition to selected state
    this.state = 'selected';

    // Scroll listener is already active from activate() — no need to re-add

    // Build and send payload with shiftKey flag — include the uid of the latest overlay
    const latestUid = this.selectedOverlays[this.selectedOverlays.length - 1]?.uid ?? '';
    const payload = this.buildPayload(target, e.shiftKey, latestUid);
    this.postToParent(payload);
  }

  // -------------------------------------------------------------------------
  // Scroll handling — reposition overlays when iframe content scrolls
  // -------------------------------------------------------------------------

  private scrollRafId: number | null = null;

  private handleScroll(): void {
    // Coalesce rapid scroll events into a single rAF repaint
    if (this.scrollRafId !== null) return;
    this.scrollRafId = requestAnimationFrame(() => {
      this.scrollRafId = null;
      // Reposition hover overlay if active
      if (this.hoverOverlay && this.currentTarget) {
        this.positionOverlay(this.hoverOverlay, this.currentTarget);
      }
      // Reposition all selected overlays
      for (const s of this.selectedOverlays) {
        this.positionOverlay(s.overlay, s.element);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Element targeting
  // -------------------------------------------------------------------------

  /**
   * Find the deepest DOM element at the given coordinates,
   * skipping any overlay elements we created.
   */
  private getDeepestElement(x: number, y: number): Element | null {
    // Temporarily hide overlays so elementFromPoint sees through them
    const overlays: HTMLDivElement[] = this.selectedOverlays.map(s => s.overlay);
    if (this.hoverOverlay) overlays.push(this.hoverOverlay);

    for (const ov of overlays) {
      ov.style.display = 'none';
    }

    const el = document.elementFromPoint(x, y);

    for (const ov of overlays) {
      ov.style.display = '';
    }

    // Extra safety: if elementFromPoint still returns one of our overlays, skip it
    if (el && el.hasAttribute(OVERLAY_DATA_ATTR)) {
      return null;
    }

    return el;
  }

  // -------------------------------------------------------------------------
  // Overlay management
  // -------------------------------------------------------------------------

  private createOverlay(type: 'hover' | 'selected'): HTMLDivElement {
    const div = document.createElement('div');
    div.setAttribute(OVERLAY_DATA_ATTR, type);

    div.style.position = 'fixed';
    div.style.pointerEvents = 'none';
    div.style.zIndex = '2147483647';
    div.style.boxSizing = 'border-box';
    // No transition — overlays must track elements instantly during scroll
    div.style.willChange = 'top, left, width, height';

    if (type === 'hover') {
      div.style.border = '2px solid rgba(59, 130, 246, 0.8)';
    } else {
      div.style.border = '2px solid rgba(139, 92, 246, 0.8)';
    }

    return div;
  }

  private positionOverlay(overlay: HTMLDivElement, element: Element): void {
    const rect = element.getBoundingClientRect();
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  }

  private removeHoverOverlay(): void {
    if (this.hoverOverlay) {
      this.hoverOverlay.remove();
      this.hoverOverlay = null;
    }
  }

  private removeAllSelectedOverlays(): void {
    for (const s of this.selectedOverlays) {
      this.unobserveElement(s.element);
      s.overlay.remove();
    }
    this.selectedOverlays = [];
    // Only remove scroll listener if we're not in hovering state
    // (hovering state also uses scroll to track the hover overlay)
    if (this.state !== 'hovering') {
      window.removeEventListener('scroll', this.boundHandleScroll, true);
    }
  }

  // -------------------------------------------------------------------------
  // Payload construction
  // -------------------------------------------------------------------------

  /**
   * Build the element-selected payload for postMessage.
   * Content is truncated to MAX_CONTENT_LENGTH (5000) chars.
   * Backward-compatible: content, elements, boundingRect always present;
   * sourceAttribution is an additive optional field (may be null).
   */
  private buildPayload(element: Element, shiftKey: boolean, uid: string): ElementSelectedPayload {
    const outerHTML = element.outerHTML;
    const content =
      outerHTML.length > MAX_CONTENT_LENGTH
        ? outerHTML.substring(0, MAX_CONTENT_LENGTH)
        : outerHTML;

    const rect = element.getBoundingClientRect();

    return {
      type: 'element-selected',
      content,
      elements: [
        {
          tagName: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          id: element.id || '',
        },
      ],
      boundingRect: {
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
      },
      sourceAttribution: this.getSourceAttribution(element),
      sourceId: this.getSourceId(element),
      sourceTag: this.getSourceTag(element),
      sourceProps: this.getSourceProps(element),
      componentName: this.getComponentName(element),
      computedStyles: this.getComputedStyles(element),
      shiftKey,
      uid,
    };
  }

  // -------------------------------------------------------------------------
  // Source attribution via data-source-id
  // -------------------------------------------------------------------------

  private getSourceId(element: Element): string | null {
    const el = element.closest('[data-source-id]');
    return el?.getAttribute('data-source-id') ?? null;
  }

  private getSourceTag(element: Element): string | null {
    const el = element.closest('[data-source-id]');
    return el?.getAttribute('data-source-tag') ?? null;
  }

  private getSourceProps(element: Element): Record<string, any> | null {
    // Check wrapper span first (for component props), then fall back to element itself
    const wrapper = element.closest('[data-component]');
    const raw = wrapper?.getAttribute('data-source-props') ?? element.closest('[data-source-id]')?.getAttribute('data-source-props');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  private getComponentName(element: Element): string | null {
    const wrapper = element.closest('[data-component]');
    return wrapper?.getAttribute('data-component') ?? null;
  }

  private getSourceAttribution(element: Element): SourceAttribution | null {
    const sourceId = this.getSourceId(element);
    if (!sourceId) return null;

    // Parse "file:line:col" — file path may contain colons (e.g. C:\...)
    // so we split from the right
    const lastColon = sourceId.lastIndexOf(':');
    if (lastColon === -1) return null;
    const beforeLast = sourceId.substring(0, lastColon);
    const secondLastColon = beforeLast.lastIndexOf(':');
    if (secondLastColon === -1) return null;

    const fileName = sourceId.substring(0, secondLastColon);
    const lineNumber = parseInt(sourceId.substring(secondLastColon + 1, lastColon), 10);

    // Derive component name from file path (e.g. "src/components/Button/Button.tsx" → "Button")
    const parts = fileName.replace(/\\/g, '/').split('/');
    const fileBase = parts[parts.length - 1]?.replace(/\.\w+$/, '') || 'Unknown';

    return { componentName: fileBase, fileName, lineNumber: isNaN(lineNumber) ? null : lineNumber };
  }

  private static STYLE_PROPS = [
    'display',
    'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
    'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'fontSize', 'lineHeight', 'color', 'backgroundColor',
    'borderWidth', 'borderStyle', 'borderColor',
    'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
    'boxShadow',
    'opacity',
    'textAlign',
    'flexDirection', 'justifyContent', 'alignItems', 'gap', 'flexWrap',
    'flexGrow', 'flexShrink', 'flexBasis',
    'gridTemplateColumns', 'gridTemplateRows', 'columnGap', 'rowGap',
    'transform',
  ];

  private getComputedStyles(element: Element): Record<string, string> {
    const el = element as HTMLElement;
    const computed = window.getComputedStyle(el);
    const styles: Record<string, string> = {};
    
    for (const prop of ElementSelector.STYLE_PROPS) {
      const cssProp = prop.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
      const inline = el.style.getPropertyValue(cssProp);
      // Prefer inline var() or explicit values over computed
      styles[prop] = inline || computed.getPropertyValue(cssProp);
    }
    
    // Store raw inline values for sizing mode detection
    styles._inlineWidth = el.style.width || '';
    styles._inlineHeight = el.style.height || '';
    
    // Parent context for sizing mode
    const parent = el.parentElement;
    if (parent) {
      const parentComputed = window.getComputedStyle(parent);
      styles._parentDisplay = parentComputed.display;
      styles._parentFlexDirection = parentComputed.flexDirection;
    }
    
    return styles;
  }

  // -------------------------------------------------------------------------
  // PostMessage
  // -------------------------------------------------------------------------

  private postToParent(data: unknown): void {
    try {
      if (window.parent !== window) {
        window.parent.postMessage(data, this.options.targetOrigin);
      } else {
        // Dev-only: when running outside an iframe, post to self for testing
        window.postMessage(data, this.options.targetOrigin);
      }
    } catch {
      // Cross-origin safety — silently swallow errors
    }
  }
}

// ---------------------------------------------------------------------------
// Convenience init function
// ---------------------------------------------------------------------------

export function initElementSelector(
  options?: ElementSelectorOptions,
): ElementSelector {
  const selector = new ElementSelector(options);
  selector.listen();
  return selector;
}

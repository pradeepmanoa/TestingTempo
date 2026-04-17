// ============================================================================
// DOM Serializer — H2D-quality DOM extraction for Figma export.
// Extracts the full DOM tree with diffed styles, asset blobs, font info,
// transform matrices, and text layout data.
// Communicates results back to the parent frame via postMessage.
// ============================================================================

import { AssetCollector, type AssetEntry } from './assetCollector';
import { FontCollector, type FontFamily } from './fontCollector';
import { DEFAULT_STYLES, BORDER_GROUPS, PRESERVED_ATTRS, TEXT_INPUT_TYPES } from './defaultStyles';

const OVERLAY_DATA_ATTR = 'data-element-selector-overlay';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SerializedRect {
  x: number; y: number; width: number; height: number;
  top: number; right: number; bottom: number; left: number;
  cssWidth?: number; cssHeight?: number;
  quad?: { p1: Point; p2: Point; p3: Point; p4: Point };
}

interface Point { x: number; y: number }

export interface SerializedElement {
  nodeType: number;
  id: string;
  tagName: string;
  name: string;
  textContent: string;
  rect: SerializedRect;
  styles: Record<string, string>;
  attributes?: Record<string, string>;
  childNodes: SerializedElement[];
  src?: string;
  svgString?: string;
  placeholderUrl?: string;
  relativeTransform?: { a: number; b: number; c: number; d: number; e: number; f: number };
  pseudoElementStyles?: { placeholder?: Record<string, string> };
  owningReactComponent?: string;
  /** Figma library component key from data-figma-id — enables INSTANCE node creation */
  figmaComponentKey?: string;
  // Text node fields
  text?: string;
  lineCount?: number;
}

export interface H2DPayload {
  root: SerializedElement;
  documentRect: { x: number; y: number; width: number; height: number };
  viewportRect: { x: number; y: number; width: number; height: number };
  devicePixelRatio: number;
  assets: Record<string, AssetEntry>;
  fonts: Record<string, FontFamily>;
  documentTitle?: string;
}

// ---------------------------------------------------------------------------
// Node ID generation
// ---------------------------------------------------------------------------

let nodeIdCounter = 0;
function nextNodeId(): string { return `h2d-node-${++nodeIdCounter}`; }

// ---------------------------------------------------------------------------
// Public API — called from elementSelector.ts
// ---------------------------------------------------------------------------

export async function extractDOM(targetOrigin = '*'): Promise<void> {
  try {
    nodeIdCounter = 0;
    const assets = new AssetCollector();
    const fonts = new FontCollector();

    // Ensure images are decoded before serialization
    const images = Array.from(document.body.querySelectorAll('img'));
    await Promise.allSettled(images.map(img => {
      if (img.decoding !== 'sync') img.decoding = 'sync';
      if (img.loading !== 'eager') img.loading = 'eager';
      return img.decode();
    }));

    const root = serializeNode(document.body, assets, fonts, undefined);
    if (!root) {
      postToParent({ type: 'dom-error', error: 'Failed to serialize document body' }, targetOrigin);
      return;
    }
    const blobMap = await assets.getBlobMap();

    const assetEntries: Record<string, AssetEntry> = {};
    for (const [url, entry] of blobMap) assetEntries[url] = entry;

    const { width, height } = document.body.getBoundingClientRect();
    const payload: H2DPayload = {
      root,
      documentRect: { x: 0, y: 0, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      viewportRect: { x: window.scrollX, y: window.scrollY, width, height },
      devicePixelRatio: window.devicePixelRatio,
      assets: assetEntries,
      fonts: fonts.getFonts(),
      documentTitle: document.title || undefined,
    };

    postToParent({ type: 'dom-data', data: payload }, targetOrigin);
  } catch (error) {
    postToParent({
      type: 'dom-error',
      error: error instanceof Error ? error.message : 'DOM extraction failed',
    }, targetOrigin);
  }
}

// ---------------------------------------------------------------------------
// Recursive serializer
// ---------------------------------------------------------------------------

function serializeNode(
  node: Node | Node[],
  assets: AssetCollector,
  fonts: FontCollector,
  parentTransform: DOMMatrix | undefined,
): SerializedElement | null {
  if (Array.isArray(node) || node.nodeType === Node.TEXT_NODE) {
    return serializeText(node);
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    return serializeElement(node as Element, assets, fonts, parentTransform);
  }
  return null;
}

function serializeElement(
  element: Element,
  assets: AssetCollector,
  fonts: FontCollector,
  parentTransform: DOMMatrix | undefined,
): SerializedElement | null {
  if (!isVisible(element)) return null;
  if (element.hasAttribute(OVERLAY_DATA_ATTR)) return null;
  if (element.hasAttribute('data-h2d-ignore')) return null;

  const tag = element.tagName.toUpperCase();
  if (tag === 'HEAD' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return null;

  const styles = getDiffedStyles(element);
  const computedStyles = window.getComputedStyle(element);

  // display:contents — skip wrapper, serialize children
  if (computedStyles.display === 'contents') {
    const results: SerializedElement[] = [];
    for (const child of Array.from(element.children)) {
      const s = serializeElement(child, assets, fonts, parentTransform);
      if (s) results.push(s);
    }
    // Return a transparent wrapper that holds all children
    if (results.length === 0) return null;
    if (results.length === 1) return results[0];
    // Multiple children: wrap in a virtual node so none are lost
    const rect = element.getBoundingClientRect();
    return {
      nodeType: Node.ELEMENT_NODE,
      id: nextNodeId(),
      tagName: element.tagName.toLowerCase(),
      name: element.tagName.toLowerCase(),
      textContent: '',
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left },
      styles: {},
      childNodes: results,
    };
  }

  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  // Transform
  const localTransform = getTransformMatrix(computedStyles);
  const combinedTransform = combineTransforms(parentTransform, localTransform);

  // SVG — clone with baked styles
  let svgString: string | undefined;
  if (element instanceof SVGElement && !(element instanceof SVGSVGElement && element.parentElement instanceof SVGElement)) {
    svgString = serializeSvg(element);
  }

  // Canvas — rasterize
  let placeholderUrl: string | undefined;
  if (element instanceof HTMLCanvasElement) {
    placeholderUrl = assets.addCanvas(element);
  }

  // Children
  const childNodes: SerializedElement[] = [];
  if (!svgString && !(element instanceof HTMLCanvasElement)) {
    const root = (element as HTMLElement).shadowRoot ?? element;
    for (const group of iterateChildGroups(root)) {
      const s = serializeNode(group, assets, fonts, combinedTransform);
      if (s) childNodes.push(s);
    }
  }

  // Assets
  if (element instanceof HTMLImageElement && element.currentSrc) {
    assets.addImage(element.currentSrc);
  }
  if (element instanceof HTMLVideoElement) {
    if (element.poster) assets.addImage(element.poster);
    if (element.currentSrc) assets.addVideo(element);
  }
  const bgImages = computedStyles.backgroundImage?.matchAll(/url\(['"]?([^'"\\)]+)['"]?\)/g);
  if (bgImages) for (const [, url] of bgImages) assets.addImage(url);

  // Rasterize gradient backgrounds — Figma H2D ignores CSS gradients
  if (computedStyles.backgroundImage?.includes('gradient(') && !svgString) {
    const rasterUrl = rasterizeGradient(element, computedStyles, assets);
    if (rasterUrl) placeholderUrl = placeholderUrl ?? rasterUrl;
  }

  // Fonts
  fonts.addFromStyles(computedStyles);

  // Pseudo-elements
  let pseudoElementStyles: { placeholder?: Record<string, string> } | undefined;
  if ((element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(element.type)) ||
      element instanceof HTMLTextAreaElement) {
    if ((element as HTMLInputElement).placeholder) {
      pseudoElementStyles = { placeholder: getDiffedStyles(element, '::placeholder') };
    }
  }

  // ::before / ::after — inject as synthetic child nodes
  for (const pseudo of ['::before', '::after'] as const) {
    const ps = window.getComputedStyle(element, pseudo);
    if (ps.content && ps.content !== 'none' && ps.content !== 'normal') {
      const pRect = element.getBoundingClientRect();
      const pStyles = getDiffedStyles(element, pseudo);
      const w = parseFloat(ps.width) || 0;
      const h = parseFloat(ps.height) || 0;
      // Compute position from parent origin + CSS top/left/margin offsets
      const top = parseFloat(ps.top) || 0;
      const left = parseFloat(ps.left) || 0;
      const mt = parseFloat(ps.marginTop) || 0;
      const ml = parseFloat(ps.marginLeft) || 0;
      let px = pRect.x + left + ml;
      let py = pRect.y + top + mt;
      let fw = w, fh = h;
      // Apply CSS transform to rect (Figma doesn't handle transform-origin correctly).
      // Compute post-transform bounding box so Figma renders at the right position.
      if (ps.transform && ps.transform !== 'none') {
        const m = new DOMMatrix(ps.transform);
        const ox = w / 2, oy = h / 2; // transform-origin: center (default)
        const corners = [
          m.transformPoint(new DOMPoint(-ox, -oy)),
          m.transformPoint(new DOMPoint(w - ox, -oy)),
          m.transformPoint(new DOMPoint(w - ox, h - oy)),
          m.transformPoint(new DOMPoint(-ox, h - oy)),
        ];
        const xs = corners.map(p => p.x), ys = corners.map(p => p.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        // Shift rect to post-transform bounding box (centered on same center point)
        px += ox + minX;
        py += oy + minY;
        fw = maxX - minX;
        fh = maxY - minY;
      }
      const synth: SerializedElement = {
        nodeType: Node.ELEMENT_NODE,
        id: nextNodeId(),
        tagName: pseudo,
        name: pseudo,
        textContent: ps.content.replace(/^["']|["']$/g, ''),
        rect: { x: px, y: py, width: fw, height: fh, top: py, right: px + fw, bottom: py + fh, left: px },
        styles: pStyles,
        childNodes: [],
      };
      if (pseudo === '::before') childNodes.unshift(synth);
      else childNodes.push(synth);
    }
  }

  // Text content
  let textContent = '';
  if (tag === 'SELECT') {
    const sel = element as HTMLSelectElement;
    textContent = sel.options[sel.selectedIndex]?.textContent || sel.options[0]?.textContent || '';
  } else {
    textContent = (element as HTMLElement).getAttribute?.('value')
      || (element as HTMLElement).getAttribute?.('placeholder')
      || element.textContent?.trim() || '';
  }

  // Rect with CSS dimensions
  const cssWidth = element instanceof HTMLElement ? element.offsetWidth : rect.width;
  const cssHeight = element instanceof HTMLElement ? element.offsetHeight : rect.height;

  return {
    nodeType: Node.ELEMENT_NODE,
    id: nextNodeId(),
    tagName: tag.toLowerCase(),
    name: element.getAttribute('data-layername') || tag.toLowerCase(),
    textContent,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, cssWidth, cssHeight },
    styles,
    attributes: getAttributes(element),
    childNodes,
    src: element instanceof HTMLImageElement ? element.currentSrc : undefined,
    svgString,
    placeholderUrl,
    relativeTransform: localTransform ? { a: localTransform.a, b: localTransform.b, c: localTransform.c, d: localTransform.d, e: 0, f: 0 } : undefined,
    pseudoElementStyles,
    owningReactComponent: getReactComponentName(element),
    figmaComponentKey: element.getAttribute('data-figma-id') || undefined,
  };
}

// ---------------------------------------------------------------------------
// Text serialization with line count
// ---------------------------------------------------------------------------

function serializeText(node: Node | Node[]): SerializedElement | null {
  const nodes = Array.isArray(node) ? node : [node];
  const text = nodes.map(n => n.textContent || '').join('');
  if (!text.trim()) return null;

  const range = document.createRange();
  if (nodes.length === 1) {
    range.selectNode(nodes[0]);
  } else {
    range.setStart(nodes[0], 0);
    const last = nodes[nodes.length - 1];
    range.setEnd(last, last.textContent?.length ?? 0);
  }

  const { x, y, width, height } = range.getBoundingClientRect();
  const rects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0);

  const ancestor = range.commonAncestorContainer;
  const isVertical = ancestor instanceof HTMLElement &&
    window.getComputedStyle(ancestor).writingMode.startsWith('vertical');
  const lineCount = isVertical
    ? new Set(rects.map(r => Math.round(r.left))).size
    : new Set(rects.map(r => Math.round(r.top))).size;

  range.detach();

  return {
    nodeType: Node.TEXT_NODE,
    id: nextNodeId(),
    tagName: '#text',
    name: '#text',
    text,
    textContent: text,
    rect: { x, y, width, height, top: y, right: x + width, bottom: y + height, left: x },
    styles: {},
    childNodes: [],
    lineCount,
  };
}

// ---------------------------------------------------------------------------
// Style diffing — only serialize properties that differ from defaults
// ---------------------------------------------------------------------------

function getDiffedStyles(element: Element, pseudo?: string): Record<string, string> {
  const computed = window.getComputedStyle(element, pseudo);
  const result: Record<string, string> = {};

  for (const [prop, defaultVal] of Object.entries(DEFAULT_STYLES)) {
    const val = computed[prop as keyof CSSStyleDeclaration] as string;
    if (val !== defaultVal) result[prop] = val;
  }

  // Strip border style/color when width is 0
  for (const g of BORDER_GROUPS) {
    if (result[g.width] == null) {
      delete result[g.style];
      delete result[g.color];
    }
  }
  // Strip outline style/color when width is 0
  if (result.outlineWidth == null) {
    delete result.outlineStyle;
    delete result.outlineColor;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Transform matrix decomposition
// ---------------------------------------------------------------------------

function getTransformMatrix(styles: CSSStyleDeclaration): DOMMatrix | null {
  if (!styles.rotate && !styles.scale && !styles.transform && !styles.translate) return null;
  if (styles.rotate === 'none' && styles.scale === 'none' &&
      styles.transform === 'none' && styles.translate === 'none') return null;
  try {
    const [ox, oy = '0px', oz = '0px'] = (styles.transformOrigin ?? '').split(' ');
    const origin = new DOMMatrix(`translate3d(${ox}, ${oy}, ${oz})`);
    const translate = styles.translate && styles.translate !== 'none' ? parseTranslate(styles.translate) : new DOMMatrix();
    const rotate = styles.rotate && styles.rotate !== 'none' ? parseRotate(styles.rotate) : new DOMMatrix();
    const scale = styles.scale && styles.scale !== 'none' ? parseScale(styles.scale) : new DOMMatrix();
    const transform = new DOMMatrix(styles.transform ?? 'none');
    return origin.multiply(translate).multiply(rotate).multiply(scale).multiply(transform).multiply(origin.inverse());
  } catch {
    return null;
  }
}

function parseTranslate(val: string): DOMMatrix {
  const parts = val.trim().split(/\s+/);
  return new DOMMatrix(`translate3d(${parts[0]}, ${parts[1] ?? '0px'}, ${parts[2] ?? '0px'})`);
}

function parseRotate(val: string): DOMMatrix {
  const parts = val.trim().split(/\s+/);
  if (parts.length === 1) return new DOMMatrix(`rotate(${parts[0]})`);
  if (parts.length === 2) return new DOMMatrix(`rotate${parts[0].toUpperCase()}(${parts[1]})`);
  if (parts.length === 4) return new DOMMatrix(`rotate3d(${parts[0]}, ${parts[1]}, ${parts[2]}, ${parts[3]})`);
  return new DOMMatrix();
}

function parseScale(val: string): DOMMatrix {
  const parts = val.trim().split(/\s+/);
  return new DOMMatrix(`scale3d(${parts[0]}, ${parts[1] ?? parts[0]}, ${parts[2] ?? 1})`);
}

function combineTransforms(parent: DOMMatrix | undefined, local: DOMMatrix | null): DOMMatrix | undefined {
  if (!parent && !local) return undefined;
  if (parent && local) return parent.multiply(local);
  return parent ?? local ?? undefined;
}

// ---------------------------------------------------------------------------
// SVG serialization — clone with baked computed styles
// ---------------------------------------------------------------------------

const SVG_STYLE_DEFAULTS: Record<string, string> = {
  fill: 'rgb(0, 0, 0)', fillOpacity: '1', fillRule: 'nonzero',
  stroke: 'none', strokeWidth: '1px', strokeOpacity: '1',
  strokeDasharray: 'none', strokeDashoffset: '0px',
  strokeLinecap: 'butt', strokeLinejoin: 'miter', strokeMiterlimit: '4',
  opacity: '1', color: 'rgb(0, 0, 0)', display: 'inline', visibility: 'visible',
};

const SVG_ATTR_MAP: Record<string, string> = Object.fromEntries(
  Object.keys(SVG_STYLE_DEFAULTS).map(k => [k, k.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()])
);

function serializeSvg(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  bakeSvgStyles(element, clone);
  const { width, height } = window.getComputedStyle(element);
  if (width.endsWith('px') && height.endsWith('px')) {
    clone.setAttribute('width', width);
    clone.setAttribute('height', height);
  }
  return clone.outerHTML;
}

function bakeSvgStyles(source: Element, target: Element): void {
  if (!(source instanceof Element) || !(target instanceof Element)) return;
  const computed = window.getComputedStyle(source);
  for (const [prop, defaultVal] of Object.entries(SVG_STYLE_DEFAULTS)) {
    const val = computed.getPropertyValue(SVG_ATTR_MAP[prop] ?? prop);
    if (val && val.toLowerCase() !== defaultVal.toLowerCase()) {
      target.setAttribute(SVG_ATTR_MAP[prop] ?? prop, val);
    }
  }
  for (let i = 0; i < source.childNodes.length; i++) {
    bakeSvgStyles(source.childNodes[i] as Element, target.childNodes[i] as Element);
  }
}

// ---------------------------------------------------------------------------
// Attribute extraction
// ---------------------------------------------------------------------------

function getAttributes(element: Element): Record<string, string> | undefined {
  const attrs: Record<string, string> = {};
  for (const { name, value } of element.attributes) {
    if (PRESERVED_ATTRS.has(name.toLowerCase()) || name.startsWith('aria-')) {
      attrs[name] = value;
    }
  }
  if (element instanceof HTMLVideoElement && element.poster) attrs.poster = element.poster;
  if ((element instanceof HTMLImageElement || element instanceof HTMLVideoElement) && element.currentSrc) {
    attrs.currentSrc = element.currentSrc;
  }
  if (element instanceof HTMLInputElement && !attrs.type) attrs.type = element.type;
  return Object.keys(attrs).length > 0 ? attrs : undefined;
}

// ---------------------------------------------------------------------------
// React component name extraction
// ---------------------------------------------------------------------------

function getReactComponentName(element: Element): string | undefined {
  const fiberKey = Object.getOwnPropertyNames(element).find(k => k.startsWith('__reactFiber$'));
  if (!fiberKey) return undefined;
  const fiber = (element as Record<string, unknown>)[fiberKey] as { _debugOwner?: { type?: { displayName?: string; name?: string } } } | undefined;
  return fiber?._debugOwner?.type?.displayName ?? fiber?._debugOwner?.type?.name;
}

// ---------------------------------------------------------------------------
// Visibility check
// ---------------------------------------------------------------------------

function isVisible(element: Element): boolean {
  const styles = window.getComputedStyle(element);
  return styles.display !== 'none' && styles.visibility !== 'hidden';
}

// ---------------------------------------------------------------------------
// Child node iteration — groups consecutive text nodes together
// ---------------------------------------------------------------------------

function* iterateChildGroups(parent: Node): Generator<Node | Node[]> {
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType === Node.TEXT_NODE) {
      const group: Node[] = [child];
      let j = i + 1;
      while (j < children.length && children[j].nodeType === Node.TEXT_NODE) {
        group.push(children[j]);
        j++;
      }
      yield group;
      i = j - 1;
    } else {
      yield child;
    }
  }
}

// ---------------------------------------------------------------------------
// Gradient rasterization — renders CSS gradient backgrounds to a canvas
// so Figma can display them as image fills.
// ---------------------------------------------------------------------------

function rasterizeGradient(element: Element, styles: CSSStyleDeclaration, assets: AssetCollector): string {
  const w = (element as HTMLElement).offsetWidth || element.getBoundingClientRect().width;
  const h = (element as HTMLElement).offsetHeight || element.getBoundingClientRect().height;
  if (w === 0 || h === 0) return '';

  const dpr = window.devicePixelRatio;
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);

  // Encode SVG as a data URI (not blob URL) to avoid canvas tainting
  const escapedBgImage = styles.backgroundImage.replace(/"/g, "'");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}">
    <foreignObject width="100%" height="100%">
      <div xmlns="http://www.w3.org/1999/xhtml" style="width:${pw}px;height:${ph}px;background-image:${escapedBgImage};background-size:${styles.backgroundSize ?? 'auto'};background-position:${styles.backgroundPosition ?? '0% 0%'};background-repeat:${styles.backgroundRepeat ?? 'repeat'}"></div>
    </foreignObject>
  </svg>`;

  const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return assets.addBlobPromise(dataUriToCanvasBlob(dataUri, pw, ph));
}

async function dataUriToCanvasBlob(dataUri: string, w: number, h: number): Promise<Blob> {
  const img = await loadImage(dataUri);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ---------------------------------------------------------------------------
// PostMessage
// ---------------------------------------------------------------------------

function postToParent(data: unknown, targetOrigin: string): void {
  try {
    const target = window.parent !== window ? window.parent : window;
    target.postMessage(data, targetOrigin);
  } catch {
    // Cross-origin safety
  }
}

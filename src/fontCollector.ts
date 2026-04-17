// ============================================================================
// FontCollector — detects which fonts are used and available on the page.
// Produces a map of font families with their usages.
// ============================================================================

export interface FontUsage {
  fontWeight: string;
  fontStyle: string;
  fontStretch: string;
  fontSize: string;
}

export interface FontFamily {
  familyName: string;
  usages: FontUsage[];
}

export class FontCollector {
  private families = new Map<string, FontFamily>();
  private processedUsages = new Set<string>();
  private unavailable = new Set<string>();
  private _canvas: HTMLCanvasElement | null = null;
  private _ctx: CanvasRenderingContext2D | null = null;

  private get ctx(): CanvasRenderingContext2D | null {
    if (!this._ctx) {
      this._canvas = document.createElement('canvas');
      this._ctx = this._canvas.getContext('2d');
    }
    return this._ctx;
  }

  addFromStyles(styles: CSSStyleDeclaration): void {
    const family = styles.fontFamily || 'Times';
    const weight = styles.fontWeight || '400';
    const style = styles.fontStyle === 'italic' ? 'italic' : 'normal';
    const stretch = styles.fontStretch || '100%';
    const size = styles.fontSize || '16px';

    for (const name of parseFontFamilies(family)) {
      const key = name.toLowerCase();
      const unavailKey = `${key}|${stretch}|${style}|${weight}`;

      if (this.unavailable.has(unavailKey)) continue;

      if (this.families.has(key)) {
        this.addUsage(key, weight, style, stretch, size);
        return;
      }

      if (!this.checkAvailable(name, stretch, style, weight)) {
        this.unavailable.add(unavailKey);
        continue;
      }

      this.families.set(key, { familyName: name, usages: [] });
      this.addUsage(key, weight, style, stretch, size);
      return;
    }
  }

  getFonts(): Record<string, FontFamily> {
    return Object.fromEntries(this.families);
  }

  private addUsage(key: string, weight: string, style: string, stretch: string, size: string): void {
    const usageKey = `${key}|${weight}|${style}|${stretch}|${size}`;
    if (this.processedUsages.has(usageKey)) return;
    this.processedUsages.add(usageKey);
    this.families.get(key)?.usages.push({ fontWeight: weight, fontStyle: style, fontStretch: stretch, fontSize: size });
  }

  private checkAvailable(family: string, stretch: string, style: string, weight: string): boolean {
    const ctx = this.ctx;
    if (!ctx) return false;
    const testStr = 'mmmmmmmmmmlli';
    const testSize = '72px';
    const stretchKw = percentToStretchKeyword(stretch);
    for (const fallback of ['monospace', 'sans-serif', 'serif']) {
      ctx.font = `${style} ${weight} ${testSize} ${fallback}`;
      const fallbackWidth = ctx.measureText(testStr).width;
      ctx.font = `${style} ${weight} ${testSize} "${family}", ${fallback}`;
      const testWidth = ctx.measureText(testStr).width;
      if (fallbackWidth !== testWidth) return true;
    }
    return false;
  }
}

function parseFontFamilies(value: string): string[] {
  const result: string[] = [];
  const re = /(?:"([^"]+)"|'([^']+)'|([^,\s][^,]*))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    const name = (m[1] ?? m[2] ?? m[3])?.trim();
    if (name) result.push(name);
  }
  return result;
}

function percentToStretchKeyword(val: string): string {
  if (!val.endsWith('%')) return val.toLowerCase();
  const n = parseFloat(val);
  if (isNaN(n)) return 'normal';
  if (n <= 50) return 'ultra-condensed';
  if (n <= 62.5) return 'extra-condensed';
  if (n <= 75) return 'condensed';
  if (n <= 87.5) return 'semi-condensed';
  if (n <= 100) return 'normal';
  if (n <= 112.5) return 'semi-expanded';
  if (n <= 125) return 'expanded';
  if (n <= 150) return 'extra-expanded';
  return 'ultra-expanded';
}

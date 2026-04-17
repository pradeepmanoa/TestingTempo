// ============================================================================
// AssetCollector — collects images, canvases, and videos as blobs during
// DOM serialization. Produces a Map<url, { url, blob, error? }>.
// ============================================================================

export interface AssetEntry {
  url: string;
  blob: Blob | null;
  error?: string;
}

export class AssetCollector {
  private promises = new Map<string, Promise<AssetEntry>>();
  private rasterizedId = 0;

  addImage(url: string): void {
    if (!url || this.promises.has(url)) return;
    this.promises.set(url, this.fetchAsBlob(url));
  }

  addCanvas(canvas: HTMLCanvasElement): string {
    const url = `rasterized:${this.rasterizedId++}`;
    this.promises.set(url, canvasToBlob(canvas).then(blob => ({ url, blob })).catch(e => ({ url, blob: null, error: e instanceof Error ? e.message : String(e) })));
    return url;
  }

  addBlobPromise(promise: Promise<Blob | null>): string {
    const url = `rasterized:${this.rasterizedId++}`;
    this.promises.set(url, promise.then(blob => ({ url, blob })).catch(e => ({ url, blob: null, error: e instanceof Error ? e.message : String(e) })));
    return url;
  }

  addVideo(video: HTMLVideoElement): void {
    const url = video.currentSrc;
    if (!url || this.promises.has(url)) return;
    this.promises.set(url, captureVideoFrame(video).then(blob => ({ url, blob })).catch(e => ({ url, blob: null, error: e instanceof Error ? e.message : String(e) })));
  }

  async getBlobMap(): Promise<Map<string, AssetEntry>> {
    const entries = await Promise.all(Array.from(this.promises.values()));
    return new Map(entries.map(entry => [entry.url, entry]));
  }

  private async fetchAsBlob(url: string): Promise<AssetEntry> {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      return { url, blob: await res.blob() };
    } catch (e) {
      return { url, blob: null, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
  });
}

async function captureVideoFrame(video: HTMLVideoElement): Promise<Blob> {
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    throw new Error('Video has invalid dimensions');
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas context');
  ctx.drawImage(video, 0, 0);
  return canvasToBlob(canvas);
}

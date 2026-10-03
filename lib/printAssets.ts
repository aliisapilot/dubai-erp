/** Bound asset waits and remove listeners on every path; lazy images must load before print. */
export async function waitForDocumentImages(images: HTMLImageElement[], timeoutMs = 10_000): Promise<void> {
  await Promise.all(images.map(async image => {
    image.loading = 'eager';
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finish: (() => void) | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('A document image is still loading. Try printing again.')), timeoutMs);
    });
    try {
      const ready = new Promise<void>(resolve => {
        finish = () => resolve();
        image.addEventListener('load', finish, {once: true});
        image.addEventListener('error', finish, {once: true});
        if (image.complete) finish();
      }).then(async () => {
        try { await image.decode(); } catch { /* Preserve existing handling of broken optional images. */ }
      });
      await Promise.race([ready, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
      if (finish) { image.removeEventListener('load', finish); image.removeEventListener('error', finish); }
    }
  }));
}

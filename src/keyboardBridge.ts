/**
 * Keyboard & wheel bridge — forwards keydown and Cmd/Ctrl+wheel events
 * from the iframe to the parent window via postMessage. The parent canvas
 * can then decide which keys are app shortcuts (and handle them) vs.
 * normal iframe keys (ignored), and forward wheel zoom gestures to
 * the ReactFlow canvas.
 *
 * Only runs when embedded in an iframe. Listens in capture phase so we
 * see the event before any iframe content handlers.
 */

export function initKeyboardBridge() {
  if (window.parent === window) return; // Not in an iframe

  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      // Don't forward if the user is typing in an input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      window.parent.postMessage(
        {
          type: 'iframe-keydown',
          key: e.key,
          code: e.code,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          altKey: e.altKey,
          repeat: e.repeat,
        },
        '*',
      );
    },
    true, // capture phase
  );

  // Wheel bridge — forward Cmd/Ctrl+scroll and trackpad pinch to parent for canvas zoom.
  // Trackpad pinch shows up as wheel events with ctrlKey: true in Chrome.
  // We preventDefault() to suppress the browser's native page zoom.
  window.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      if (!e.metaKey && !e.ctrlKey) return; // Only intercept zoom gestures

      e.preventDefault(); // Suppress browser's default zoom

      window.parent.postMessage(
        {
          type: 'iframe-wheel',
          deltaX: e.deltaX,
          deltaY: e.deltaY,
          deltaMode: e.deltaMode,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          clientX: e.clientX,
          clientY: e.clientY,
        },
        '*',
      );
    },
    { capture: true, passive: false },
  );
}

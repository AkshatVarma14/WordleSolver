import { extractBoardState } from './dom-reader';
import { BoardMutatedNotification } from '../types/messages';

export type ObserverCallback = (notification: BoardMutatedNotification) => void;

/**
 * Attaches a debounced MutationObserver to the Wordle container to track live board updates.
 * Purely read-only: never interacts with or mutates page elements.
 */
export function startBoardObserver(
  root: Element | Document = document,
  onUpdate?: ObserverCallback
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const handleMutation = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    // 250ms debounce ensures tile flip animations complete before reading
    debounceTimer = setTimeout(() => {
      try {
        const extraction = extractBoardState(root);
        const notification: BoardMutatedNotification = {
          type: 'BOARD_MUTATED',
          payload: extraction,
        };

        if (onUpdate) {
          onUpdate(notification);
        }

        // Notify runtime if extension context is active
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage(notification).catch(() => {
            // Ignore if popup is closed and no listener is attached
          });
        }
      } catch {
        // Suppress observer errors on page unload
      }
    }, 250);
  };

  const observer = new MutationObserver(handleMutation);

  const targetNode =
    (root instanceof Document ? root.body : root) || document.body;

  if (targetNode) {
    observer.observe(targetNode, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state', 'data-animation', 'class', 'letter'],
    });
  }

  return () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    observer.disconnect();
  };
}

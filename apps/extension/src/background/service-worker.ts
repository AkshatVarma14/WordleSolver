import { BoardMutatedNotification } from '../types/messages';

/**
 * Background Service Worker (Manifest V3)
 * Manages extension lifecycle, badge text, and tab updates.
 */

// Set initial badge appearance
if (typeof chrome !== 'undefined' && chrome.action?.setBadgeBackgroundColor) {
  chrome.action.setBadgeBackgroundColor({ color: '#538d4e' }).catch(() => {});
}

// Listen for messages from content script or popup
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener(
    (message: unknown, sender: chrome.runtime.MessageSender) => {
      const msg = message as { type?: string; payload?: unknown };

      if (msg?.type === 'BOARD_MUTATED' && sender.tab?.id) {
        const notif = message as BoardMutatedNotification;
        const count = notif.payload.turns.length;

        if (chrome.action?.setBadgeText) {
          const badgeText = count > 0 ? String(count) : '';
          chrome.action.setBadgeText({
            text: badgeText,
            tabId: sender.tab.id,
          }).catch(() => {});
        }
      }
    }
  );
}

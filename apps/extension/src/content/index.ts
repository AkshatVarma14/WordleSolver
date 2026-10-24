import { extractBoardState } from './dom-reader';
import { startBoardObserver } from './observer';
import { ExtensionMessage, GetBoardStateResponse } from '../types/messages';

/**
 * Content Script entry point injected on https://www.nytimes.com/games/wordle*
 * Strictly read-only: never enters guesses, clicks buttons, or simulates user actions.
 */
function initContentScript(): void {
  // Listen for requests from popup UI
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener(
      (
        message: unknown,
        _sender: chrome.runtime.MessageSender,
        sendResponse: (res: GetBoardStateResponse) => void
      ) => {
        const msg = message as ExtensionMessage;
        if (msg && msg.type === 'GET_BOARD_STATE') {
          const extraction = extractBoardState(document);
          sendResponse({
            type: 'BOARD_STATE_RESULT',
            payload: extraction,
          });
        }
        return true; // Keep message channel open for async response
      }
    );
  }

  // Start live observer for real-time tile flips
  startBoardObserver(document);
}

// Execute initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initContentScript);
} else {
  initContentScript();
}

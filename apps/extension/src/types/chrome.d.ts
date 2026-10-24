/**
 * Lightweight, strictly typed Chrome Extension API definitions
 * for Manifest V3 content-script and popup interactions.
 */

declare namespace chrome {
  namespace runtime {
    interface MessageSender {
      readonly tab?: tabs.Tab;
      readonly frameId?: number;
      readonly id?: string;
      readonly url?: string;
    }

    type MessageResponseCallback = (response?: unknown) => void;

    interface ExtensionMessageEvent {
      addListener(
        callback: (
          message: unknown,
          sender: MessageSender,
          sendResponse: MessageResponseCallback
        ) => boolean | void | Promise<void>
      ): void;
      removeListener(
        callback: (
          message: unknown,
          sender: MessageSender,
          sendResponse: MessageResponseCallback
        ) => void
      ): void;
    }

    const onMessage: ExtensionMessageEvent;

    function sendMessage<M = unknown, R = unknown>(
      message: M,
      responseCallback?: (response: R) => void
    ): Promise<R>;

    function sendMessage<M = unknown, R = unknown>(
      extensionId: string,
      message: M,
      responseCallback?: (response: R) => void
    ): Promise<R>;

    const lastError: { readonly message?: string } | undefined;
  }

  namespace tabs {
    interface Tab {
      readonly id?: number;
      readonly index: number;
      readonly windowId: number;
      readonly url?: string;
      readonly title?: string;
      readonly active: boolean;
    }

    interface QueryInfo {
      active?: boolean;
      currentWindow?: boolean;
      lastFocusedWindow?: boolean;
      url?: string | string[];
    }

    function query(queryInfo: QueryInfo): Promise<Tab[]>;

    function sendMessage<M = unknown, R = unknown>(
      tabId: number,
      message: M,
      responseCallback?: (response: R) => void
    ): Promise<R>;
  }

  namespace action {
    function setBadgeText(details: { text: string; tabId?: number }): Promise<void>;
    function setBadgeBackgroundColor(details: { color: string | [number, number, number, number]; tabId?: number }): Promise<void>;
  }
}

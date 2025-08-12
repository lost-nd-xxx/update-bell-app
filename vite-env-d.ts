/// <reference types="vite/client" />

// Service Worker関連の型定義をグローバルスコープで宣言
declare global {
  interface Window {
    swDebugger?: {
      get: () => import('./src/utils/serviceWorkerDebug').ServiceWorkerDebugger;
      logs: () => Promise<Array<{
        timestamp: string;
        level: string;
        message: string;
        data?: string | null;
      }>>;
      info: () => Promise<{
        isSupported: boolean;
        registration: ServiceWorkerRegistration | null;
        controller: ServiceWorker | null;
        state: string | undefined;
        scope: string | undefined;
        updateFound: boolean;
      }>;
      report: () => Promise<unknown>;
      export: () => Promise<void>;
      check: () => Promise<void>;
      start: (interval?: number) => Promise<void>;
      stop: () => Promise<void>;
    };
    swDebug?: typeof Window.prototype.swDebugger;
  }
}

// モジュール宣言を追加してグローバルスコープ拡張を可能にする
export {};
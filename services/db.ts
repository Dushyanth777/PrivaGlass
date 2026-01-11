
/**
 * @file db.ts
 * @description Persistent local storage management using IndexedDB for caching parsed messages.
 */

import { ChatMessage } from '../types';

const DB_NAME = 'whatsapp_viewer_cache_v3';
const STORE_NAME = 'chat_logs';
const DB_VERSION = 1;

/**
 * Initializes or retrieves the IndexedDB instance.
 */
const getDBInstance = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Caches a message array using a unique key.
 * We store the messages as-is. Blob URLs will be dead on next load, 
 * but they contain the filename info we use to revive them.
 */
export const saveChatToCache = async (cacheKey: string, messages: ChatMessage[]): Promise<void> => {
  try {
    const db = await getDBInstance();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(messages, cacheKey);
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.error('Storage failed:', err);
  }
};

/**
 * Retrieves cached messages from storage.
 */
export const getChatFromCache = async (cacheKey: string): Promise<ChatMessage[] | null> => {
  try {
    const db = await getDBInstance();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(cacheKey);
      request.onsuccess = () => {
        const result = request.result as ChatMessage[] | undefined;
        resolve(result || null);
      };
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
};

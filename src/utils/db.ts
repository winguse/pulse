interface AudioSession {
  id?: number;
  name: string;
  timestamp: number;
  sampleRate: number;
  duration: number;
  originalAudio: Float32Array;
  filteredAudio: Float32Array;
  envelope: Float32Array;
  peaks: any[];
  averageBpm: number;
}

const DB_NAME = 'PulseAnalyzerDB';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open database'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

/**
 * Saves a session containing raw and processed audio data to IndexedDB.
 */
export async function saveSession(session: Omit<AudioSession, 'id'>): Promise<number> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(session);

    request.onsuccess = () => {
      resolve(request.result as number);
    };

    request.onerror = () => {
      reject(new Error('Failed to save session data.'));
    };
  });
}

/**
 * Retrieves all saved audio analysis sessions from IndexedDB (metadata only, omitting large buffers to save memory).
 */
export async function getSessionsList(): Promise<Omit<AudioSession, 'originalAudio' | 'filteredAudio' | 'envelope'>[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    const list: any[] = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const { id, name, timestamp, sampleRate, duration, averageBpm, peaks } = cursor.value;
        list.push({
          id,
          name,
          timestamp,
          sampleRate,
          duration,
          averageBpm,
          peaksCount: peaks.length,
        });
        cursor.continue();
      } else {
        resolve(list);
      }
    };

    request.onerror = () => {
      reject(new Error('Failed to load session list.'));
    };
  });
}

/**
 * Retrieves a full session by ID.
 */
export async function getSession(id: number): Promise<AudioSession> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result);
      } else {
        reject(new Error(`Session with ID ${id} not found.`));
      }
    };

    request.onerror = () => {
      reject(new Error('Failed to load session data.'));
    };
  });
}

/**
 * Deletes a session by ID.
 */
export async function deleteSession(id: number): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error(`Failed to delete session with ID ${id}.`));
    };
  });
}

const ENV_PLAYER_ID = import.meta.env.VITE_PLAYER_ID as string | undefined;
const ENV_ROBOT_ID = import.meta.env.VITE_ROBOT_ID as string | undefined;
const ENV_ROOM_ID = import.meta.env.VITE_ROOM_ID as string | undefined;
const ENV_PLAYER_LANG = import.meta.env.VITE_PLAYER_LANG as string | undefined;
const ENV_SYNC_RATE = import.meta.env.VITE_SYNC_RATE as string | undefined;
const STORAGE_PLAYER_KEY = 'plares_player_id';
const STORAGE_ROBOT_KEY = 'plares_robot_id';
const STORAGE_ROOM_KEY = 'plares_room_id';
const STORAGE_LANG_KEY = 'plares_lang';
const STORAGE_SYNC_RATE_KEY = 'plares_sync_rate';
const URL_ROOM_ID = (() => {
  try {
    return new URLSearchParams(window.location.search).get('room') ?? undefined;
  } catch {
    return undefined;
  }
})();
const URL_LANG = (() => {
  try {
    return new URLSearchParams(window.location.search).get('lang') ?? undefined;
  } catch {
    return undefined;
  }
})();

const createId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

const getStoredOrCreate = (storageKey: string, fallbackPrefix: string, envValue?: string): string => {
  if (envValue && envValue.trim().length > 0) return envValue;

  try {
    const found = localStorage.getItem(storageKey);
    if (found) return found;
    const generated = createId(fallbackPrefix);
    localStorage.setItem(storageKey, generated);
    return generated;
  } catch {
    return createId(fallbackPrefix);
  }
};

export const PLAYER_ID = getStoredOrCreate(STORAGE_PLAYER_KEY, 'player', ENV_PLAYER_ID);
export const ROBOT_ID = getStoredOrCreate(STORAGE_ROBOT_KEY, 'robot', ENV_ROBOT_ID);
export const ROOM_ID = getStoredOrCreate(STORAGE_ROOM_KEY, 'room', URL_ROOM_ID || ENV_ROOM_ID || 'default');

const getStoredLang = (): string => {
  const fallback = (URL_LANG || ENV_PLAYER_LANG || navigator.language || 'en-US').trim();
  try {
    const found = localStorage.getItem(STORAGE_LANG_KEY);
    if (found && found.trim().length > 0) return found;
    localStorage.setItem(STORAGE_LANG_KEY, fallback);
    return fallback;
  } catch {
    return fallback;
  }
};

const parseSyncRate = (value: string | undefined): number | null => {
  if (!value) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(1, num));
};

const getStoredSyncRate = (): number => {
  const envRate = parseSyncRate(ENV_SYNC_RATE);
  if (envRate !== null) return envRate;
  try {
    const found = parseSyncRate(localStorage.getItem(STORAGE_SYNC_RATE_KEY) ?? undefined);
    if (found !== null) return found;
    const initial = 0.5;
    localStorage.setItem(STORAGE_SYNC_RATE_KEY, String(initial));
    return initial;
  } catch {
    return 0.5;
  }
};

export const PLAYER_LANG = getStoredLang();
export const SYNC_RATE = getStoredSyncRate();

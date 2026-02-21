const ENV_PLAYER_ID = import.meta.env.VITE_PLAYER_ID as string | undefined;
const ENV_ROBOT_ID = import.meta.env.VITE_ROBOT_ID as string | undefined;
const ENV_ROOM_ID = import.meta.env.VITE_ROOM_ID as string | undefined;
const STORAGE_PLAYER_KEY = 'plares_player_id';
const STORAGE_ROBOT_KEY = 'plares_robot_id';
const STORAGE_ROOM_KEY = 'plares_room_id';
const URL_ROOM_ID = (() => {
  try {
    return new URLSearchParams(window.location.search).get('room') ?? undefined;
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

import { create } from 'zustand';

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface ArenaCalibration {
  point: Point3;
  yaw: number;
  scale: number;
  timestamp: number;
  frameId: string;
}

interface ArenaSyncState {
  latestSample: ArenaCalibration | null;
  localCalibration: ArenaCalibration | null;
  remoteCalibrations: Record<string, ArenaCalibration>;
  hasRemotePeer: boolean;
  activeRemotePeerId: string | null;
  matchAlignmentReady: boolean;
  setLatestSample: (sample: ArenaCalibration) => void;
  setLocalCalibration: (sample: ArenaCalibration) => void;
  setRemoteCalibration: (userId: string, sample: ArenaCalibration) => void;
  setPeerState: (remotePeerId: string | null) => void;
  clearCalibrations: () => void;
  hasAlignment: (remoteUserId: string) => boolean;
  mapRemotePosition: (remoteUserId: string, remotePoint: Point3) => Point3;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const rotateY = (point: Point3, yaw: number): Point3 => {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    x: (point.x * c) - (point.z * s),
    y: point.y,
    z: (point.x * s) + (point.z * c),
  };
};

export const normalizeArenaCalibration = (value: unknown): ArenaCalibration | null => {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const pointRaw = v.point;
  if (!pointRaw || typeof pointRaw !== 'object') return null;

  const pointObj = pointRaw as Record<string, unknown>;
  const x = pointObj.x;
  const y = pointObj.y;
  const z = pointObj.z;
  const yaw = v.yaw;
  const scaleRaw = v.scale;
  const timestampRaw = v.timestamp;
  const frameIdRaw = v.frameId;

  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z) || !isFiniteNumber(yaw)) {
    return null;
  }

  return {
    point: { x, y, z },
    yaw,
    scale: isFiniteNumber(scaleRaw) && scaleRaw > 0 ? scaleRaw : 1.0,
    timestamp: isFiniteNumber(timestampRaw) ? timestampRaw : Date.now(),
    frameId: typeof frameIdRaw === 'string' && frameIdRaw.trim().length > 0 ? frameIdRaw : 'room_v1',
  };
};

const computeMatchAlignmentReady = (
  hasRemotePeer: boolean,
  activeRemotePeerId: string | null,
  localCalibration: ArenaCalibration | null,
  remoteCalibrations: Record<string, ArenaCalibration>,
): boolean => {
  if (!hasRemotePeer) return true;
  if (!activeRemotePeerId || !localCalibration) return false;
  const remote = remoteCalibrations[activeRemotePeerId];
  if (!remote) return false;
  return localCalibration.frameId === remote.frameId;
};

export const useArenaSyncStore = create<ArenaSyncState>((set, get) => ({
  latestSample: null,
  localCalibration: null,
  remoteCalibrations: {},
  hasRemotePeer: false,
  activeRemotePeerId: null,
  matchAlignmentReady: true,

  setLatestSample: (sample) => {
    set({ latestSample: sample });
  },

  setLocalCalibration: (sample) => {
    set((state) => ({
      localCalibration: sample,
      matchAlignmentReady: computeMatchAlignmentReady(
        state.hasRemotePeer,
        state.activeRemotePeerId,
        sample,
        state.remoteCalibrations,
      ),
    }));
  },

  setRemoteCalibration: (userId, sample) => {
    if (!userId) return;
    set((state) => ({
      remoteCalibrations: {
        ...state.remoteCalibrations,
        [userId]: sample,
      },
      matchAlignmentReady: computeMatchAlignmentReady(
        state.hasRemotePeer,
        state.activeRemotePeerId,
        state.localCalibration,
        {
          ...state.remoteCalibrations,
          [userId]: sample,
        },
      ),
    }));
  },

  setPeerState: (remotePeerId) => {
    set((state) => {
      const hasRemotePeer = typeof remotePeerId === 'string' && remotePeerId.trim().length > 0;
      const activeRemotePeerId = hasRemotePeer ? remotePeerId : null;
      return {
        hasRemotePeer,
        activeRemotePeerId,
        matchAlignmentReady: computeMatchAlignmentReady(
          hasRemotePeer,
          activeRemotePeerId,
          state.localCalibration,
          state.remoteCalibrations,
        ),
      };
    });
  },

  clearCalibrations: () => {
    set((state) => ({
      latestSample: null,
      localCalibration: null,
      remoteCalibrations: {},
      matchAlignmentReady: computeMatchAlignmentReady(
        state.hasRemotePeer,
        state.activeRemotePeerId,
        null,
        {},
      ),
    }));
  },

  hasAlignment: (remoteUserId) => {
    const { localCalibration, remoteCalibrations } = get();
    if (!localCalibration) return false;
    const remote = remoteCalibrations[remoteUserId];
    if (!remote) return false;
    return localCalibration.frameId === remote.frameId;
  },

  mapRemotePosition: (remoteUserId, remotePoint) => {
    const { localCalibration, remoteCalibrations } = get();
    const remote = remoteCalibrations[remoteUserId];
    if (!localCalibration || !remote || localCalibration.frameId !== remote.frameId) {
      return {
        x: remotePoint.x,
        y: remotePoint.y,
        z: remotePoint.z,
      };
    }

    const scaleFactor = localCalibration.scale / remote.scale;
    const yawDelta = localCalibration.yaw - remote.yaw;

    const scaledRemotePoint: Point3 = {
      x: remotePoint.x * scaleFactor,
      y: remotePoint.y * scaleFactor,
      z: remotePoint.z * scaleFactor,
    };
    const scaledRemoteAnchor: Point3 = {
      x: remote.point.x * scaleFactor,
      y: remote.point.y * scaleFactor,
      z: remote.point.z * scaleFactor,
    };

    const rotatedPoint = rotateY(scaledRemotePoint, yawDelta);
    const rotatedAnchor = rotateY(scaledRemoteAnchor, yawDelta);

    return {
      x: rotatedPoint.x + (localCalibration.point.x - rotatedAnchor.x),
      y: rotatedPoint.y + (localCalibration.point.y - rotatedAnchor.y),
      z: rotatedPoint.z + (localCalibration.point.z - rotatedAnchor.z),
    };
  },
}));

import { useEffect } from 'react';
import { rtcService } from '../services/WebRTCDataChannelService';
import { wsService } from '../services/WebSocketService';
import { useArenaSyncStore } from '../store/useArenaSyncStore';
import { PLAYER_ID, PLAYER_LANG, ROOM_ID, SYNC_RATE } from '../utils/identity';
import type { AppPhase } from '../types/app';

type UseArenaRealtimeChannelsArgs = {
  appPhase: AppPhase;
  wsUrl: string;
};

export const useArenaRealtimeChannels = ({
  appPhase,
  wsUrl,
}: UseArenaRealtimeChannelsArgs) => {
  useEffect(() => {
    useArenaSyncStore.getState().clearCalibrations();
  }, []);

  useEffect(() => {
    if (appPhase !== 'main') return;
    const timer = window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        wsService.connect(wsUrl, PLAYER_ID, ROOM_ID, PLAYER_LANG, SYNC_RATE);
        rtcService.start(PLAYER_ID);
      });
    }, 120);

    return () => {
      clearTimeout(timer);
      rtcService.stop();
      wsService.disconnect();
    };
  }, [appPhase, wsUrl]);

  useEffect(() => {
    const syncPeer = () => {
      useArenaSyncStore.getState().setPeerState(rtcService.getRemotePeerId());
    };
    const onPeerState = (event: Event) => {
      const detail = (event as CustomEvent<{ remoteId: string | null }>).detail;
      useArenaSyncStore.getState().setPeerState(detail?.remoteId ?? null);
    };

    syncPeer();
    window.addEventListener('webrtc_peer_state', onPeerState as EventListener);
    return () => {
      window.removeEventListener('webrtc_peer_state', onPeerState as EventListener);
    };
  }, []);
};

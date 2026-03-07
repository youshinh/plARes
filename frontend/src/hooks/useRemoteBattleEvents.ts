import { useEffect } from 'react';
import type React from 'react';
import { geminiLiveService } from '../services/GeminiLiveService';
import { wsService } from '../services/WebSocketService';
import { useFSMStore } from '../store/useFSMStore';
import { normalizeArenaCalibration, useArenaSyncStore } from '../store/useArenaSyncStore';
import { PLAYER_ID, PLAYER_LANG, SYNC_RATE } from '../utils/identity';
import { evolveCharacterDNAByMatchCount, normalizeCharacterDNA } from '../utils/characterDNA';
import { localizeBattleEvent } from '../utils/localizeEvent';
import { showSubtitle } from '../utils/uiEvents';
import type { GameEvent, WebRTCDataChannelPayload } from '../../../shared/types/events';
import type { CharacterDNA } from '../../../shared/types/firestore';
import type { BattleUiState, LiveDebugInfo, ProfileInfo, UiText } from '../types/app';
import type { FusionCraftFlowState } from '../types/app';

type UseRemoteBattleEventsArgs = {
  battleStateRef: React.MutableRefObject<BattleUiState>;
  pendingLiveConnectRef: React.MutableRefObject<boolean>;
  robotDna: CharacterDNA;
  robotMaterial: 'Wood' | 'Metal' | 'Resin';
  setBattleState: React.Dispatch<React.SetStateAction<BattleUiState>>;
  setRecentABFeedbackCount: React.Dispatch<React.SetStateAction<number>>;
  setProfileInfo: React.Dispatch<React.SetStateAction<ProfileInfo | null>>;
  setSpecialPhrase: React.Dispatch<React.SetStateAction<string>>;
  setBgmUrl: React.Dispatch<React.SetStateAction<string>>;
  setIsMatchPaused: React.Dispatch<React.SetStateAction<boolean>>;
  setLiveDebugInfo: React.Dispatch<React.SetStateAction<LiveDebugInfo>>;
  setFusionCraftFlow: React.Dispatch<React.SetStateAction<FusionCraftFlowState>>;
  setRobotDna: (dna: CharacterDNA | null | undefined) => void;
  setRobotStats: (
    stats: { power: number; speed: number; vit: number },
    meta: { name: string; material: 'Wood' | 'Metal' | 'Resin'; tone: string },
  ) => void;
  saveTranslations: (langCode: string, dict: Record<string, string>) => void;
  t: UiText;
};

const toFiniteNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPositiveNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const clampHp = (value: number, maxHp: number): number =>
  Math.max(0, Math.min(value, maxHp));

export const useRemoteBattleEvents = ({
  battleStateRef,
  pendingLiveConnectRef,
  robotDna,
  robotMaterial,
  setBattleState,
  setRecentABFeedbackCount,
  setProfileInfo,
  setSpecialPhrase,
  setBgmUrl,
  setIsMatchPaused,
  setLiveDebugInfo,
  setFusionCraftFlow,
  setRobotDna,
  setRobotStats,
  saveTranslations,
  t,
}: UseRemoteBattleEventsArgs) => {
  useEffect(() => {
    const commitBattleState = (nextState: BattleUiState) => {
      battleStateRef.current = nextState;
      setBattleState(nextState);
    };

    const handleRemoteBattleEvent = (event: GameEvent) => {
      const payload = (event as any)?.payload;
      const target = (event as any)?.target as string | undefined;
      if (Array.isArray(payload)) return;

      if (event.event === 'hit_confirmed' && event.user !== PLAYER_ID) {
        const damage = Number((payload as any)?.damage ?? 0);
        if (damage > 0) {
          useFSMStore.getState().takeDamage('local', damage);
        }
        return;
      }

      if (payload && typeof payload === 'object') {
        if (payload.kind === 'arena_calibration') {
          const sender = String((event as any)?.user ?? '');
          if (!sender || sender === PLAYER_ID) return;
          const calibration = normalizeArenaCalibration((payload as any).calibration);
          if (!calibration) return;
          const arenaSync = useArenaSyncStore.getState();
          arenaSync.setRemoteCalibration(sender, calibration);
          const readyWithSender = useArenaSyncStore.getState().hasAlignment(sender);
          showSubtitle(readyWithSender ? t.alignReady : t.alignPeerSynced);
          return;
        }
        if (payload.kind === 'profile_sync' && payload.profile && (!target || target === PLAYER_ID)) {
          console.groupCollapsed('[App] Profile Sync Received');
          console.dir(payload.profile);
          console.groupEnd();
          const profile = payload.profile as any;
          const logsRaw = Array.isArray(profile.recent_match_logs) ? profile.recent_match_logs : [];
          const totalMatches = Number(profile.total_matches ?? 0);
          const recentLogs = logsRaw.map((log: any) => ({
            timestamp: String(log.timestamp ?? ''),
            roomId: String(log.room_id ?? ''),
            result: String(log.result ?? 'DRAW'),
            criticalHits: Number(log.critical_hits ?? 0),
            misses: Number(log.misses ?? 0),
          }));
          const candidateDna =
            normalizeCharacterDNA(profile.character_dna) ??
            normalizeCharacterDNA(profile.characterDna);
          if (candidateDna) {
            setRobotDna(evolveCharacterDNAByMatchCount(candidateDna, totalMatches));
          }
          const stats = profile.robot_stats;
          if (stats && typeof stats === 'object') {
            const rawMaterial = String(profile.robot_material ?? robotMaterial);
            const material = rawMaterial === 'Metal' || rawMaterial === 'Resin' ? rawMaterial : 'Wood';
            setRobotStats(
              {
                power: Number((stats as any).power ?? 40),
                speed: Number((stats as any).speed ?? 40),
                vit: Number((stats as any).vit ?? 40),
              },
              {
                name: String(profile.player_name ?? 'plARes Unit'),
                material,
                tone: String(profile.tone ?? 'balanced'),
              },
            );
          }
          const recentAb = Array.isArray(profile.recent_dna_ab_tests) ? profile.recent_dna_ab_tests : [];
          setRecentABFeedbackCount(recentAb.length);
          setProfileInfo({
            totalMatches,
            totalTrainingSessions: Number(profile.total_training_sessions ?? 0),
            totalWalkSessions: Number(profile.total_walk_sessions ?? 0),
            tone: String(profile.tone ?? 'balanced'),
            syncRate: Number(profile.sync_rate ?? 0.5),
            storageBackend: String(profile.storage_backend ?? 'local'),
            memorySummary: String(profile.ai_memory_summary ?? ''),
            recentLogs,
          });
          return;
        }
        if (payload.kind === 'milestone_notice' && (!target || target === PLAYER_ID)) {
          const total = Number(payload.total_matches ?? 0);
          setRobotDna(evolveCharacterDNAByMatchCount(robotDna, total));
          showSubtitle(`Milestone reached: ${total} matches`);
          return;
        }
        if (payload.kind === 'dna_ab_feedback_saved' && (!target || target === PLAYER_ID)) {
          setRecentABFeedbackCount((count) => Math.max(count, Number(payload.total ?? count)));
          return;
        }
        if (payload.kind === 'battle_status' && (!target || target === PLAYER_ID)) {
          const prev = battleStateRef.current;
          const maxHp = toPositiveNumber(payload.max_hp, prev.maxHp);
          const opponentMaxHp = toPositiveNumber(payload.opponent_max_hp, prev.opponentMaxHp);
          const hpAfter = clampHp(toFiniteNumber(payload.hp, prev.hp), maxHp);
          const opponentHpAfter = clampHp(toFiniteNumber(payload.opponent_hp, prev.opponentHp), opponentMaxHp);
          const nextState: BattleUiState = {
            ...prev,
            hp: hpAfter,
            maxHp,
            opponentHp: opponentHpAfter,
            opponentMaxHp,
            exGauge: toFiniteNumber(payload.ex_gauge, prev.exGauge),
            specialReady: Boolean(payload.special_ready ?? prev.specialReady),
            heatActive: Boolean(payload.heat_active ?? prev.heatActive),
          };
          useFSMStore.getState().syncHp('local', hpAfter);
          useFSMStore.getState().syncHp('enemy', opponentHpAfter);
          commitBattleState(nextState);
          return;
        }
        if (payload.kind === 'ex_gauge_update' && (!target || target === PLAYER_ID)) {
          const prev = battleStateRef.current;
          const maxHp = toPositiveNumber(payload.max_hp, prev.maxHp);
          const opponentMaxHp = toPositiveNumber(payload.opponent_max_hp, prev.opponentMaxHp);
          const hpAfter = clampHp(toFiniteNumber(payload.hp, prev.hp), maxHp);
          const opponentHpAfter = clampHp(toFiniteNumber(payload.opponent_hp, prev.opponentHp), opponentMaxHp);
          const nextState: BattleUiState = {
            ...prev,
            exGauge: toFiniteNumber(payload.value, prev.exGauge),
            specialReady: Boolean(payload.special_ready ?? prev.specialReady),
            hp: hpAfter,
            opponentHp: opponentHpAfter,
            maxHp,
            opponentMaxHp,
            heatActive: Boolean(payload.heat_active ?? prev.heatActive),
          };
          useFSMStore.getState().syncHp('local', hpAfter);
          useFSMStore.getState().syncHp('enemy', opponentHpAfter);
          commitBattleState(nextState);
          return;
        }
        if (payload.kind === 'special_ready' && (!target || target === PLAYER_ID)) {
          const text = String(payload.text ?? '');
          if (text) setSpecialPhrase(text);
          setBattleState(prev => ({
            ...prev,
            exGauge: Number(payload.ex_gauge ?? 100),
            specialReady: true,
          }));
          showSubtitle(text || 'Special ready!');
          return;
        }
        if (payload.kind === 'special_not_ready' && (!target || target === PLAYER_ID)) {
          showSubtitle(String(payload.message ?? 'EX gauge is not full'));
          return;
        }
        if (payload.kind === 'damage_applied') {
          const victim = String(payload.target ?? '');
          const hpAfter = toFiniteNumber(payload.hp_after, 0);
          if (victim === PLAYER_ID) {
            useFSMStore.getState().syncHp('local', hpAfter);
            setBattleState(prev => {
              const maxHp = toPositiveNumber(payload.max_hp, prev.maxHp);
              return { ...prev, hp: clampHp(hpAfter, maxHp), maxHp };
            });
          } else {
            useFSMStore.getState().syncHp('enemy', hpAfter);
            setBattleState(prev => {
              const opponentMaxHp = toPositiveNumber(payload.max_hp, prev.opponentMaxHp);
              return { ...prev, opponentHp: clampHp(hpAfter, opponentMaxHp), opponentMaxHp };
            });
          }
          return;
        }
        if (payload.kind === 'heat_state' && (!target || target === PLAYER_ID)) {
          const prev = battleStateRef.current;
          const maxHp = toPositiveNumber(payload.max_hp, prev.maxHp);
          const hpAfter = clampHp(toFiniteNumber(payload.hp, prev.hp), maxHp);
          const nextState: BattleUiState = {
            ...prev,
            heatActive: Boolean(payload.active ?? prev.heatActive),
            hp: hpAfter,
            maxHp,
          };
          useFSMStore.getState().syncHp('local', hpAfter);
          commitBattleState(nextState);
          return;
        }
        if (payload.kind === 'down_state') {
          const victim = String(payload.target ?? '');
          if (victim === PLAYER_ID) {
            showSubtitle('DOWN! 体勢を立て直せ！');
          }
          return;
        }
        if (payload.kind === 'incantation_prompt' && typeof payload.text === 'string') {
          if (target && target !== PLAYER_ID) return;
          setSpecialPhrase(payload.text);
          showSubtitle(payload.text);
          return;
        }
        if (payload.kind === 'persona_tone' && typeof payload.message === 'string') {
          if (target && target !== PLAYER_ID) return;
          setProfileInfo(prev => ({
            totalMatches: prev?.totalMatches ?? 0,
            totalTrainingSessions: prev?.totalTrainingSessions ?? 0,
            totalWalkSessions: prev?.totalWalkSessions ?? 0,
            tone: String(payload.tone ?? prev?.tone ?? 'balanced'),
            syncRate: prev?.syncRate ?? SYNC_RATE,
            storageBackend: prev?.storageBackend ?? 'local',
            memorySummary: prev?.memorySummary ?? '',
            recentLogs: prev?.recentLogs ?? [],
          }));
          showSubtitle(payload.message);
          return;
        }
        if (payload.kind === 'proactive_line') {
          if (target && target !== PLAYER_ID) return;
          const line = String(payload.text ?? '').trim();
          if (line) {
            showSubtitle(line);
          }
          const action = String(payload.action ?? '');
          if (action === 'glow_eyes') {
            showSubtitle('Eye glow activated');
          }
          return;
        }
        if (payload.kind === 'reject_item') {
          const reason = String(payload.reason ?? 'not_my_style');
          const count = Number(payload.reject_count ?? 0);
          useFSMStore.getState().setRejectItem();
          showSubtitle(`Item rejected (${reason}) x${count}`);
          return;
        }
        if (payload.kind === 'bgm_ready') {
          const url = String(payload.url ?? '');
          if (url) {
            setBgmUrl(url);
            showSubtitle('Victory BGM ready');
          }
          return;
        }
        if (payload.kind === 'fused_item') {
          const concept = typeof payload.concept === 'string' ? payload.concept : 'fused item';
          const action = typeof payload.action === 'string' ? payload.action : '';
          const url = typeof payload.texture_url === 'string' ? payload.texture_url : '';
          const requestId = typeof payload.request_id === 'string' ? payload.request_id : '';

          if (action === 'equip' && url) {
            const currentDna = useFSMStore.getState().robotDna;
            setRobotDna({ ...currentDna, skinUrl: url });
            showSubtitle(`Equipped Fusion Drop: ${concept}`);
          } else {
            showSubtitle(`Fusion Drop: ${concept}`);
          }
          setFusionCraftFlow(prev => (
                !requestId || !prev.requestId || prev.requestId === requestId
              ? {
                  status: 'success',
                  requestId,
                  concept,
                  message: `${t.fusionSuccess}: ${concept}`,
                  textureUrl: url,
                }
              : prev
          ));
          return;
        }
        if (payload.kind === 'intervention_rejected') {
          const message = String(payload.message ?? 'Intervention rejected');
          const requestId = typeof payload.request_id === 'string' ? payload.request_id : '';
          showSubtitle(message);
          setFusionCraftFlow(prev => (
            !requestId || !prev.requestId || prev.requestId === requestId
              ? {
                  status: 'error',
                  requestId,
                  concept: prev.concept,
                  message,
                  textureUrl: '',
                }
              : prev
          ));
          return;
        }
        if (payload.kind === 'fused_item_error') {
          const message = String(payload.message ?? payload.error ?? 'Fusion failed');
          const requestId = typeof payload.request_id === 'string' ? payload.request_id : '';
          showSubtitle(message);
          setFusionCraftFlow(prev => (
            !requestId || !prev.requestId || prev.requestId === requestId
              ? {
                  status: 'error',
                  requestId,
                  concept: prev.concept,
                  message,
                  textureUrl: '',
                }
              : prev
          ));
          return;
        }
        if (payload.kind === 'ui_translations' && (!target || target === PLAYER_ID)) {
          const langCode = String(payload.lang ?? '');
          const dictionary = payload.translations;
          if (langCode && dictionary && typeof dictionary === 'object') {
            saveTranslations(langCode, dictionary as Record<string, string>);
            window.location.reload();
          }
          return;
        }
        if (payload.kind === 'match_pause') {
          setIsMatchPaused(true);
          showSubtitle(String(payload.message ?? 'Match paused (connection issue)'));
          return;
        }
        if (payload.kind === 'match_resumed') {
          setIsMatchPaused(false);
          showSubtitle(String(payload.message ?? 'Match resumed'));
          return;
        }
        if (payload.kind === 'state_correction') {
          showSubtitle(String(payload.message ?? 'State corrected by server'));
          return;
        }
        if (payload.kind === 'live_ephemeral_token' && (!target || target === PLAYER_ID)) {
          if (payload.ok) {
            setLiveDebugInfo(prev => ({
              ...prev,
              tokenName: String(payload.token_name ?? prev.tokenName ?? ''),
              lastStatus: `live_token_ready:${String(payload.model ?? 'model')}`,
              degradedReason: '',
            }));
            showSubtitle(`Live token ready (${String(payload.model ?? 'model')})`);
            if (pendingLiveConnectRef.current) {
              pendingLiveConnectRef.current = false;
              const tokenName = String(payload.token_name ?? '');
              if (tokenName) {
                const robotTone = String(useFSMStore.getState().robotMeta.tone ?? 'balanced');
                const systemInstruction =
                  `You are an AR battle robot companion. Language: ${PLAYER_LANG}. ` +
                  `Persona tone: ${robotTone}. ` +
                  'Speak naturally in short phrases. Stay in character.';
                geminiLiveService.connect({
                  tokenName,
                  model: String(payload.model ?? 'gemini-2.5-flash-native-audio-preview-12-2025'),
                  systemInstruction,
                }).catch(() => {});
              }
            }
          } else {
            pendingLiveConnectRef.current = false;
            const message = `Token error: ${String(payload.error ?? 'unknown')}`;
            setLiveDebugInfo(prev => ({
              ...prev,
              lastStatus: 'live_token_error',
              degradedReason: String(payload.detail ?? message),
            }));
            showSubtitle(message);
          }
          return;
        }
        if (payload.kind === 'interaction_response' && (!target || target === PLAYER_ID)) {
          if (payload.ok) {
            const text = String(payload.text ?? '');
            setLiveDebugInfo(prev => ({
              ...prev,
              interactionId: String(payload.interaction_id ?? prev.interactionId ?? ''),
              interactionText: text,
              lastStatus: 'interaction_response_ok',
              degradedReason: '',
            }));
            if (text) {
              showSubtitle(text);
            }
          } else {
            const message = `Interaction error: ${String(payload.error ?? 'unknown')}`;
            setLiveDebugInfo(prev => ({
              ...prev,
              lastStatus: 'interaction_error',
              degradedReason: String(payload.detail ?? message),
            }));
            showSubtitle(message);
          }
          return;
        }
        if (payload.kind === 'adk_status' && (!target || target === PLAYER_ID)) {
          const available = Boolean(payload.available);
          const detail = String(payload.detail ?? '');
          setLiveDebugInfo(prev => ({
            ...prev,
            adkStatus: available ? 'available' : `unavailable${detail ? `: ${detail}` : ''}`,
            lastStatus: available ? 'adk_status_ok' : 'adk_status_unavailable',
            degradedReason: available ? prev.degradedReason : (detail || prev.degradedReason),
          }));
          return;
        }
      }

      if (event.event === 'winner_interview' && payload && typeof payload === 'object') {
        const text = (payload as any).text;
        if (typeof text === 'string' && text.trim()) {
          showSubtitle(text);
        }
        return;
      }
      if (event.event === 'proactive_line' && payload && typeof payload === 'object') {
        const text = String((payload as any).text ?? '').trim();
        if (text) {
          showSubtitle(text);
        }
        return;
      }
      if (event.event === 'bgm_ready' && payload && typeof payload === 'object') {
        const url = String((payload as any).url ?? '');
        if (url) {
          setBgmUrl(url);
          showSubtitle('Victory BGM ready');
        }
        return;
      }
      if (event.event === 'disconnect_tko' && payload && typeof payload === 'object') {
        setIsMatchPaused(true);
        const loser = String((payload as any).loser ?? 'unknown');
        showSubtitle(`Connection TKO: ${loser}`);
        return;
      }

      if (!event?.event || event.user === PLAYER_ID) return;
      showSubtitle(localizeBattleEvent(event.event, event.user));
    };

    const unsubscribe = wsService.addHandler((payload: WebRTCDataChannelPayload) => {
      if (payload.type !== 'event') return;
      handleRemoteBattleEvent(payload.data as GameEvent);
    });

    const onP2PPayload = (event: Event) => {
      const payload = (event as CustomEvent<WebRTCDataChannelPayload>).detail;
      if (payload?.type !== 'event') return;
      handleRemoteBattleEvent(payload.data as GameEvent);
    };

    window.addEventListener('webrtc_payload', onP2PPayload as EventListener);

    return () => {
      unsubscribe();
      window.removeEventListener('webrtc_payload', onP2PPayload as EventListener);
    };
  }, [
    battleStateRef,
    pendingLiveConnectRef,
    robotDna,
    robotMaterial,
    saveTranslations,
    setBattleState,
    setBgmUrl,
    setIsMatchPaused,
    setLiveDebugInfo,
    setProfileInfo,
    setRecentABFeedbackCount,
    setRobotDna,
    setRobotStats,
    setSpecialPhrase,
    t,
  ]);
};

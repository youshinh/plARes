import type { EventType } from '../../../shared/types/events';
import { PLAYER_LANG } from './identity';

const lang = (PLAYER_LANG || navigator.language || 'en').toLowerCase();

const isJa = lang.startsWith('ja');
const isEs = lang.startsWith('es');

export const localizeBattleEvent = (event: EventType, actor: string): string => {
  if (isJa) {
    if (event === 'critical_hit') return `${actor} が CRITICAL HIT!`;
    if (event === 'debuff_applied') return `${actor} の必殺技は失敗...`;
    if (event === 'buff_applied') return `${actor} が戦術を切り替えた`;
    if (event === 'milestone_reached') return `${actor} がマイルストーン到達`;
    return `${actor} のアクション`;
  }
  if (isEs) {
    if (event === 'critical_hit') return `${actor} conecta un GOLPE CRITICO!`;
    if (event === 'debuff_applied') return `La tecnica especial de ${actor} fallo...`;
    if (event === 'buff_applied') return `${actor} cambia de tactica`;
    if (event === 'milestone_reached') return `${actor} alcanzo un hito`;
    return `Accion de ${actor}`;
  }
  if (event === 'critical_hit') return `${actor} landed a CRITICAL HIT!`;
  if (event === 'debuff_applied') return `${actor} missed the special move...`;
  if (event === 'buff_applied') return `${actor} switched tactics`;
  if (event === 'milestone_reached') return `${actor} reached a milestone`;
  return `${actor} triggered an action`;
};

export const localizeCastStart = (incantation?: string): string => {
  if (isJa) return incantation ? `詠唱開始... ${incantation}！！` : '詠唱開始... 超絶熱々揚げ春巻きストライク！！';
  if (isEs) return incantation ? `Comienza el canto... ${incantation}!` : 'Comienza el canto... Golpe Supremo!';
  return incantation ? `Chant started... ${incantation}!` : 'Chant started... Ultimate strike!';
};

export const localizeResult = (verdict: 'critical' | 'miss'): string => {
  if (isJa) return verdict === 'critical' ? 'CRITICAL HIT!!' : 'MISS...';
  if (isEs) return verdict === 'critical' ? 'GOLPE CRITICO!!' : 'FALLO...';
  return verdict === 'critical' ? 'CRITICAL HIT!!' : 'MISS...';
};

export const localizeTimeout = (): string => {
  if (isJa) return '判定タイムアウト: MISS';
  if (isEs) return 'Tiempo de espera agotado: FALLO';
  return 'Judgement timeout: MISS';
};

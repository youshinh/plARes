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
    if (event === 'match_paused') return `接続不安定のため一時停止`;
    if (event === 'match_resumed') return `接続復帰、試合再開`;
    if (event === 'disconnect_tko') return `切断によりTKO決着`;
    if (event === 'state_correction') return `同期補正を適用`;
    if (event === 'special_ready') return `必殺技が解放された`;
    if (event === 'damage_applied') return `${actor} の攻撃が命中`;
    if (event === 'down_state') return `ダウンが発生`;
    if (event === 'heat_state') return `ヒート状態が切り替わった`;
    return `${actor} のアクション`;
  }
  if (isEs) {
    if (event === 'critical_hit') return `${actor} conecta un GOLPE CRITICO!`;
    if (event === 'debuff_applied') return `La tecnica especial de ${actor} fallo...`;
    if (event === 'buff_applied') return `${actor} cambia de tactica`;
    if (event === 'milestone_reached') return `${actor} alcanzo un hito`;
    if (event === 'match_paused') return `Partida en pausa por conexion`;
    if (event === 'match_resumed') return `Conexion recuperada, partida reanudada`;
    if (event === 'disconnect_tko') return `TKO por desconexion`;
    if (event === 'state_correction') return `Correccion de sincronizacion aplicada`;
    if (event === 'special_ready') return `Tecnica especial lista`;
    if (event === 'damage_applied') return `Ataque conectado`;
    if (event === 'down_state') return `Se produjo derribo`;
    if (event === 'heat_state') return `Estado de calor actualizado`;
    return `Accion de ${actor}`;
  }
  if (event === 'critical_hit') return `${actor} landed a CRITICAL HIT!`;
  if (event === 'debuff_applied') return `${actor} missed the special move...`;
  if (event === 'buff_applied') return `${actor} switched tactics`;
  if (event === 'milestone_reached') return `${actor} reached a milestone`;
  if (event === 'match_paused') return 'Match paused due to connection issue';
  if (event === 'match_resumed') return 'Connection restored, match resumed';
  if (event === 'disconnect_tko') return 'Connection TKO';
  if (event === 'state_correction') return 'Server applied state correction';
  if (event === 'special_ready') return 'Special move is ready';
  if (event === 'damage_applied') return `${actor} landed a hit`;
  if (event === 'down_state') return 'Down state triggered';
  if (event === 'heat_state') return 'Heat state changed';
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

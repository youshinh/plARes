export type BattleMaterial = "Wood" | "Metal" | "Resin";

export const MATERIAL_DAMAGE_MULTIPLIER: Record<BattleMaterial, Record<BattleMaterial, number>> = {
  Wood: { Wood: 1.0, Metal: 0.8, Resin: 1.3 },
  Metal: { Wood: 1.3, Metal: 1.0, Resin: 0.8 },
  Resin: { Wood: 0.8, Metal: 1.3, Resin: 1.0 },
};

export const EX_GAUGE = {
  MAX: 100,
  INITIAL: 0,
  ON_HIT_DEALT: 8,
  ON_CRITICAL_HIT_DEALT: 16,
  ON_HIT_RECEIVED: 12,
  PER_SECOND: 1,
} as const;

export const calcMaxHP = (vit: number): number => 100 + Math.max(1, Math.floor(vit)) * 2;

export const calcDamage = (
  attackerPower: number,
  attackerMaterial: BattleMaterial,
  defenderMaterial: BattleMaterial,
  isCritical = false,
): number => {
  const base = 10 + Math.max(1, attackerPower) * 0.3;
  const multiplier = MATERIAL_DAMAGE_MULTIPLIER[attackerMaterial][defenderMaterial] ?? 1.0;
  return Math.max(1, Math.floor(base * multiplier * (isCritical ? 2.0 : 1.0)));
};

export const calcDownChance = (vit: number): number =>
  Math.max(0, 0.5 - Math.max(1, vit) / 200);

export const isHeatActivated = (selfHP: number, maxHP: number, opponentHP: number): boolean => {
  if (maxHP <= 0) return false;
  return selfHP / maxHP <= 0.2 && (opponentHP - selfHP) > maxHP * 0.3;
};

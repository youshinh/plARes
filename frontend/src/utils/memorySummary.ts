import type { UiText } from '../types/app';

type MemoryView = {
  headline: string;
  entries: string[];
};

const TRAINING_RE =
  /training#[^:]+:\s*sync\s*([0-9.]+)->([0-9.]+),\s*acc=([0-9.]+),\s*spd=([0-9.]+),\s*pas=([0-9.]+)/i;
const WALK_RE =
  /walk#[^:]+:\s*sync\s*([0-9.]+)->([0-9.]+),\s*items=([0-9]+),\s*reflections=([0-9]+)/i;
const MATCH_RE =
  /([A-Z]+):\s*critical=([0-9]+),\s*miss=([0-9]+).*highlights=([0-9]+)/i;
const PROACTIVE_RE = /proactive\(([^)]+)\):\s*(.+)$/i;
const TONE_RE = /persona_shift:\s*([a-z_ -]+)/i;

const looksGarbled = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return true;
  const hexEscapes = (trimmed.match(/\\x[0-9a-f]{2}/gi) ?? []).length;
  const weirdRuns = (trimmed.match(/[^\p{L}\p{N}\p{P}\p{Z}\n\r\t]/gu) ?? []).length;
  if (hexEscapes >= 3) return true;
  if (weirdRuns > 6) return true;
  if (/model STOP|application\/jso|TEXT \|/i.test(trimmed)) return true;
  return false;
};

const pct = (value: string) => Math.round(Number(value) * 100);

export const buildReadableMemoryView = (rawSummary: string, t: UiText): MemoryView => {
  const lines = String(rawSummary || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !looksGarbled(line));

  const entries: string[] = [];

  for (const line of lines) {
    const training = line.match(TRAINING_RE);
    if (training) {
      entries.push(
        `${t.memoryTrainingLabel}: ${t.sync} ${training[1]}→${training[2]} / ${t.memoryAccuracyLabel} ${pct(training[3])} / ${t.memorySpeedLabel} ${pct(training[4])} / ${t.memoryPassionLabel} ${pct(training[5])}`,
      );
      continue;
    }

    const walk = line.match(WALK_RE);
    if (walk) {
      entries.push(
        `${t.memoryWalkLabel}: ${t.sync} ${walk[1]}→${walk[2]} / ${t.memoryItemsLabel} ${walk[3]} / ${t.memoryReflectionLabel} ${walk[4]}`,
      );
      continue;
    }

    const match = line.match(MATCH_RE);
    if (match) {
      entries.push(
        `${t.memoryMatchLabel}: ${match[1]} / ${t.memoryCriticalLabel} ${match[2]} / ${t.memoryMissLabel} ${match[3]} / ${t.memoryHighlightsLabel} ${match[4]}`,
      );
      continue;
    }

    const proactive = line.match(PROACTIVE_RE);
    if (proactive) {
      entries.push(`${t.memoryInsightLabel}: ${proactive[2]}`);
      continue;
    }

    const tone = line.match(TONE_RE);
    if (tone) {
      entries.push(`${t.memoryToneShiftLabel}: ${tone[1]}`);
      continue;
    }

    if (line.length >= 8) {
      entries.push(line);
    }
  }

  const uniqueEntries = Array.from(new Set(entries)).slice(-4).reverse();
  return {
    headline: uniqueEntries[0] ?? t.memoryUnreadable,
    entries: uniqueEntries,
  };
};

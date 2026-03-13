/**
 * Sanitise subtitle text before displaying it.
 *
 * The backend sometimes prepends ISO‑8601 timestamps
 * (e.g. "2026-03-07 23:01:41+00:00") and appends status /
 * debug tokens like "completed", "text", "model interaction".
 * Strip them so the user only sees the meaningful instruction.
 */
const sanitize = (raw: string): string => {
  let text = raw;

  // 1. Remove leading ISO‑8601 timestamp  (2026-03-07 23:01:41+00:00)
  text = text.replace(
    /^\s*\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:?\d{2}|Z)?\s*/,
    '',
  );

  // 2. Remove leading status token  ("completed ", "failed ", "pending ")
  text = text.replace(/^(completed|failed|pending|running|in_progress)\s+/i, '');

  // 3. Remove trailing metadata tokens ("text model interaction", "audio model interaction", etc.)
  text = text.replace(/\s+(text|audio|video)\s+model\s+interaction\s*$/i, '');

  return text.trim();
};

export const showSubtitle = (text: string) => {
  const clean = sanitize(text);
  if (!clean) return;              // don't flash empty subtitles
  window.dispatchEvent(new CustomEvent('show_subtitle', { detail: { text: clean } }));
};

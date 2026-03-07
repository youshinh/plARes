export type UiLang = 'ja' | 'en' | 'es';

export type LanguagePreset = {
  code: string;
  label: string;
};

type TranslationCacheEnvelope = {
  schemaVersion: number;
  locale: string;
  translations: Record<string, string>;
  savedAt: string;
};

const STORAGE_TRANSLATED_PREFIX = 'plares_ui_trans_';
const STORAGE_RECENT_LOCALES_KEY = 'plares_recent_locales';
const TRANSLATION_SCHEMA_VERSION = 2;

export const COMMON_LANGUAGE_PRESETS: LanguagePreset[] = [
  { code: 'ja-JP', label: '日本語' },
  { code: 'en-US', label: 'English' },
  { code: 'es-ES', label: 'Español' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'ko-KR', label: '한국어' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'it-IT', label: 'Italiano' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'ar', label: 'العربية' },
  { code: 'th-TH', label: 'ไทย' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'id-ID', label: 'Bahasa Indonesia' },
  { code: 'vi-VN', label: 'Tiếng Việt' },
  { code: 'ru-RU', label: 'Русский' },
];

const BUILTIN_LANG_MAP: Record<string, UiLang> = {
  ja: 'ja',
  es: 'es',
};

export const canonicalizeLocale = (raw: string | null | undefined, fallback = 'en-US'): string => {
  const candidate = String(raw ?? '').trim();
  if (!candidate) return fallback;
  try {
    const [canonical] = Intl.getCanonicalLocales(candidate);
    return canonical || fallback;
  } catch {
    return fallback;
  }
};

export const resolveBaseUiLang = (rawLocale: string): UiLang => {
  const prefix = canonicalizeLocale(rawLocale).slice(0, 2).toLowerCase();
  return BUILTIN_LANG_MAP[prefix] ?? 'en';
};

export const inferLocaleLabel = (locale: string): string => {
  const canonical = canonicalizeLocale(locale);
  const preset = COMMON_LANGUAGE_PRESETS.find(option => option.code === canonical);
  if (preset) return preset.label;

  try {
    const displayNames = new Intl.DisplayNames([canonical], { type: 'language' });
    const languageCode = canonical.split('-')[0] ?? canonical;
    const translated = displayNames.of(languageCode);
    if (translated) return translated;
  } catch {
    // ignore and fall through
  }

  return canonical;
};

export const mergeLanguagePresets = (activeLocale: string): LanguagePreset[] => {
  const canonical = canonicalizeLocale(activeLocale);
  const options = new Map<string, LanguagePreset>();

  for (const preset of COMMON_LANGUAGE_PRESETS) {
    options.set(preset.code, preset);
  }

  if (!options.has(canonical)) {
    options.set(canonical, { code: canonical, label: inferLocaleLabel(canonical) });
  }

  for (const recentLocale of loadRecentLocales()) {
    if (!options.has(recentLocale)) {
      options.set(recentLocale, { code: recentLocale, label: inferLocaleLabel(recentLocale) });
    }
  }

  return [...options.values()];
};

export const loadRecentLocales = (): string[] => {
  try {
    const raw = localStorage.getItem(STORAGE_RECENT_LOCALES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value) => canonicalizeLocale(String(value)))
      .filter(Boolean)
      .slice(0, 8);
  } catch {
    return [];
  }
};

export const rememberRecentLocale = (locale: string): void => {
  try {
    const canonical = canonicalizeLocale(locale);
    const next = [canonical, ...loadRecentLocales().filter((value) => value !== canonical)].slice(0, 8);
    localStorage.setItem(STORAGE_RECENT_LOCALES_KEY, JSON.stringify(next));
  } catch {
    // best effort
  }
};

export const loadCachedTranslations = (locale: string): Record<string, string> | null => {
  try {
    const raw = localStorage.getItem(STORAGE_TRANSLATED_PREFIX + canonicalizeLocale(locale));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TranslationCacheEnvelope | Record<string, string>;

    if ('translations' in parsed && 'schemaVersion' in parsed) {
      if (parsed.schemaVersion !== TRANSLATION_SCHEMA_VERSION) {
        return null;
      }
      return typeof parsed.translations === 'object' && parsed.translations !== null
        ? parsed.translations
        : null;
    }

    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, string> : null;
  } catch {
    return null;
  }
};

export const saveCachedTranslations = (locale: string, dict: Record<string, string>): void => {
  try {
    const canonical = canonicalizeLocale(locale);
    const payload: TranslationCacheEnvelope = {
      schemaVersion: TRANSLATION_SCHEMA_VERSION,
      locale: canonical,
      translations: dict,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_TRANSLATED_PREFIX + canonical, JSON.stringify(payload));
  } catch {
    // local cache is best-effort only
  }
};

export const localeUsesBuiltinDictionary = (locale: string): boolean => {
  const prefix = canonicalizeLocale(locale).slice(0, 2).toLowerCase();
  return prefix === 'ja' || prefix === 'en' || prefix === 'es';
};

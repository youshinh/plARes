import { useEffect, useState, type FC } from 'react';
import { FaceScanner } from '../FaceScanner';
import { canonicalizeLocale, inferLocaleLabel, type LanguagePreset } from '../../i18n/runtime';
import type { AppPhase, UiText } from '../../types/app';

export type AppEntryScreensProps = {
  appPhase: AppPhase;
  t: UiText;
  languagePresets: LanguagePreset[];
  selectedLanguage: string;
  onApplyLanguage: (langCode: string) => void;
  onGenerateCharacter: (faceImageBase64?: string, presetText?: string) => Promise<void>;
  isGenerating: boolean;
  arSupportState: 'checking' | 'supported' | 'unsupported';
  isARSessionActive: boolean;
  onEnterAr: () => void;
  onProceedToMain: () => void;
  onResetSetup: () => void;
};

export const AppEntryScreens: FC<AppEntryScreensProps> = ({
  appPhase,
  t,
  languagePresets,
  selectedLanguage,
  onApplyLanguage,
  onGenerateCharacter,
  isGenerating,
  arSupportState,
  isARSessionActive,
  onEnterAr,
  onProceedToMain,
  onResetSetup,
}) => {
  const [languageDraft, setLanguageDraft] = useState(selectedLanguage);

  useEffect(() => {
    setLanguageDraft(selectedLanguage);
  }, [selectedLanguage]);

  if (appPhase === 'lang') {
    return (
      <div className="language-gate">
        <div className="language-gate-card">
          <h2>{t.chooseLanguage}</h2>
          <p>{t.chooseLanguageDesc}</p>
          <div className="language-gate-input-row">
            <input
              className="language-gate-input"
              list="entry-language-presets"
              value={languageDraft}
              onChange={(event) => setLanguageDraft(event.target.value)}
              placeholder="e.g. fr-FR"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              className="hud-btn hud-btn-blue language-gate-apply-btn"
              onClick={() => onApplyLanguage(canonicalizeLocale(languageDraft, selectedLanguage))}
            >
              {t.applyLanguage}
            </button>
          </div>
          <div className="language-gate-current">
            {`${t.language}: ${inferLocaleLabel(selectedLanguage)} (${selectedLanguage})`}
          </div>
          <datalist id="entry-language-presets">
            {languagePresets.map(option => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </datalist>
          <div className="language-gate-grid">
            {languagePresets.map(option => {
              const isActive = selectedLanguage === option.code;
              return (
                <button
                  key={option.code}
                  className={`hud-btn language-gate-lang-btn${isActive ? ' is-active' : ''}`}
                  onClick={() => onApplyLanguage(option.code)}
                  aria-label={option.label}
                >
                  {isActive && <span className="language-gate-check" aria-hidden>✓</span>}
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (appPhase === 'scan') {
    return (
      <FaceScanner
        t={t}
        onGenerate={onGenerateCharacter}
        isGenerating={isGenerating}
      />
    );
  }

  if (appPhase !== 'summon') {
    return null;
  }

  return (
    <div className="summon-overlay">
      <h2>{t.summonTitle}</h2>
      <p>
        {isARSessionActive
          ? (t.summonArReady ?? 'AR is ready. Start when you want to place the current robot.')
          : t.summonDesc}
      </p>
      <button
        id="btn-summon-ar"
        className={`hud-btn hud-btn-special ${arSupportState === 'checking' ? 'is-disabled' : ''}`}
        onClick={() => {
          if (arSupportState === 'supported') {
            onEnterAr();
            return;
          }
          onProceedToMain();
        }}
        disabled={arSupportState === 'checking'}
        title={arSupportState === 'checking' ? 'Checking AR support...' : ''}
        style={{ marginBottom: '1rem', background: 'linear-gradient(135deg, #FF9A9E 0%, #FECFEF 100%)', color: '#333' }}
      >
        {arSupportState === 'supported' ? t.enterAr : t.summonProceedNoAr}
      </button>
      {arSupportState === 'supported' && (
        <>
          <button
            className={`hud-btn hud-btn-blue ${!isARSessionActive ? 'is-disabled' : ''}`}
            onClick={onProceedToMain}
            disabled={!isARSessionActive}
          >
            {t.summonStartInAr ?? 'Start in AR'}
          </button>
          <button
            className="hud-btn hud-btn-carbon"
            onClick={onProceedToMain}
          >
            {t.summonSkipAr}
          </button>
        </>
      )}
      {!isARSessionActive && (
        <button
          className="hud-btn hud-btn-steel"
          onClick={onResetSetup}
        >
          {t.summonRetakeFace ?? t.scanRetake ?? 'Retake Face'}
        </button>
      )}
    </div>
  );
};

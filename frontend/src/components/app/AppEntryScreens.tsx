import type { FC } from 'react';
import { FaceScanner } from '../FaceScanner';
import type { AppPhase, UiText } from '../../types/app';

type LangOption = {
  code: string;
  label: string;
};

type AppEntryScreensProps = {
  appPhase: AppPhase;
  t: UiText;
  langOptions: LangOption[];
  selectedLanguage: string;
  onApplyLanguage: (langCode: string) => void;
  onGenerateCharacter: (faceImageBase64?: string, presetText?: string) => Promise<void>;
  isGenerating: boolean;
  arSupportState: 'checking' | 'supported' | 'unsupported';
  onEnterAr: () => void;
  onProceedToMain: () => void;
};

export const AppEntryScreens: FC<AppEntryScreensProps> = ({
  appPhase,
  t,
  langOptions,
  selectedLanguage,
  onApplyLanguage,
  onGenerateCharacter,
  isGenerating,
  arSupportState,
  onEnterAr,
  onProceedToMain,
}) => {
  if (appPhase === 'lang') {
    return (
      <div className="language-gate">
        <div className="language-gate-card">
          <h2>{t.chooseLanguage}</h2>
          <p>{t.chooseLanguageDesc}</p>
          <div className="language-gate-grid">
            {langOptions.map(option => {
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
      <h2>Phase 1.3: First Summoning</h2>
      <p>Scan your real-world environment to summon your AI partner.</p>
      <button
        id="btn-summon-ar"
        className={`hud-btn hud-btn-special ${arSupportState === 'checking' ? 'is-disabled' : ''}`}
        onClick={() => {
          if (arSupportState === 'supported') {
            onEnterAr();
          }
          onProceedToMain();
        }}
        disabled={arSupportState === 'checking'}
        title={arSupportState === 'checking' ? 'Checking AR support...' : ''}
        style={{ marginBottom: '1rem', background: 'linear-gradient(135deg, #FF9A9E 0%, #FECFEF 100%)', color: '#333' }}
      >
        {arSupportState === 'supported' ? t.enterAr : 'Proceed to Main Menu (AR Not Supported)'}
      </button>
      {arSupportState === 'supported' && (
        <button
          className="hud-btn hud-btn-carbon"
          onClick={onProceedToMain}
        >
          Skip AR Summoning
        </button>
      )}
    </div>
  );
};

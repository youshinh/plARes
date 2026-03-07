import { useEffect, useState, type FC } from "react";
import { inferLocaleLabel } from "../../i18n/runtime";
import type {
  ProfileInfo,
  RouteStatus,
  RouteStepKey,
  UiText,
} from "../../types/app";
import { buildReadableMemoryView } from "../../utils/memorySummary";

type FlowHubScreenProps = {
  t: UiText;
  profileView: ProfileInfo;
  selectedLanguage: string;
  routeNextStep: RouteStepKey | "complete";
  routeSteps: Array<{ key: RouteStepKey; label: string; status: RouteStatus }>;
  onTriggerRecommendedRouteStep: () => void;
  onStartWalk: () => void;
  onStartTraining: () => void;
  onOpenBattlePrep: () => void;
  onRequestProfileSync: () => void;
  onOpenProfile: () => void;
};

const routeStatusLabel = (t: UiText, status: RouteStatus) =>
  status === "done"
    ? t.routeStatusDone
    : status === "doing"
      ? t.routeStatusDoing
      : t.routeStatusTodo;

const nextRouteLabel = (
  t: UiText,
  routeNextStep: RouteStepKey | "complete",
) => {
  if (routeNextStep === "complete") return t.routeCtaComplete;
  return `${t.routeCtaNext}: ${
    routeNextStep === "walk"
      ? t.startWalk
      : routeNextStep === "training"
        ? t.startTraining
        : t.flowStartBattle
  }`;
};

export const FlowHubScreen: FC<FlowHubScreenProps> = ({
  t,
  profileView,
  selectedLanguage,
  routeNextStep,
  routeSteps,
  onTriggerRecommendedRouteStep,
  onStartWalk,
  onStartTraining,
  onOpenBattlePrep,
  onRequestProfileSync,
  onOpenProfile,
}) => {
  const memoryView = buildReadableMemoryView(profileView.memorySummary, t);
  const isRouteComplete = routeNextStep === "complete";
  const [isCompletedRouteExpanded, setIsCompletedRouteExpanded] =
    useState(!isRouteComplete);

  useEffect(() => {
    setIsCompletedRouteExpanded(!isRouteComplete);
  }, [isRouteComplete]);

  return (
    <section className="flow-hub" aria-label={t.flowHubTitle}>
      <div className="flow-hub-header">
        <h2>{t.flowHubTitle}</h2>
        <p>{t.flowHubDesc}</p>
        <div className="flow-hub-pill">{t.flowPhase1Done}</div>
      </div>
      <div className="flow-route-guide">
        <div className="flow-route-summary">
          <div>
            <div className="flow-route-title">{t.routeGuideTitle}</div>
            <p className="flow-route-desc">
              {isRouteComplete ? t.routeGuideDoneDesc : t.routeGuideDesc}
            </p>
          </div>
          {isRouteComplete && (
            <button
              type="button"
              className="hud-btn hud-btn-carbon hud-btn-mini"
              onClick={() => setIsCompletedRouteExpanded((prev) => !prev)}
            >
              {isCompletedRouteExpanded
                ? t.routeHideCompleted
                : t.routeOpenCompleted}
            </button>
          )}
        </div>
        {(!isRouteComplete || isCompletedRouteExpanded) && (
          <>
            <ol className="flow-route-list">
              {routeSteps.map((step) => (
                <li
                  key={step.key}
                  className={`flow-route-item is-${step.status}`}
                >
                  <span className="flow-route-step">{step.label}</span>
                  <span className={`flow-route-badge is-${step.status}`}>
                    {routeStatusLabel(t, step.status)}
                  </span>
                </li>
              ))}
            </ol>
            <button
              className="hud-btn hud-btn-blue hud-btn-mini"
              onClick={onTriggerRecommendedRouteStep}
              disabled={routeNextStep === "complete"}
            >
              {nextRouteLabel(t, routeNextStep)}
            </button>
          </>
        )}
      </div>
      <div className="flow-hub-grid">
        <article className="flow-hub-card">
          <h3>{t.flowPhase2Title}</h3>
          <p>{t.flowPhase2Desc}</p>
          <div className="flow-hub-actions">
            <button
              className="hud-btn hud-btn-teal hud-btn-mini"
              onClick={onStartWalk}
            >
              {t.startWalk}
            </button>
            <button
              className="hud-btn hud-btn-blue hud-btn-mini"
              onClick={onStartTraining}
            >
              {t.startTraining}
            </button>
          </div>
        </article>
        <article className="flow-hub-card">
          <h3>{t.flowPhase3Title}</h3>
          <p>{t.flowPhase3Desc}</p>
          <div className="flow-hub-actions">
            <button
              className="hud-btn hud-btn-warn hud-btn-mini"
              onClick={onOpenBattlePrep}
            >
              {t.flowStartBattle}
            </button>
          </div>
        </article>
        <article className="flow-hub-card">
          <h3>{t.flowPhase4Title}</h3>
          <p>{t.flowPhase4Desc}</p>
          <div className="flow-hub-memory" title={memoryView.headline}>
            {memoryView.headline}
          </div>
          {memoryView.entries.length > 1 && (
            <div className="memory-summary-list">
              {memoryView.entries.slice(1).map((entry) => (
                <div key={entry} className="memory-summary-item">
                  {entry}
                </div>
              ))}
            </div>
          )}
          <div className="flow-hub-actions">
            <button
              className="hud-btn hud-btn-carbon hud-btn-mini"
              onClick={() => {
                onRequestProfileSync();
                onOpenProfile();
              }}
            >
              {t.flowOpenMemory}
            </button>
          </div>
        </article>
        <article className="flow-hub-card">
          <h3>{t.settingsTitle}</h3>
          <p>{t.settingsDesc}</p>
          <div className="flow-hub-memory">{`${t.currentLanguage}: ${inferLocaleLabel(selectedLanguage)} (${selectedLanguage})`}</div>
          <div className="flow-hub-actions">
            <button
              className="hud-btn hud-btn-carbon hud-btn-mini"
              onClick={onOpenProfile}
            >
              {t.flowOpenSettings}
            </button>
          </div>
        </article>
      </div>
    </section>
  );
};

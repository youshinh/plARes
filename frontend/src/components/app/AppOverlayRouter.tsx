import type { FC } from 'react';
import { AppEntryScreens, type AppEntryScreensProps } from './AppEntryScreens';
import { AppMainHud, type AppMainHudProps } from './AppMainHud';

type AppOverlayRouterProps = {
  isMainPhase: boolean;
  entryScreensProps: AppEntryScreensProps;
  mainHudProps: AppMainHudProps | null;
};

export const AppOverlayRouter: FC<AppOverlayRouterProps> = ({
  isMainPhase,
  entryScreensProps,
  mainHudProps,
}) => (
  <>
    <AppEntryScreens {...entryScreensProps} />
    {isMainPhase && mainHudProps && <AppMainHud {...mainHudProps} />}
  </>
);

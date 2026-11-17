// App-Hülle (Capacitor): nur auf der nativen Plattform aktiv; im Browser bleibt alles wie gehabt.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export const isNative = (): boolean => { try { return Capacitor.isNativePlatform(); } catch { return false; } };

/** Android-Zurücktaste: handler() läuft bei jedem Druck; Rückgabe false = App beenden */
export function onBack(handler: () => boolean): void {
  if (!isNative()) return;
  void App.addListener('backButton', () => { if (!handler()) void App.exitApp(); });
}

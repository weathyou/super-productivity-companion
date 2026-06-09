import { effect, inject, Injectable, InjectionToken, Injector } from '@angular/core';
import { IS_ELECTRON } from '../../app.constants';
import { GlobalConfigService } from '../../features/config/global-config.service';
import { DesktopCompanionStateBuilderService } from './desktop-companion-state-builder.service';
import { ProductivityCompanionState } from '../../../../electron/shared-with-frontend/desktop-companion.model';

const PUBLISH_DEBOUNCE_MS = 250;
const PUBLISHER_INIT_RETRY_MS = 500;
const PUBLISHER_INIT_RETRY_LIMIT = 10;

export const DESKTOP_COMPANION_IS_ELECTRON = new InjectionToken<boolean>(
  'DESKTOP_COMPANION_IS_ELECTRON',
  {
    providedIn: 'root',
    factory: () => IS_ELECTRON,
  },
);

const getSnapshotSignature = (state: ProductivityCompanionState): string =>
  JSON.stringify(state);

@Injectable({
  providedIn: 'root',
})
export class DesktopCompanionPublisherService {
  private readonly _stateBuilder = inject(DesktopCompanionStateBuilderService);
  private readonly _globalConfigService = inject(GlobalConfigService);
  private readonly _injector = inject(Injector);
  private readonly _isElectron = inject(DESKTOP_COMPANION_IS_ELECTRON);

  private _isInitialized = false;
  private _lastPublishedSignature: string | undefined;
  private _isDisabledForSession = false;
  private _initRetryCount = 0;
  private _initRetryTimeoutId: number | undefined;

  init(): void {
    if (this._isInitialized || !this._isElectron) {
      return;
    }

    if (!window.ea?.publishDesktopCompanionState) {
      this._scheduleInitRetry();
      return;
    }

    this._isInitialized = true;
    this._clearInitRetry();

    effect(
      (onCleanup) => {
        if (this._isDisabledForSession) {
          return;
        }

        const isEnabled = !!this._globalConfigService.misc()?.isDesktopCompanionEnabled;
        const state = this._stateBuilder.state();

        if (!isEnabled) {
          this._lastPublishedSignature = undefined;
          return;
        }

        const signature = getSnapshotSignature(state);
        if (signature === this._lastPublishedSignature) {
          return;
        }

        const timeoutId = window.setTimeout(() => {
          void this._publish(state, signature);
        }, PUBLISH_DEBOUNCE_MS);
        onCleanup(() => window.clearTimeout(timeoutId));
      },
      { injector: this._injector },
    );
  }

  private _scheduleInitRetry(): void {
    if (
      this._initRetryTimeoutId !== undefined ||
      this._initRetryCount >= PUBLISHER_INIT_RETRY_LIMIT
    ) {
      return;
    }
    this._initRetryCount++;
    this._initRetryTimeoutId = window.setTimeout(() => {
      this._initRetryTimeoutId = undefined;
      this.init();
    }, PUBLISHER_INIT_RETRY_MS);
  }

  private _clearInitRetry(): void {
    if (this._initRetryTimeoutId === undefined) {
      return;
    }
    window.clearTimeout(this._initRetryTimeoutId);
    this._initRetryTimeoutId = undefined;
  }

  private async _publish(
    state: ProductivityCompanionState,
    signature: string,
  ): Promise<void> {
    if (this._isDisabledForSession || signature === this._lastPublishedSignature) {
      return;
    }

    const result = await window.ea.publishDesktopCompanionState(state);
    if (result.unsupportedSchema) {
      this._isDisabledForSession = true;
      return;
    }
    if (result.ok) {
      this._lastPublishedSignature = signature;
    }
  }
}

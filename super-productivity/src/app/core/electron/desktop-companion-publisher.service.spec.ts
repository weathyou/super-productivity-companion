import { signal } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { GlobalConfigService } from '../../features/config/global-config.service';
import { DesktopCompanionStateBuilderService } from './desktop-companion-state-builder.service';
import {
  DESKTOP_COMPANION_IS_ELECTRON,
  DesktopCompanionPublisherService,
} from './desktop-companion-publisher.service';
import { ProductivityCompanionState } from '../../../../electron/shared-with-frontend/desktop-companion.model';

describe('DesktopCompanionPublisherService', () => {
  const state = signal<ProductivityCompanionState>({ mode: 'idle' });
  const misc = signal<{ isDesktopCompanionEnabled?: boolean }>({
    isDesktopCompanionEnabled: false,
  });
  let publishSpy: jasmine.Spy;

  beforeEach(() => {
    state.set({ mode: 'idle' });
    misc.set({ isDesktopCompanionEnabled: false });
    publishSpy = jasmine
      .createSpy('publishDesktopCompanionState')
      .and.resolveTo({ ok: true });

    (window as unknown as { ea: typeof window.ea }).ea = {
      publishDesktopCompanionState: publishSpy,
      isDesktopCompanionForceEnabled: () => false,
    } as unknown as typeof window.ea;

    TestBed.configureTestingModule({
      providers: [
        DesktopCompanionPublisherService,
        {
          provide: DESKTOP_COMPANION_IS_ELECTRON,
          useValue: true,
        },
        {
          provide: DesktopCompanionStateBuilderService,
          useValue: { state },
        },
        {
          provide: GlobalConfigService,
          useValue: { misc },
        },
      ],
    });
  });

  it('does not publish while disabled', fakeAsync(() => {
    TestBed.inject(DesktopCompanionPublisherService).init();
    tick(500);

    expect(publishSpy).not.toHaveBeenCalled();
  }));

  it('publishes the snapshot when enabled', fakeAsync(() => {
    TestBed.inject(DesktopCompanionPublisherService).init();

    misc.set({ isDesktopCompanionEnabled: true });
    tick(500);

    expect(publishSpy).toHaveBeenCalledOnceWith({ mode: 'idle' });
  }));

  it('publishes the snapshot when the DEV force flag is exposed by electron', fakeAsync(() => {
    (window as unknown as { ea: typeof window.ea }).ea = {
      ...window.ea,
      isDesktopCompanionForceEnabled: () => true,
    };
    TestBed.inject(DesktopCompanionPublisherService).init();

    tick(500);

    expect(publishSpy).toHaveBeenCalledOnceWith({ mode: 'idle' });
  }));

  it('does not publish duplicate snapshots', fakeAsync(() => {
    TestBed.inject(DesktopCompanionPublisherService).init();

    misc.set({ isDesktopCompanionEnabled: true });
    tick(500);
    state.set({ mode: 'idle' });
    tick(500);

    expect(publishSpy).toHaveBeenCalledTimes(1);
  }));

  it('stops publishing for the session on schema mismatch', fakeAsync(() => {
    publishSpy.and.resolveTo({ ok: false, unsupportedSchema: true });
    TestBed.inject(DesktopCompanionPublisherService).init();

    misc.set({ isDesktopCompanionEnabled: true });
    tick(500);
    state.set({ mode: 'working' });
    tick(500);

    expect(publishSpy).toHaveBeenCalledTimes(1);
  }));
});

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import {
  buildProductivityCompanionState,
  DesktopCompanionStateBuilderService,
} from './desktop-companion-state-builder.service';
import { TaskService } from '../../features/tasks/task.service';
import { FocusModeService } from '../../features/focus-mode/focus-mode.service';
import { DateService } from '../date/date.service';
import { Task } from '../../features/tasks/task.model';

describe('buildProductivityCompanionState', () => {
  const createTask = (overrides: Partial<Task> = {}): Task =>
    ({
      id: 'task-1',
      title: 'Demo task',
      projectId: 'project-1',
      tagIds: ['tag-1'],
      subTaskIds: [],
      timeSpent: 120000,
      timeSpentOnDay: {
        ['2026-06-09']: 60000,
      },
      timeEstimate: 300000,
      isDone: false,
      created: 1781000000000,
      attachments: [],
      ...overrides,
    }) as Task;

  it('maps no current task to idle', () => {
    expect(
      buildProductivityCompanionState({
        currentTask: null,
        today: '2026-06-09',
        isBreakActive: false,
        isTimerPaused: false,
      }),
    ).toEqual({ mode: 'idle' });
  });

  it('maps a current task to working and includes phase 1 task context', () => {
    const state = buildProductivityCompanionState({
      currentTask: createTask(),
      today: '2026-06-09',
      isBreakActive: false,
      isTimerPaused: false,
    });

    expect(state).toEqual({
      mode: 'working',
      currentTask: {
        id: 'task-1',
        title: 'Demo task',
        projectId: 'project-1',
        tagIds: ['tag-1'],
        timeSpentToday: 60000,
        estimate: 300000,
      },
      timer: {
        isRunning: true,
        elapsedToday: 60000,
      },
    });
  });

  it('lets break mode win over task display', () => {
    const state = buildProductivityCompanionState({
      currentTask: createTask(),
      today: '2026-06-09',
      isBreakActive: true,
      isTimerPaused: false,
    });

    expect(state.mode).toBe('break');
    expect(state.timer?.isRunning).toBe(false);
  });

  it('maps a paused focus session with a current task to paused', () => {
    const state = buildProductivityCompanionState({
      currentTask: createTask(),
      today: '2026-06-09',
      isBreakActive: false,
      isTimerPaused: true,
    });

    expect(state.mode).toBe('paused');
    expect(state.timer?.isRunning).toBe(false);
  });
});

describe('DesktopCompanionStateBuilderService', () => {
  let currentTask$: BehaviorSubject<Task | null>;
  const isBreakActive = signal(false);
  const isSessionPaused = signal(false);

  const createTask = (): Task =>
    ({
      id: 'task-1',
      title: 'Live task',
      projectId: 'project-1',
      tagIds: [],
      subTaskIds: [],
      timeSpent: 0,
      timeSpentOnDay: { ['2026-06-09']: 42000 },
      timeEstimate: 0,
      isDone: false,
      created: 1781000000000,
      attachments: [],
    }) as Task;

  beforeEach(() => {
    currentTask$ = new BehaviorSubject<Task | null>(null);
    isBreakActive.set(false);
    isSessionPaused.set(false);

    TestBed.configureTestingModule({
      providers: [
        DesktopCompanionStateBuilderService,
        {
          provide: TaskService,
          useValue: {
            currentTask$: currentTask$.asObservable(),
          } as unknown as TaskService,
        },
        {
          provide: FocusModeService,
          useValue: {
            isBreakActive,
            isSessionPaused,
          } as unknown as FocusModeService,
        },
        {
          provide: DateService,
          useValue: {
            todayStr: () => '2026-06-09',
          } as unknown as DateService,
        },
      ],
    });
  });

  it('updates the computed snapshot when inputs change', () => {
    const service = TestBed.inject(DesktopCompanionStateBuilderService);

    expect(service.state().mode).toBe('idle');

    currentTask$.next(createTask());

    expect(service.state().mode).toBe('working');
    expect(service.state().currentTask?.title).toBe('Live task');

    isBreakActive.set(true);

    expect(service.state().mode).toBe('break');
  });
});

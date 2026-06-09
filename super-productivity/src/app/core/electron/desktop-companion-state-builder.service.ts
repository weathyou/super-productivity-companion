import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TaskService } from '../../features/tasks/task.service';
import { FocusModeService } from '../../features/focus-mode/focus-mode.service';
import { DateService } from '../date/date.service';
import { Task } from '../../features/tasks/task.model';
import { ProductivityCompanionState } from '../../../../electron/shared-with-frontend/desktop-companion.model';

const finitePositiveOrZero = (value: number | undefined | null): number | undefined =>
  value !== null && value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : undefined;

const getTimeSpentToday = (task: Task, today: string): number | undefined => {
  const spentForToday = finitePositiveOrZero(task.timeSpentOnDay?.[today]);
  return spentForToday ?? finitePositiveOrZero(task.timeSpent);
};

export const buildProductivityCompanionState = ({
  currentTask,
  today,
  isBreakActive,
  isTimerPaused,
}: {
  currentTask: Task | null;
  today: string;
  isBreakActive: boolean;
  isTimerPaused: boolean;
}): ProductivityCompanionState => {
  const timeSpentToday =
    currentTask && today ? getTimeSpentToday(currentTask, today) : undefined;
  const isRunning = !!currentTask && !isBreakActive && !isTimerPaused;

  const state: ProductivityCompanionState = {
    mode: isBreakActive
      ? 'break'
      : currentTask
        ? isRunning
          ? 'working'
          : 'paused'
        : 'idle',
  };

  if (currentTask) {
    state.currentTask = {
      id: currentTask.id,
      title: currentTask.title,
    };
    if (currentTask.projectId) {
      state.currentTask.projectId = currentTask.projectId;
    }
    if (currentTask.tagIds.length) {
      state.currentTask.tagIds = currentTask.tagIds;
    }
    if (timeSpentToday !== undefined) {
      state.currentTask.timeSpentToday = timeSpentToday;
    }
    const estimate = finitePositiveOrZero(currentTask.timeEstimate);
    if (estimate !== undefined) {
      state.currentTask.estimate = estimate;
    }
    state.timer = {
      isRunning,
    };
    if (timeSpentToday !== undefined) {
      state.timer.elapsedToday = timeSpentToday;
    }
  }

  return state;
};

@Injectable({
  providedIn: 'root',
})
export class DesktopCompanionStateBuilderService {
  private readonly _taskService = inject(TaskService);
  private readonly _focusModeService = inject(FocusModeService);
  private readonly _dateService = inject(DateService);

  private readonly _currentTask = toSignal(this._taskService.currentTask$, {
    initialValue: null,
  });

  readonly state = computed(() =>
    buildProductivityCompanionState({
      currentTask: this._currentTask(),
      today: this._dateService.todayStr(),
      isBreakActive: this._focusModeService.isBreakActive(),
      isTimerPaused: this._focusModeService.isSessionPaused(),
    }),
  );
}

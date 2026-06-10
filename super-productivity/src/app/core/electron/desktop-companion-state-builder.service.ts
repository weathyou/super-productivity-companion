import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TaskService } from '../../features/tasks/task.service';
import { FocusModeService } from '../../features/focus-mode/focus-mode.service';
import { DateService } from '../date/date.service';
import { Task } from '../../features/tasks/task.model';
import { ProductivityCompanionState } from '../../../../electron/shared-with-frontend/desktop-companion.model';
import { getDbDateStr } from '../../util/get-db-date-str';

const REMINDER_TICK_MS = 30_000;
const REMINDER_ATTENTION_WINDOW_MS = 5 * 60_000;

const finitePositiveOrZero = (value: number | undefined | null): number | undefined =>
  value !== null && value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : undefined;

const getTimeSpentToday = (task: Task, today: string): number | undefined => {
  const spentForToday = finitePositiveOrZero(task.timeSpentOnDay?.[today]);
  return spentForToday ?? finitePositiveOrZero(task.timeSpent);
};

const getExplicitTimeSpentToday = (task: Task, today: string): number | undefined =>
  finitePositiveOrZero(task.timeSpentOnDay?.[today]);

const getTaskDateStr = (timestamp: number | undefined | null): string | undefined =>
  timestamp ? getDbDateStr(new Date(timestamp)) : undefined;

const isBeforeToday = (day: string | null | undefined, today: string): boolean =>
  !!day && day < today;

const isTaskDueToday = (task: Task, today: string): boolean =>
  task.dueDay === today || getTaskDateStr(task.dueWithTime) === today;

const isTaskOverdue = (task: Task, today: string): boolean =>
  !task.isDone &&
  (isBeforeToday(task.dueDay, today) ||
    isBeforeToday(getTaskDateStr(task.dueWithTime), today) ||
    isBeforeToday(task.deadlineDay, today) ||
    isBeforeToday(getTaskDateStr(task.deadlineWithTime), today));

const buildDaySummary = (tasks: Task[], today: string): ProductivityCompanionState['day'] => {
  const tasksWithTimeToday = tasks.filter((task) =>
    getExplicitTimeSpentToday(task, today),
  );
  const plannedTasks = tasks.filter(
    (task) => isTaskDueToday(task, today) || getExplicitTimeSpentToday(task, today),
  );
  const completedTaskCount = plannedTasks.filter((task) => task.isDone).length;
  const totalTrackedMs = tasksWithTimeToday.reduce(
    (sum, task) => sum + (getExplicitTimeSpentToday(task, today) ?? 0),
    0,
  );

  if (!plannedTasks.length && !completedTaskCount && !totalTrackedMs) {
    return undefined;
  }

  return {
    plannedTaskCount: plannedTasks.length,
    completedTaskCount,
    totalTrackedMs,
  };
};

const buildReminderCandidates = (
  tasks: Task[],
): NonNullable<ProductivityCompanionState['nextReminder']>[] =>
  tasks
    .filter((task) => !task.isDone)
    .flatMap((task) => {
      const candidates: NonNullable<ProductivityCompanionState['nextReminder']>[] = [];
      const remindAt = finitePositiveOrZero(task.remindAt);
      if (remindAt !== undefined) {
        candidates.push({
          taskId: task.id,
          title: task.title,
          dueAt: remindAt,
        });
      }
      const deadlineRemindAt = finitePositiveOrZero(task.deadlineRemindAt);
      if (deadlineRemindAt !== undefined) {
        candidates.push({
          taskId: task.id,
          title: task.title,
          dueAt: deadlineRemindAt,
        });
      }
      return candidates;
    })
    .sort((a, b) => a.dueAt - b.dueAt);

const getActiveReminder = (
  reminders: NonNullable<ProductivityCompanionState['nextReminder']>[],
  now: number,
): ProductivityCompanionState['nextReminder'] =>
  reminders.find(
    (reminder) =>
      reminder.dueAt <= now && now - reminder.dueAt <= REMINDER_ATTENTION_WINDOW_MS,
  );

export const buildProductivityCompanionState = ({
  currentTask,
  allTasks,
  today,
  now,
  isBreakActive,
  isTimerPaused,
}: {
  currentTask: Task | null;
  allTasks: Task[];
  today: string;
  now: number;
  isBreakActive: boolean;
  isTimerPaused: boolean;
}): ProductivityCompanionState => {
  const timeSpentToday =
    currentTask && today ? getTimeSpentToday(currentTask, today) : undefined;
  const isRunning = !!currentTask && !isBreakActive && !isTimerPaused;
  const day = buildDaySummary(allTasks, today);
  const hasOverdueTasks = allTasks.some((task) => isTaskOverdue(task, today));
  const reminderCandidates = buildReminderCandidates(allTasks);
  const activeReminder = getActiveReminder(reminderCandidates, now);
  const nextReminder =
    activeReminder ?? reminderCandidates.find((reminder) => reminder.dueAt > now);

  const state: ProductivityCompanionState = {
    mode: isBreakActive
      ? 'break'
      : activeReminder
        ? 'attention'
      : currentTask
        ? isRunning
          ? 'working'
          : 'paused'
        : hasOverdueTasks
          ? 'overdue'
          : day && day.plannedTaskCount > 0 && day.completedTaskCount === day.plannedTaskCount
            ? 'finishedDay'
        : 'idle',
  };

  if (day) {
    state.day = day;
  }
  if (nextReminder) {
    state.nextReminder = nextReminder;
  }

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
  private readonly _destroyRef = inject(DestroyRef);
  private readonly _now = signal(Date.now());

  private readonly _currentTask = toSignal(this._taskService.currentTask$, {
    initialValue: null,
  });
  private readonly _allTasks = toSignal(this._taskService.allTasks$, {
    initialValue: [],
  });

  constructor() {
    const intervalId = window.setInterval(() => {
      this._now.set(Date.now());
    }, REMINDER_TICK_MS);
    this._destroyRef.onDestroy(() => window.clearInterval(intervalId));
  }

  readonly state = computed(() =>
    buildProductivityCompanionState({
      currentTask: this._currentTask(),
      allTasks: this._allTasks(),
      today: this._dateService.todayStr(),
      now: this._now(),
      isBreakActive: this._focusModeService.isBreakActive(),
      isTimerPaused: this._focusModeService.isSessionPaused(),
    }),
  );
}

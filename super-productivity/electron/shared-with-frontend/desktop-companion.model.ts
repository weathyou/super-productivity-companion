export const DESKTOP_COMPANION_SCHEMA_VERSION = 1;

export type ProductivityCompanionMode =
  | 'idle'
  | 'working'
  | 'paused'
  | 'break'
  | 'planning'
  | 'overdue'
  | 'attention'
  | 'finishedDay';

export interface ProductivityCompanionState {
  mode: ProductivityCompanionMode;
  currentTask?: {
    id: string;
    title: string;
    projectId?: string;
    tagIds?: string[];
    timeSpentToday?: number;
    estimate?: number;
  };
  timer?: {
    isRunning: boolean;
    startedAt?: number;
    elapsedToday?: number;
  };
}

export interface ProductivityStateRequest {
  source: 'super-productivity';
  schemaVersion: typeof DESKTOP_COMPANION_SCHEMA_VERSION;
  sentAt: number;
  state: ProductivityCompanionState;
}

export interface DesktopCompanionPublishResult {
  ok: boolean;
  port?: number;
  unsupportedSchema?: boolean;
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PluginHttp } from '@super-productivity/plugin-api';
import { searchIssues, getIssueById, testConnection, LinearConfig } from './linear-api';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const testCfg: LinearConfig = { apiKey: 'test-key', teamId: null, projectId: null };

const rawReducedIssue = {
  id: 'abc123',
  identifier: 'ENG-1',
  number: 1,
  title: 'Fix the bug',
  updatedAt: '2024-01-01T00:00:00Z',
  url: 'https://linear.app/team/issue/ENG-1',
  state: { id: 's1', name: 'In Progress', type: 'started' },
};

const rawFullIssue = {
  ...rawReducedIssue,
  description: 'A description',
  priority: 2,
  createdAt: '2024-01-01T00:00:00Z',
  completedAt: null,
  canceledAt: null,
  dueDate: null,
  assignee: { id: 'u1', name: 'Alice', email: 'alice@example.com', avatarUrl: undefined },
  creator: { id: 'u2', name: 'Bob' },
  team: { id: 't1', name: 'Engineering', key: 'ENG' },
  labels: { nodes: [{ id: 'l1', name: 'bug', color: '#ff0000' }] },
  comments: {
    nodes: [
      {
        id: 'c1',
        body: 'A comment',
        createdAt: '2024-01-01T00:00:00Z',
        user: { id: 'u1', name: 'Alice', avatarUrl: undefined },
      },
    ],
  },
  attachments: {
    nodes: [{ id: 'att1', sourceType: 'github', title: 'PR #1', url: 'https://github.com/pr/1' }],
  },
};

function makeHttp(response: unknown): PluginHttp {
  return {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue(response),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
  } as unknown as PluginHttp;
}

// ─── searchIssues ─────────────────────────────────────────────────────────────

describe('searchIssues', () => {
  it('returns mapped search results', async () => {
    const http = makeHttp({
      data: { viewer: { assignedIssues: { nodes: [rawReducedIssue] } } },
    });

    const results = await searchIssues('', testCfg, http);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('abc123');
    expect(results[0].title).toBe('ENG-1 Fix the bug');
  });

  it('filters by searchTerm client-side', async () => {
    const other = { ...rawReducedIssue, id: 'other', identifier: 'ENG-2', title: 'Other' };
    const http = makeHttp({
      data: { viewer: { assignedIssues: { nodes: [rawReducedIssue, other] } } },
    });

    const results = await searchIssues('bug', testCfg, http);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('abc123');
  });

  it('adds teamId variable when cfg.teamId is set', async () => {
    const cfgWithTeam: LinearConfig = { ...testCfg, teamId: 't1' };
    const http = makeHttp({
      data: { viewer: { assignedIssues: { nodes: [] } } },
    });

    await searchIssues('', cfgWithTeam, http);

    const body = (http.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, unknown>;
    expect((body.variables as Record<string, unknown>).team).toEqual({ id: { eq: 't1' } });
  });
});

// ─── getIssueById ─────────────────────────────────────────────────────────────

describe('getIssueById', () => {
  it('returns a mapped PluginIssue', async () => {
    const http = makeHttp({ data: { issue: rawFullIssue } });

    const issue = await getIssueById('abc123', testCfg, http);

    expect(issue.id).toBe('abc123');
    expect(issue.title).toBe('ENG-1 Fix the bug');
    expect(issue.labels).toEqual(['bug']);
    expect((issue as any).comments).toHaveLength(1);
  });

  it('throws when issue is not found', async () => {
    const http = makeHttp({ data: { issue: null } });

    await expect(getIssueById('nope', testCfg, http)).rejects.toThrow(
      'Linear issue nope not found',
    );
  });
});

// ─── testConnection ───────────────────────────────────────────────────────────

describe('testConnection', () => {
  it('returns true when viewer query succeeds', async () => {
    const http = makeHttp({ data: { viewer: { id: 'u1', name: 'Alice' } } });
    expect(await testConnection(testCfg, http)).toBe(true);
  });

  it('returns false when the request rejects', async () => {
    const http: PluginHttp = {
      get: vi.fn(),
      post: vi.fn().mockRejectedValue(new Error('Unauthorized')),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      request: vi.fn(),
    } as unknown as PluginHttp;

    expect(await testConnection(testCfg, http)).toBe(false);
  });
});

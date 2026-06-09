import type { PluginHttp, PluginIssue, PluginSearchResult } from '@super-productivity/plugin-api';

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

export interface LinearConfig {
  apiKey: string | null;
  teamId?: string | null;
  projectId?: string | null;
}

// ─── Internal raw types returned by GraphQL ───────────────────────────────────

interface LinearStateRaw {
  name: string;
  type: string;
}

interface LinearIssueReducedRaw {
  id: string;
  identifier: string;
  number: number;
  title: string;
  updatedAt: string;
  url: string;
  state: LinearStateRaw;
}

interface LinearIssueRaw extends LinearIssueReducedRaw {
  description?: string | null;
  priority: number;
  createdAt: string;
  completedAt?: string | null;
  canceledAt?: string | null;
  dueDate?: string | null;
  assignee?: { id: string; name: string; email: string; avatarUrl?: string } | null;
  creator: { id: string; name: string };
  team: { id: string; name: string; key: string };
  labels?: { nodes: Array<{ id: string; name: string; color: string }> };
  comments?: {
    nodes: Array<{
      id: string;
      body: string;
      createdAt: string;
      user?: { id: string; name: string; avatarUrl?: string };
    }>;
  };
  attachments?: {
    nodes: Array<{ id: string; sourceType: string; title: string; url: string }>;
  };
}

interface GqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const compact = (q: string): string => q.replace(/\s+/g, ' ').trim();

function getHeaders(cfg: LinearConfig): Record<string, string> {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'Content-Type': 'application/json',
    Authorization: cfg.apiKey ?? '',
  };
}

async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
  cfg: LinearConfig,
  http: PluginHttp,
): Promise<T> {
  const res = await http.post<GqlResponse<T>>(
    LINEAR_GRAPHQL_URL,
    { query: compact(query), variables },
    { headers: getHeaders(cfg) },
  );
  if (res.errors?.length) {
    throw new Error(res.errors[0].message || 'Linear GraphQL error');
  }
  return res.data as T;
}

// ─── Mapping helpers ──────────────────────────────────────────────────────────

function mapReducedIssue(raw: LinearIssueReducedRaw): PluginSearchResult {
  return {
    id: raw.id,
    title: `${raw.identifier} ${raw.title}`,
    url: raw.url,
    status: raw.state.type,
    // store identifier + number so getById can resolve them
    identifier: raw.identifier,
    number: raw.number,
    updatedAt: raw.updatedAt,
    state: raw.state,
  };
}

function mapFullIssue(raw: LinearIssueRaw): PluginIssue {
  return {
    id: raw.id,
    title: `${raw.identifier} ${raw.title}`,
    url: raw.url,
    state: raw.state.type,
    lastUpdated: new Date(raw.updatedAt).getTime(),
    identifier: raw.identifier,
    number: raw.number,
    description: raw.description ?? undefined,
    priority: raw.priority,
    createdAt: raw.createdAt,
    completedAt: raw.completedAt ?? undefined,
    canceledAt: raw.canceledAt ?? undefined,
    dueDate: raw.dueDate ?? undefined,
    stateName: raw.state.name,
    assignee: raw.assignee
      ? {
          id: raw.assignee.id,
          name: raw.assignee.name,
          email: raw.assignee.email,
          avatarUrl: raw.assignee.avatarUrl,
        }
      : undefined,
    creator: raw.creator,
    team: raw.team,
    labels: (raw.labels?.nodes ?? []).map((l) => l.name),
    comments: (raw.comments?.nodes ?? [])
      .filter((c) => !!c.user)
      .map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt,
        author: c.user!.name,
        avatarUrl: c.user!.avatarUrl,
      })),
    attachments: (raw.attachments?.nodes ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      url: a.url,
      sourceType: a.sourceType,
    })),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function searchIssues(
  searchTerm: string,
  cfg: LinearConfig,
  http: PluginHttp,
): Promise<PluginSearchResult[]> {
  const query = `
    query SearchIssues($first: Int!, $team: TeamFilter, $project: NullableProjectFilter) {
      viewer {
        assignedIssues(
          first: $first,
          filter: {
            state: { type: { in: ["backlog", "unstarted", "started"] } },
            team: $team,
            project: $project
          }
        ) {
          nodes {
            id identifier number title updatedAt url
            state { id name type }
          }
        }
      }
    }
  `;

  const variables: Record<string, unknown> = { first: 50 };
  if (cfg.teamId) variables.team = { id: { eq: cfg.teamId } };
  if (cfg.projectId) variables.project = { id: { eq: cfg.projectId } };

  const data = await gql<{
    viewer: { assignedIssues: { nodes: LinearIssueReducedRaw[] } };
  }>(query, variables, cfg, http);

  let issues = data.viewer?.assignedIssues?.nodes ?? [];
  if (searchTerm.trim()) {
    const lower = searchTerm.toLowerCase();
    issues = issues.filter(
      (i) =>
        i.title.toLowerCase().includes(lower) ||
        i.identifier.toLowerCase().includes(lower),
    );
  }
  return issues.map(mapReducedIssue);
}

export async function getIssueById(
  issueId: string,
  cfg: LinearConfig,
  http: PluginHttp,
): Promise<PluginIssue> {
  const query = `
    query GetIssue($id: String!) {
      issue(id: $id) {
        id identifier number title description priority
        createdAt updatedAt completedAt canceledAt dueDate url
        state { id name type }
        team { id name key }
        assignee { id name email avatarUrl }
        creator { id name }
        labels(first: 50) { nodes { id name color } }
        comments(first: 50) {
          nodes { id body createdAt user { id name avatarUrl } }
        }
        attachments { nodes { id sourceType title url } }
      }
    }
  `;
  const data = await gql<{ issue: LinearIssueRaw | null }>(
    query,
    { id: issueId },
    cfg,
    http,
  );
  if (!data.issue) throw new Error(`Linear issue ${issueId} not found`);
  return mapFullIssue(data.issue);
}

export function getIssueLink(issueId: string, config: Record<string, unknown>): string {
  // issueId in the plugin system is the Linear UUID; the human-readable URL
  // lives inside the issue data. If the caller has a cached url it will use
  // getById first. For direct link construction we fall back to the workspace
  // URL pattern, but Linear URLs include the team key which we don't have here,
  // so we return the web-app search URL as a reliable fallback.
  void config; // not needed – URL comes from issue data
  void issueId;
  return 'https://linear.app/';
}

export async function testConnection(
  cfg: LinearConfig,
  http: PluginHttp,
): Promise<boolean> {
  const query = `query GetViewer { viewer { id name } }`;
  try {
    await gql<{ viewer: { id: string; name: string } }>(query, {}, cfg, http);
    return true;
  } catch {
    return false;
  }
}

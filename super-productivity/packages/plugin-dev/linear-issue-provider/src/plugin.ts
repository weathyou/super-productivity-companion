import type {
  IssueProviderPluginDefinition,
  PluginHttp,
  PluginIssue,
  PluginSearchResult,
} from '@super-productivity/plugin-api';
import {
  getIssueById,
  getIssueLink,
  LinearConfig,
  searchIssues,
  testConnection,
} from './linear-api';

declare const PluginAPI: {
  registerIssueProvider(definition: IssueProviderPluginDefinition): void;
};

const asCfg = (config: Record<string, unknown>): LinearConfig =>
  config as unknown as LinearConfig;

PluginAPI.registerIssueProvider({
  configFields: [
    {
      key: 'apiKey',
      type: 'password',
      label: 'API Key',
      required: true,
      description: 'Your Linear personal API key.',
    },
    {
      key: 'apiKeyLink',
      type: 'link',
      label: 'Get your API key',
      url: 'https://linear.app/settings/account/security',
    },
    {
      key: 'teamId',
      type: 'input',
      label: 'Team ID (optional)',
      required: false,
      description: 'Filter issues to a specific Linear team.',
    },
    {
      key: 'projectId',
      type: 'input',
      label: 'Project ID (optional)',
      required: false,
      description: 'Filter issues to a specific Linear project.',
      advanced: true,
    },
  ],

  getHeaders(config: Record<string, unknown>): Record<string, string> {
    const cfg = asCfg(config);
    return {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'Content-Type': 'application/json',
      Authorization: cfg.apiKey ?? '',
    };
  },

  async searchIssues(
    searchTerm: string,
    config: Record<string, unknown>,
    http: PluginHttp,
  ): Promise<PluginSearchResult[]> {
    return searchIssues(searchTerm, asCfg(config), http);
  },

  async getById(
    issueId: string,
    config: Record<string, unknown>,
    http: PluginHttp,
  ): Promise<PluginIssue> {
    return getIssueById(issueId, asCfg(config), http);
  },

  getIssueLink(issueId: string, config: Record<string, unknown>): string {
    return getIssueLink(issueId, config);
  },

  async testConnection(
    config: Record<string, unknown>,
    http: PluginHttp,
  ): Promise<boolean> {
    return testConnection(asCfg(config), http);
  },

  issueDisplay: [
    { field: 'title', label: 'Summary', type: 'link', linkField: 'url' },
    { field: 'stateName', label: 'Status', type: 'text' },
    { field: 'priority', label: 'Priority', type: 'text' },
    { field: 'assignee', label: 'Assignee', type: 'text' },
    { field: 'labels', label: 'Labels', type: 'list' },
    { field: 'description', label: 'Description', type: 'markdown' },
  ],

  commentsConfig: {
    bodyField: 'body',
    authorField: 'author',
    createdField: 'createdAt',
    avatarField: 'avatarUrl',
    sortField: 'createdAt',
  },
});

import { Injectable, signal } from '@angular/core';
import {
  RegisteredPluginIssueProvider,
  IssueProviderPluginDefinition,
  PluginIssueField,
  PluginCommentsConfig,
  PluginFieldMapping,
} from './plugin-issue-provider.model';
import { IssueProviderKey } from '../../features/issue/issue.model';

@Injectable({ providedIn: 'root' })
export class PluginIssueProviderRegistryService {
  private _providers = new Map<string, RegisteredPluginIssueProvider>();

  private _pluginIdToKeys = new Map<string, Set<string>>();

  /** Signal that increments on each registration/unregistration, so computed signals can react */
  readonly registrationVersion = signal(0);

  register(opts: {
    pluginId: string;
    definition: IssueProviderPluginDefinition;
    name: string;
    humanReadableName: string;
    icon: string;
    pollIntervalMs: number;
    issueStrings: { singular: string; plural: string };
    issueProviderKey?: string;
    useAgendaView?: boolean;
    defaultAutoAddToBacklog?: boolean;
    allowPrivateNetwork?: boolean;
  }): IssueProviderKey {
    const key = opts.issueProviderKey ?? `plugin:${opts.pluginId}`;
    if (this._providers.has(key)) {
      throw new Error(
        `[PluginIssueProviderRegistry] Duplicate registration for '${key}'.`,
      );
    }

    const registeredKey = key as IssueProviderKey;
    this._providers.set(key, {
      pluginId: opts.pluginId,
      registeredKey,
      definition: opts.definition,
      name: opts.name,
      humanReadableName: opts.humanReadableName,
      icon: opts.icon,
      pollIntervalMs: opts.pollIntervalMs,
      issueStrings: opts.issueStrings,
      useAgendaView: opts.useAgendaView,
      defaultAutoAddToBacklog: opts.defaultAutoAddToBacklog,
      allowPrivateNetwork: opts.allowPrivateNetwork,
    });

    const keys = this._pluginIdToKeys.get(opts.pluginId) ?? new Set<string>();
    keys.add(key);
    this._pluginIdToKeys.set(opts.pluginId, keys);
    this.registrationVersion.update((v) => v + 1);
    return registeredKey;
  }

  unregister(pluginId: string, registeredKey?: string): void {
    const keys = this._pluginIdToKeys.get(pluginId);
    if (!keys) {
      return;
    }

    if (registeredKey) {
      if (keys.delete(registeredKey)) {
        this._providers.delete(registeredKey);
        if (keys.size === 0) {
          this._pluginIdToKeys.delete(pluginId);
        }
        this.registrationVersion.update((v) => v + 1);
      }
      return;
    }

    if (keys.size > 0) {
      keys.forEach((key) => this._providers.delete(key));
      this._pluginIdToKeys.delete(pluginId);
      this.registrationVersion.update((v) => v + 1);
    }
  }

  /** Get the first registered key for a pluginId (e.g. 'GITHUB' or 'plugin:my-plugin') */
  getRegisteredKey(pluginId: string): string | undefined {
    return this.getRegisteredKeys(pluginId)[0];
  }

  getRegisteredKeys(pluginId: string): string[] {
    return Array.from(this._pluginIdToKeys.get(pluginId) ?? []);
  }

  getProvider(key: string): RegisteredPluginIssueProvider | undefined {
    return this._providers.get(key);
  }

  hasProvider(key: string): boolean {
    return this._providers.has(key);
  }

  getAvailableProviders(): RegisteredPluginIssueProvider[] {
    return Array.from(this._providers.values());
  }

  getIcon(key: string): string {
    return this._providers.get(key)?.icon ?? 'extension';
  }

  getName(key: string): string {
    return this._providers.get(key)?.name ?? 'Plugin';
  }

  getHumanReadableName(key: string): string {
    return this._providers.get(key)?.humanReadableName ?? 'Plugin';
  }

  getIssueStrings(key: string): {
    ISSUE_STR: string;
    ISSUES_STR: string;
  } {
    const p = this._providers.get(key);
    return {
      ISSUE_STR: p?.issueStrings.singular ?? 'Issue',
      ISSUES_STR: p?.issueStrings.plural ?? 'Issues',
    };
  }

  getPollIntervalMs(key: string): number {
    return this._providers.get(key)?.pollIntervalMs ?? 0;
  }

  getIssueDisplay(key: string): PluginIssueField[] {
    return this._providers.get(key)?.definition.issueDisplay ?? [];
  }

  getConfigFields(key: string): IssueProviderPluginDefinition['configFields'] {
    return this._providers.get(key)?.definition.configFields ?? [];
  }

  getCommentsConfig(key: string): PluginCommentsConfig | undefined {
    return this._providers.get(key)?.definition.commentsConfig;
  }

  getFieldMappings(key: string): PluginFieldMapping[] | undefined {
    return this._providers.get(key)?.definition.fieldMappings;
  }

  getUseAgendaView(key: string): boolean {
    return this._providers.get(key)?.useAgendaView ?? false;
  }
}

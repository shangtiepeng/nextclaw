import { describe, expect, it } from 'vitest';
import {
  buildNcpChatDiscoveredModelOptions,
  filterNcpChatDiscoveredModelOptionsToDefaultProvider,
  filterNcpChatModelOptionsToDefaultProvider,
  filterNcpChatDiscoveredModelOptionsBySessionType,
} from '@/features/chat/features/ncp/utils/ncp-chat-query-derived.utils';

const providersView = {
  providers: {
    opencode: {
      providerId: 'opencode',
      providerType: 'opencode',
      isBuiltInType: true,
      isCustom: false,
      enabled: true,
      displayName: 'OpenCode Zen Free Trial',
      apiKeyRequired: false,
      apiKeySet: false,
      models: ['big-pickle'],
    },
  },
};

const templatesView = {
  providerTemplates: [{
    id: 'opencode',
    providerType: 'opencode',
    displayName: 'OpenCode Zen Free Trial',
    modelPrefix: 'opencode',
    keywords: [],
    envKey: 'OPENCODE_API_KEY',
    apiKeyRequired: false,
  }],
};

const catalogView = {
  refreshIntervalMs: 43_200_000,
  refreshing: false,
  lastRefreshStartedAt: '2026-08-07T00:00:00.000Z',
  lastRefreshCompletedAt: '2026-08-07T00:00:01.000Z',
  providers: {
    opencode: {
      providerId: 'opencode',
      models: ['big-pickle', 'opencode/deepseek-v4-flash-free', 'mimo-v2.5-free'],
      source: 'catalog' as const,
      fetchedAt: '2026-08-07T00:00:00.500Z',
      lastError: null,
    },
  },
};

describe('provider model catalog derivation', () => {
  it('uses 元流 models when the branded provider is configured', () => {
    const result = filterNcpChatModelOptionsToDefaultProvider([
      { value: 'opencode/model-a', modelLabel: 'model-a', providerLabel: 'OpenCode Zen Free Trial', thinkingCapability: null },
      { value: 'custom-1/model-b', modelLabel: 'model-b', providerLabel: '元流', thinkingCapability: null },
    ]);

    expect(result.map((option) => option.value)).toEqual(['custom-1/model-b']);
  });

  it('falls back to all configured models when 元流 is unavailable', () => {
    const options = [{
      value: 'opencode/model-a',
      modelLabel: 'model-a',
      providerLabel: 'OpenCode Zen Free Trial',
      thinkingCapability: null,
    }];

    expect(filterNcpChatModelOptionsToDefaultProvider(options)).toEqual(options);
  });

  it('keeps discovered model suggestions scoped to 元流 when available', () => {
    const result = filterNcpChatDiscoveredModelOptionsToDefaultProvider([
      { value: 'opencode/model-a', providerId: 'opencode', providerModel: 'model-a', modelLabel: 'model-a', providerLabel: 'OpenCode Zen Free Trial', thinkingCapability: null },
      { value: 'custom-1/model-b', providerId: 'custom-1', providerModel: 'model-b', modelLabel: 'model-b', providerLabel: '元流', thinkingCapability: null },
    ]);

    expect(result.map((option) => option.value)).toEqual(['custom-1/model-b']);
  });

  it('keeps remote order and returns only configured-provider models that are not already enabled', () => {
    const result = buildNcpChatDiscoveredModelOptions({
      catalogView,
      config: null,
      providersView,
      templatesView,
    });

    expect(result).toEqual([
      expect.objectContaining({
        value: 'opencode/deepseek-v4-flash-free',
        providerId: 'opencode',
        providerModel: 'deepseek-v4-flash-free',
      }),
      expect.objectContaining({
        value: 'opencode/mimo-v2.5-free',
        providerId: 'opencode',
        providerModel: 'mimo-v2.5-free',
      }),
    ]);
  });

  it('does not suggest models for providers that still require configuration', () => {
    const result = buildNcpChatDiscoveredModelOptions({
      catalogView,
      config: null,
      providersView: {
        providers: {
          opencode: {
            ...providersView.providers.opencode,
            apiKeyRequired: true,
          },
        },
      },
      templatesView,
    });

    expect(result).toEqual([]);
  });

  it('respects runtime-owned and explicitly restricted session model contracts', () => {
    const options = buildNcpChatDiscoveredModelOptions({
      catalogView,
      config: null,
      providersView,
      templatesView,
    });

    expect(filterNcpChatDiscoveredModelOptionsBySessionType({
      modelOptions: options,
      modelSelectionMode: 'runtime-default',
    })).toEqual([]);
    expect(filterNcpChatDiscoveredModelOptionsBySessionType({
      modelOptions: options,
      modelSelectionMode: 'nextclaw',
      supportedModels: ['opencode/mimo-v2.5-free'],
    }).map((option) => option.value)).toEqual(['opencode/mimo-v2.5-free']);
  });
});

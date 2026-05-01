import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Settings,
  Zap,
  Trash2,
  Plus,
  TestTube,
  Edit2,
  Save,
  CheckCircle,
  XCircle,
  Globe,
  Bell,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import {
  fetchConfig,
  updateConfig,
  testProvider,
  testNotification,
  fetchAvailableModels,
  fetchModelsFromProvider,
} from '../lib/api';

interface Provider {
  name: string;
  status: string;
  apiKey: string;
  baseUrl: string;
  model?: string;
}

interface AgentRoute {
  agent: string;
  model: string;
  provider: string;
  temperature: number;
  maxTokens?: number;
}

interface Config {
  defaultProvider: string;
  defaultModel: string;
  agentRouting: AgentRoute[];
  providers: Provider[];
  notifications?: { telegramToken: string; chatId: string };
  quotas?: { dailyTokenQuota: number; quotaAlertThreshold: number };
  rateLimits?: { rpmLimit: number; tpmLimit: number };
  retryPolicy?: { maxAttempts: number; delayMs: number };
  cloudMode?: boolean;
}

interface AvailableModel {
  provider: string;
  model: string;
  status: string;
}

const PRESET_PROVIDERS = [
  { name: 'DashScope', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { name: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { name: 'Claude', baseUrl: 'https://api.anthropic.com/v1' },
  { name: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
];

export default function ConfigView() {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<Config | null>(null);

  // Add provider modal
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newName, setNewName] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('');

  // Edit routing modal
  const [editingRoute, setEditingRoute] = useState<AgentRoute | null>(null);

  // Edit provider modal
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);

  // Test result
  const [testResult, setTestResult] = useState<{
    provider: string;
    success: boolean;
    latencyMs?: number;
    error?: string;
  } | null>(null);

  // Available models from backend (fetched on mount, currently unused after UI simplification)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);

  // Fetched models from provider API
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // Notification test result
  const [notifTestResult, setNotifTestResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);

  // Notification config
  const [notifications, setNotifications] = useState({
    telegramToken: '',
    chatId: '',
  });

  // Quota config
  const [quotas, setQuotas] = useState({
    dailyTokenQuota: 0,
    quotaAlertThreshold: 0.8,
  });

  // Rate limit config
  const [rateLimits, setRateLimits] = useState({
    rpmLimit: 0,
    tpmLimit: 0,
  });

  // Retry policy
  const [retryPolicy, setRetryPolicy] = useState({
    maxAttempts: 2,
    delayMs: 1000,
  });

  const [cloudMode, setCloudMode] = useState(true);

  useEffect(() => {
    fetchConfig()
      .then((c) => {
        setConfig(c);
        setNotifications({
          telegramToken: c.notifications?.telegramToken ?? '',
          chatId: c.notifications?.chatId ?? '',
        });
        setQuotas({
          dailyTokenQuota: c.quotas?.dailyTokenQuota ?? 0,
          quotaAlertThreshold: c.quotas?.quotaAlertThreshold ?? 0.8,
        });
        setRateLimits({
          rpmLimit: c.rateLimits?.rpmLimit ?? 0,
          tpmLimit: c.rateLimits?.tpmLimit ?? 0,
        });
        setRetryPolicy({
          maxAttempts: c.retryPolicy?.maxAttempts ?? 2,
          delayMs: c.retryPolicy?.delayMs ?? 1000,
        });
        setCloudMode(c.cloudMode ?? true);
      })
      .catch(() => {
        // load failed
      })
      .finally(() => setLoading(false));

    fetchAvailableModels()
      .then((d) => setAvailableModels(d.models ?? []))
      .catch(() => {
        // non-critical
      });
  }, []);

  async function handleSave(updated: Config) {
    try {
      const result = await updateConfig(updated);
      setConfig(result);
    } catch {
      // save failed
    }
  }

  async function handleTestProvider(provider: Provider) {
    setTestResult(null);
    try {
      const result = await testProvider({
        name: provider.name,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        model: provider.model || config?.defaultModel,
      });
      setTestResult({
        provider: provider.name,
        success: result.success,
        latencyMs: result.latencyMs,
        error: result.error,
      });
    } catch {
      setTestResult({ provider: provider.name, success: false, error: '连接失败' });
    }
  }

  async function handleRemoveProvider(providerName: string) {
    if (!config) return;
    const updated = {
      ...config,
      providers: config.providers.filter((p) => p.name !== providerName),
    };
    handleSave(updated);
  }

  async function handleAddProvider() {
    if (!config || !newName) return;
    const updated = {
      ...config,
      providers: [
        ...config.providers,
        { name: newName, status: 'connected', apiKey: newApiKey, baseUrl: newBaseUrl },
      ],
    };
    handleSave(updated);
    setShowAddProvider(false);
    setNewName('');
    setNewApiKey('');
    setNewBaseUrl('');
  }

  async function handleSaveRoute(original: AgentRoute, updated: AgentRoute) {
    if (!config) return;
    const newRouting = config.agentRouting.map((r) => (r.agent === original.agent ? updated : r));
    handleSave({ ...config, agentRouting: newRouting });
    setEditingRoute(null);
  }

  async function handleUpdateProvider(original: Provider, updated: Provider) {
    if (!config) return;
    const newProviders = config.providers.map((p) => (p.name === original.name ? updated : p));
    await handleSave({ ...config, providers: newProviders });
    setEditingProvider(null);
  }

  function handleDefaultModelChange(model: string) {
    if (!config) return;
    setConfig({ ...config, defaultModel: model });
  }

  function getDefaultProviderBaseUrl(providerName: string): string {
    const preset = PRESET_PROVIDERS.find((p) => p.name === providerName);
    return preset?.baseUrl || '';
  }

  async function handleFetchModels() {
    if (!config) return;
    const provider = config.providers.find((p) => p.name === config.defaultProvider);
    if (!provider || !provider.apiKey || !provider.baseUrl) {
      setModelsError('请先填写 API Key 和 Base URL');
      return;
    }
    setModelsLoading(true);
    setModelsError(null);
    try {
      const result = await fetchModelsFromProvider({
        name: provider.name,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
      });
      if (result.success && Array.isArray(result.models)) {
        setFetchedModels(result.models);
        // Auto-select first model if current defaultModel is not in the list
        if (result.models.length > 0 && !result.models.includes(config.defaultModel)) {
          setConfig({ ...config, defaultModel: result.models[0] });
        }
      } else {
        setModelsError(result.error || '获取模型列表失败');
        setFetchedModels([]);
      }
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : '获取模型列表失败');
      setFetchedModels([]);
    } finally {
      setModelsLoading(false);
    }
  }

  // Provider change handler inlined into select onChange after UI simplification
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function handleDefaultProviderChange(provider: string) {
    if (!config) return;
    setConfig({ ...config, defaultProvider: provider });
  }

  async function handleSaveNotifications() {
    if (!config) return;
    try {
      await updateConfig({ ...config, notifications });
    } catch {
      // save failed
    }
  }

  async function handleTestNotification() {
    setNotifTestResult(null);
    try {
      const result = await testNotification(notifications);
      setNotifTestResult({ success: result.success, error: result.error });
    } catch {
      setNotifTestResult({ success: false, error: '推送失败' });
    }
  }

  async function handleSaveQuotas() {
    if (!config) return;
    try {
      await updateConfig({
        ...config,
        quotas,
        rateLimits,
        retryPolicy,
        cloudMode,
      });
    } catch {
      // save failed
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">加载中…</div>
    );
  }

  if (!config) {
    return <div className="text-center py-8 text-muted-foreground">加载配置失败</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">LLM 配置</h1>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← 返回仪表盘
        </Link>
      </div>

      {/* Global Model Config */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings size={18} />
          <h2 className="text-lg font-semibold">全局模型配置</h2>
        </div>
        <div className="space-y-3 max-w-2xl">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">供应商</label>
            <select
              value={config.defaultProvider}
              onChange={(e) => {
                const providerName = e.target.value;
                const newProviders = config.providers.map((pp) => {
                  if (pp.name !== providerName) return pp;
                  // Auto-fill baseUrl if empty
                  if (!pp.baseUrl) {
                    return { ...pp, baseUrl: getDefaultProviderBaseUrl(providerName) };
                  }
                  return pp;
                });
                // If provider doesn't exist in config yet, create it from preset
                if (!config.providers.some((p) => p.name === providerName)) {
                  const preset = PRESET_PROVIDERS.find((p) => p.name === providerName);
                  newProviders.push({
                    name: providerName,
                    status: 'disconnected',
                    apiKey: '',
                    baseUrl: preset?.baseUrl || '',
                  });
                }
                setConfig({ ...config, defaultProvider: providerName, providers: newProviders });
                setFetchedModels([]);
                setModelsError(null);
              }}
              className="w-full px-3 py-2 rounded border bg-background text-sm"
            >
              {/* 已配置的供应商 */}
              {config.providers.length > 0 && (
                <optgroup label="已配置">
                  {config.providers.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {/* 预设供应商（尚未配置） */}
              {PRESET_PROVIDERS.filter(
                (preset) => !config.providers.some((p) => p.name === preset.name),
              ).length > 0 && (
                <optgroup label="预设">
                  {PRESET_PROVIDERS.filter(
                    (preset) => !config.providers.some((p) => p.name === preset.name),
                  ).map((preset) => (
                    <option key={preset.name} value={preset.name}>
                      {preset.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          {/* Show selected provider details */}
          {config.providers
            .filter((p) => p.name === config.defaultProvider)
            .map((p) => (
              <div key={p.name} className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Base URL</label>
                  <input
                    value={p.baseUrl}
                    onChange={(e) => {
                      const newUrl = e.target.value;
                      setConfig({
                        ...config,
                        providers: config.providers.map((pp) =>
                          pp.name === p.name ? { ...pp, baseUrl: newUrl } : pp,
                        ),
                      });
                    }}
                    placeholder="https://api.example.com/v1"
                    className="w-full px-3 py-2 rounded border bg-background text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">API Key</label>
                  <input
                    type="password"
                    value={p.apiKey}
                    onChange={(e) => {
                      const newKey = e.target.value;
                      setConfig({
                        ...config,
                        providers: config.providers.map((pp) =>
                          pp.name === p.name ? { ...pp, apiKey: newKey } : pp,
                        ),
                      });
                    }}
                    placeholder="输入 API Key"
                    className="w-full px-3 py-2 rounded border bg-background text-sm font-mono"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleFetchModels}
                    disabled={modelsLoading || !p.apiKey || !p.baseUrl}
                    className="px-3 py-2 border rounded text-sm hover:bg-accent whitespace-nowrap flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {modelsLoading ? (
                      <LoaderCircle size={14} className="animate-spin" />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                    获取模型
                  </button>
                  <button
                    title="测试连接"
                    onClick={() =>
                      handleTestProvider({
                        ...p,
                        model: p.model || config.defaultModel,
                      })
                    }
                    className="px-3 py-2 border rounded text-sm hover:bg-accent whitespace-nowrap"
                  >
                    测试连接
                  </button>
                </div>
                {modelsError && (
                  <div className="text-xs px-3 py-1.5 rounded bg-red-50 text-red-700 flex items-center gap-1">
                    <XCircle size={12} />
                    {modelsError}
                  </div>
                )}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">默认模型</label>
                  <select
                    value={config.defaultModel}
                    onChange={(e) => handleDefaultModelChange(e.target.value)}
                    aria-label="默认模型"
                    className="w-full px-3 py-2 rounded border bg-background text-sm"
                  >
                    {fetchedModels.length > 0 ? (
                      fetchedModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))
                    ) : (
                      <option value={config.defaultModel}>{config.defaultModel}</option>
                    )}
                  </select>
                </div>
              </div>
            ))}
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => handleSave(config)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 flex items-center gap-1"
            >
              <Save size={14} />
              保存配置
            </button>
          </div>
          {/* Test result for default provider */}
          {testResult && (
            <div
              className={`text-xs px-3 py-1.5 rounded flex items-center gap-1 ${
                testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {testResult.success ? (
                <>
                  <CheckCircle size={12} />
                  连接成功 ({testResult.latencyMs}ms)
                </>
              ) : (
                <>
                  <XCircle size={12} />
                  连接失败: {testResult.error}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Provider List */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Globe size={18} />
            <h2 className="text-lg font-semibold">Provider 列表</h2>
          </div>
          <button
            onClick={() => setShowAddProvider(true)}
            className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 flex items-center gap-1"
          >
            <Plus size={14} />
            添加 Provider
          </button>
        </div>
        <div className="space-y-3">
          {config.providers.map((p) => (
            <div key={p.name} className="rounded border p-4 bg-background">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium">{p.name}</h3>
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        p.status === 'connected'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Base URL: {p.baseUrl}</p>
                    <p>API Key: {p.apiKey ? p.apiKey.slice(0, 8) + '...' : '未配置'}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    title="编辑 Provider"
                    onClick={() => setEditingProvider(p)}
                    className="p-1.5 rounded hover:bg-accent"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    title="测试连接"
                    onClick={() =>
                      handleTestProvider({
                        ...p,
                        model: p.model || config?.defaultModel,
                      })
                    }
                    className="p-1.5 rounded hover:bg-accent"
                  >
                    <TestTube size={14} />
                  </button>
                  <button
                    title="移除 Provider"
                    onClick={() => handleRemoveProvider(p.name)}
                    className="p-1.5 rounded hover:bg-red-100 text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {/* Test result */}
              {testResult?.provider === p.name && (
                <div
                  className={`mt-2 text-xs px-3 py-1.5 rounded flex items-center gap-1 ${
                    testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                  }`}
                >
                  {testResult.success ? (
                    <>
                      <CheckCircle size={12} />
                      连接成功 ({testResult.latencyMs}ms)
                    </>
                  ) : (
                    <>
                      <XCircle size={12} />
                      连接失败: {testResult.error}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Agent Routing */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={18} />
          <h2 className="text-lg font-semibold">Agent 路由</h2>
        </div>
        <div className="space-y-3">
          {config.agentRouting.map((r) => (
            <div
              key={r.agent}
              className="rounded border p-4 bg-background flex items-center justify-between"
            >
              <div>
                <h3 className="font-medium">{r.agent}</h3>
                <p className="text-xs text-muted-foreground">
                  {r.provider} / {r.model} / temp: {r.temperature}
                </p>
              </div>
              <button
                title="编辑路由"
                onClick={() => setEditingRoute(r)}
                className="p-1.5 rounded hover:bg-accent"
              >
                <Edit2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Notification Configuration */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell size={18} />
          <h2 className="text-lg font-semibold">通知配置</h2>
        </div>
        <div className="space-y-3 max-w-lg">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Telegram Bot Token</label>
            <input
              value={notifications.telegramToken}
              onChange={(e) =>
                setNotifications({ ...notifications, telegramToken: e.target.value })
              }
              placeholder="Bot Token"
              className="w-full px-3 py-2 rounded border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Chat ID</label>
            <div className="flex items-center gap-2">
              <input
                value={notifications.chatId}
                onChange={(e) => setNotifications({ ...notifications, chatId: e.target.value })}
                placeholder="Chat ID"
                className="flex-1 px-3 py-2 rounded border bg-background text-sm"
              />
              <button
                onClick={() => {
                  handleSaveNotifications();
                  handleTestNotification();
                }}
                className="px-3 py-2 border rounded text-sm hover:bg-accent whitespace-nowrap"
              >
                测试推送
              </button>
            </div>
          </div>
          {notifTestResult && (
            <div
              className={`text-xs px-3 py-1.5 rounded flex items-center gap-1 ${
                notifTestResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {notifTestResult.success ? (
                <>
                  <CheckCircle size={12} />
                  推送成功
                </>
              ) : (
                <>
                  <XCircle size={12} />
                  推送失败: {notifTestResult.error}
                </>
              )}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSaveNotifications}
              className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 flex items-center gap-1"
            >
              <Save size={14} />
              保存通知配置
            </button>
          </div>
        </div>
      </div>

      {/* Quota & Rate Limit Configuration */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings size={18} />
          <h2 className="text-lg font-semibold">配额与限速</h2>
        </div>
        <div className="space-y-3 max-w-lg">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                每日 Token 配额 (0=无限制)
              </label>
              <input
                type="number"
                min={0}
                step={1000}
                value={quotas.dailyTokenQuota}
                onChange={(e) => setQuotas({ ...quotas, dailyTokenQuota: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded border bg-background text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">配额告警阈值</label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={quotas.quotaAlertThreshold}
                onChange={(e) =>
                  setQuotas({ ...quotas, quotaAlertThreshold: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded border bg-background text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                RPM 限制 (0=无限制)
              </label>
              <input
                type="number"
                min={0}
                value={rateLimits.rpmLimit}
                onChange={(e) => setRateLimits({ ...rateLimits, rpmLimit: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded border bg-background text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                TPM 限制 (0=无限制)
              </label>
              <input
                type="number"
                min={0}
                value={rateLimits.tpmLimit}
                onChange={(e) => setRateLimits({ ...rateLimits, tpmLimit: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded border bg-background text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">最大重试次数</label>
              <input
                type="number"
                min={0}
                max={10}
                value={retryPolicy.maxAttempts}
                onChange={(e) =>
                  setRetryPolicy({ ...retryPolicy, maxAttempts: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded border bg-background text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">重试间隔 (ms)</label>
              <input
                type="number"
                min={0}
                step={100}
                value={retryPolicy.delayMs}
                onChange={(e) =>
                  setRetryPolicy({ ...retryPolicy, delayMs: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded border bg-background text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="cloud-mode"
              checked={cloudMode}
              onChange={(e) => setCloudMode(e.target.checked)}
              className="rounded border"
            />
            <label htmlFor="cloud-mode" className="text-sm">
              云端模式（启用 RPM 智能间隔与限流保护）
            </label>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSaveQuotas}
              className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 flex items-center gap-1"
            >
              <Save size={14} />
              保存配额配置
            </button>
          </div>
        </div>
      </div>

      {/* Backup Providers Table */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={18} />
          <h2 className="text-lg font-semibold">备用 Provider (故障切换)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium">Provider</th>
                <th className="text-left py-2 px-3 font-medium">API Key</th>
                <th className="text-left py-2 px-3 font-medium">模型</th>
                <th className="text-left py-2 px-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {config.providers.map((p) => (
                <tr key={p.name} className="border-b last:border-0">
                  <td className="py-2 px-3 font-medium">{p.name}</td>
                  <td className="py-2 px-3 text-muted-foreground font-mono">
                    {p.apiKey ? '•'.repeat(13) : 'N/A'}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">{p.name}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        p.status === 'connected'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {p.status === 'connected' ? '● 在线' : '○ 离线'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Provider Modal */}
      {showAddProvider && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border p-6 w-80">
            <h3 className="text-lg font-semibold mb-4">添加 Provider</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">名称</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Provider 名称"
                  className="w-full px-3 py-2 rounded border bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">API Key</label>
                <input
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="API Key"
                  className="w-full px-3 py-2 rounded border bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Base URL</label>
                <input
                  value={newBaseUrl}
                  onChange={(e) => setNewBaseUrl(e.target.value)}
                  placeholder="Base URL"
                  className="w-full px-3 py-2 rounded border bg-background text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={() => setShowAddProvider(false)}
                className="px-4 py-1.5 rounded text-sm hover:bg-accent"
              >
                取消
              </button>
              <button
                onClick={handleAddProvider}
                className="px-4 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90"
              >
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Provider Modal */}
      {editingProvider && (
        <EditProviderModal
          provider={editingProvider}
          onSave={(updated) => handleUpdateProvider(editingProvider, updated)}
          onCancel={() => setEditingProvider(null)}
        />
      )}

      {/* Edit Route Modal */}
      {editingRoute && (
        <EditRouteModal
          route={editingRoute}
          providers={config.providers}
          onSave={(updated) => handleSaveRoute(editingRoute, updated)}
          onCancel={() => setEditingRoute(null)}
        />
      )}
    </div>
  );
}

function EditProviderModal({
  provider,
  onSave,
  onCancel,
}: {
  provider: Provider;
  onSave: (updated: Provider) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(provider.name);
  const [apiKey, setApiKey] = useState(provider.apiKey);
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl);
  const [model, setModel] = useState(provider.model ?? '');

  function handleSave() {
    onSave({
      ...provider,
      name: name.trim() || provider.name,
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim() || provider.baseUrl,
      model: model.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg border p-6 w-96">
        <h3 className="text-lg font-semibold mb-4">编辑 Provider</h3>
        <p className="text-sm font-medium mb-4 text-muted-foreground">{provider.name}</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="输入 API Key"
              className="w-full px-3 py-2 rounded border bg-background text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Base URL</label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              className="w-full px-3 py-2 rounded border bg-background text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">默认模型</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="例如：gpt-4o"
              className="w-full px-3 py-2 rounded border bg-background text-sm"
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onCancel} className="px-4 py-1.5 rounded text-sm hover:bg-accent">
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 flex items-center gap-1"
          >
            <Save size={14} />
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function EditRouteModal({
  route,
  providers,
  onSave,
  onCancel,
}: {
  route: AgentRoute;
  providers: Provider[];
  onSave: (updated: AgentRoute) => void;
  onCancel: () => void;
}) {
  const [model, setModel] = useState(route.model);
  const [provider, setProvider] = useState(route.provider);
  const [temperature, setTemperature] = useState(route.temperature.toString());
  const [maxTokens, setMaxTokens] = useState(route.maxTokens?.toString() ?? '');

  function handleSave() {
    onSave({
      ...route,
      model,
      provider,
      temperature: Number(temperature),
      maxTokens: maxTokens.trim() ? Number(maxTokens) : undefined,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg border p-6 w-80">
        <h3 className="text-lg font-semibold mb-4">编辑 Agent 路由</h3>
        <p className="text-sm font-medium mb-4">{route.agent}</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full px-3 py-2 rounded border bg-background text-sm"
            >
              {providers
                .filter((p) => p.status === 'connected')
                .map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">模型</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 rounded border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Temperature</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              placeholder="Temperature"
              className="w-full px-3 py-2 rounded border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Max Tokens</label>
            <input
              type="number"
              min="1"
              max="128000"
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              placeholder="留空表示使用默认值"
              className="w-full px-3 py-2 rounded border bg-background text-sm"
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onCancel} className="px-4 py-1.5 rounded text-sm hover:bg-accent">
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 flex items-center gap-1"
          >
            <Save size={14} />
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

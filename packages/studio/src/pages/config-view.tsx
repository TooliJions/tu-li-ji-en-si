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
} from 'lucide-react';
import { fetchConfig, updateConfig, testProvider } from '../lib/api';

interface Provider {
  name: string;
  status: string;
  apiKey: string;
  baseUrl: string;
}

interface AgentRoute {
  agent: string;
  model: string;
  provider: string;
  temperature: number;
}

interface Config {
  defaultProvider: string;
  defaultModel: string;
  agentRouting: AgentRoute[];
  providers: Provider[];
}

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

  // Test result
  const [testResult, setTestResult] = useState<{
    provider: string;
    success: boolean;
    latencyMs?: number;
    error?: string;
  } | null>(null);

  // Notification config
  const [notifications, setNotifications] = useState({
    telegram: false,
    feishu: false,
    webhook: false,
    webhookUrl: '',
  });

  useEffect(() => {
    fetchConfig()
      .then((c) => setConfig(c))
      .catch(() => {
        // load failed
      })
      .finally(() => setLoading(false));
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

  function handleDefaultModelChange(model: string) {
    if (!config) return;
    setConfig({ ...config, defaultModel: model });
  }

  function handleDefaultProviderChange(provider: string) {
    if (!config) return;
    setConfig({ ...config, defaultProvider: provider });
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

      {/* Global Settings */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings size={18} />
          <h2 className="text-lg font-semibold">全局设置</h2>
        </div>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">默认 Provider</label>
            <select
              value={config.defaultProvider}
              onChange={(e) => handleDefaultProviderChange(e.target.value)}
              className="px-3 py-2 rounded border bg-background text-sm"
            >
              {config.providers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">默认模型</label>
            <select
              value={config.defaultModel}
              onChange={(e) => handleDefaultModelChange(e.target.value)}
              aria-label="默认模型"
              className="px-3 py-2 rounded border bg-background text-sm"
            >
              {config.providers
                .filter((p) => p.status === 'connected')
                .map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
          <button
            onClick={() => handleSave(config)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 flex items-center gap-1"
          >
            <Save size={14} />
            保存配置
          </button>
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
                    title="测试连接"
                    onClick={() => handleTestProvider(p)}
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
        <div className="space-y-4">
          <div className="flex items-center justify-between py-2 border-b last:border-0">
            <div>
              <p className="font-medium text-sm">Telegram</p>
              <p className="text-xs text-muted-foreground">通过 Telegram Bot 推送流水线状态</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notifications.telegram}
                onChange={(e) => setNotifications({ ...notifications, telegram: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
          <div className="flex items-center justify-between py-2 border-b last:border-0">
            <div>
              <p className="font-medium text-sm">飞书</p>
              <p className="text-xs text-muted-foreground">通过飞书 Webhook 推送消息</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notifications.feishu}
                onChange={(e) => setNotifications({ ...notifications, feishu: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
          <div className="flex items-center justify-between py-2 border-b last:border-0">
            <div>
              <p className="font-medium text-sm">自定义 Webhook</p>
              <p className="text-xs text-muted-foreground">通用 HTTP Webhook 推送</p>
            </div>
            <div className="flex items-center gap-2">
              {notifications.webhook && (
                <input
                  value={notifications.webhookUrl}
                  onChange={(e) =>
                    setNotifications({ ...notifications, webhookUrl: e.target.value })
                  }
                  placeholder="https://example.com/webhook"
                  className="px-2 py-1 rounded border bg-background text-xs w-48"
                />
              )}
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifications.webhook}
                  onChange={(e) =>
                    setNotifications({ ...notifications, webhook: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Backup Providers Table */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={18} />
          <h2 className="text-lg font-semibold">备用 Provider（故障切换）</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium">Provider</th>
                <th className="text-left py-2 px-3 font-medium">API Key</th>
                <th className="text-left py-2 px-3 font-medium">Base URL</th>
                <th className="text-left py-2 px-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {config.providers.map((p) => (
                <tr key={p.name} className="border-b last:border-0">
                  <td className="py-2 px-3 font-medium">{p.name}</td>
                  <td className="py-2 px-3 text-muted-foreground">
                    {p.apiKey ? '•'.repeat(8) + p.apiKey.slice(-4) : 'N/A'}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground truncate max-w-[200px]">
                    {p.baseUrl || '-'}
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        p.status === 'connected'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {p.status === 'connected' ? '可用' : '不可用'}
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

  function handleSave() {
    onSave({
      ...route,
      model,
      provider,
      temperature: Number(temperature),
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

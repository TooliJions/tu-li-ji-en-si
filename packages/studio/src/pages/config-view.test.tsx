import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../lib/api', () => ({
  fetchConfig: vi.fn(),
  updateConfig: vi.fn(),
  testProvider: vi.fn(),
}));

import * as api from '../lib/api';
import ConfigView from './config-view';

const mockConfig = {
  defaultProvider: 'DashScope',
  defaultModel: 'DashScope',
  agentRouting: [
    { agent: 'Writer', model: 'qwen3.6-plus', provider: 'DashScope', temperature: 0.8 },
    { agent: 'Auditor', model: 'gpt-4o', provider: 'OpenAI', temperature: 0.2 },
    { agent: 'Planner', model: 'qwen3.6-plus', provider: 'DashScope', temperature: 0.7 },
  ],
  providers: [
    {
      name: 'DashScope',
      status: 'connected',
      apiKey: 'sk-dashscope-xxx',
      baseUrl: 'https://dashscope.aliyuncs.com',
    },
    {
      name: 'OpenAI',
      status: 'connected',
      apiKey: 'sk-openai-xxx',
      baseUrl: 'https://api.openai.com',
    },
    {
      name: 'Gemini',
      status: 'disconnected',
      apiKey: '',
      baseUrl: 'https://generativelanguage.googleapis.com',
    },
  ],
};

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/config']}>
      <Routes>
        <Route path="/config" element={<ConfigView />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ConfigView Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state', () => {
    vi.mocked(api.fetchConfig).mockResolvedValue(mockConfig);

    renderWithRouter();

    expect(screen.getByText('加载中…')).toBeTruthy();
  });

  it('renders configuration page title', async () => {
    vi.mocked(api.fetchConfig).mockResolvedValue(mockConfig);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('LLM 配置')).toBeTruthy();
    });
  });

  it('displays default provider and model', async () => {
    vi.mocked(api.fetchConfig).mockResolvedValue(mockConfig);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('LLM 配置')).toBeTruthy();
    });

    // DashScope appears multiple times (default select + provider list + agent routing)
    expect(screen.getAllByText('DashScope').length).toBeGreaterThanOrEqual(1);
    // Default model select value matches defaultModel (provider name)
    const modelSelect = screen.getByLabelText('默认模型');
    expect((modelSelect as HTMLSelectElement).value).toBe('DashScope');
  });

  it('shows provider list with status badges', async () => {
    vi.mocked(api.fetchConfig).mockResolvedValue(mockConfig);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('LLM 配置')).toBeTruthy();
    });

    // Providers appear in provider list cards
    expect(screen.getAllByText('DashScope').length).toBeGreaterThanOrEqual(2); // default + provider list
    expect(screen.getAllByText('OpenAI').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Gemini').length).toBeGreaterThanOrEqual(1);

    // Status badges
    expect(screen.getAllByText('connected').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('disconnected').length).toBeGreaterThanOrEqual(1);
  });

  it('shows agent routing table', async () => {
    vi.mocked(api.fetchConfig).mockResolvedValue(mockConfig);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('LLM 配置')).toBeTruthy();
    });

    expect(screen.getByText('Writer')).toBeTruthy();
    expect(screen.getByText('Auditor')).toBeTruthy();
    expect(screen.getByText('Planner')).toBeTruthy();
  });

  it('tests provider connection', async () => {
    vi.mocked(api.fetchConfig).mockResolvedValue(mockConfig);
    vi.mocked(api.testProvider).mockResolvedValue({ success: true, latencyMs: 320 });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('LLM 配置')).toBeTruthy();
    });

    // Click test button on a provider
    const testButtons = screen.getAllByTitle('测试连接');
    expect(testButtons.length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      fireEvent.click(testButtons[0]);
    });

    await waitFor(() => {
      expect(api.testProvider).toHaveBeenCalled();
    });
  });

  it('adds a new provider', async () => {
    vi.mocked(api.fetchConfig).mockResolvedValue(mockConfig);
    vi.mocked(api.updateConfig).mockResolvedValue({
      ...mockConfig,
      providers: [
        ...mockConfig.providers,
        {
          name: 'NewProvider',
          status: 'connected',
          apiKey: 'sk-new',
          baseUrl: 'https://api.new.com',
        },
      ],
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('LLM 配置')).toBeTruthy();
    });

    // Click add provider button
    await act(async () => {
      fireEvent.click(screen.getByText('添加 Provider'));
    });

    // Fill form
    const nameInput = screen.getByPlaceholderText('Provider 名称');
    fireEvent.change(nameInput, { target: { value: 'NewProvider' } });

    const apiKeyInput = screen.getByPlaceholderText('API Key');
    fireEvent.change(apiKeyInput, { target: { value: 'sk-new' } });

    const baseUrlInput = screen.getByPlaceholderText('Base URL');
    fireEvent.change(baseUrlInput, { target: { value: 'https://api.new.com' } });

    await act(async () => {
      fireEvent.click(screen.getByText('确认添加'));
    });

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalled();
    });
  });

  it('removes a provider', async () => {
    vi.mocked(api.fetchConfig).mockResolvedValue(mockConfig);
    vi.mocked(api.updateConfig).mockResolvedValue({
      ...mockConfig,
      providers: mockConfig.providers.filter((p) => p.name !== 'Gemini'),
    });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('LLM 配置')).toBeTruthy();
    });

    // Click remove button on Gemini provider
    const removeButtons = screen.getAllByTitle('移除 Provider');
    expect(removeButtons.length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      fireEvent.click(removeButtons[0]);
    });

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalled();
    });
  });

  it('edits agent routing configuration', async () => {
    vi.mocked(api.fetchConfig).mockResolvedValue(mockConfig);
    vi.mocked(api.updateConfig).mockResolvedValue(mockConfig);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('LLM 配置')).toBeTruthy();
    });

    // Click edit on first routing entry
    const editButtons = screen.getAllByTitle('编辑路由');
    expect(editButtons.length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      fireEvent.click(editButtons[0]);
    });

    // Edit temperature
    const tempInput = screen.getByPlaceholderText('Temperature');
    fireEvent.change(tempInput, { target: { value: '0.9' } });

    await act(async () => {
      fireEvent.click(screen.getByText('保存'));
    });

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalled();
    });
  });

  it('saves global config changes', async () => {
    vi.mocked(api.fetchConfig).mockResolvedValue(mockConfig);
    vi.mocked(api.updateConfig).mockResolvedValue(mockConfig);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('LLM 配置')).toBeTruthy();
    });

    // Change default model
    const modelSelect = screen.getByLabelText('默认模型');
    fireEvent.change(modelSelect, { target: { value: 'gpt-4o' } });

    // Click save
    await act(async () => {
      fireEvent.click(screen.getByText('保存配置'));
    });

    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalled();
    });
  });

  it('shows test result success', async () => {
    vi.mocked(api.fetchConfig).mockResolvedValue(mockConfig);
    vi.mocked(api.testProvider).mockResolvedValue({ success: true, latencyMs: 320 });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('LLM 配置')).toBeTruthy();
    });

    const testButtons = screen.getAllByTitle('测试连接');

    await act(async () => {
      fireEvent.click(testButtons[0]);
    });

    await waitFor(() => {
      expect(screen.getByText(/连接成功|320ms/)).toBeTruthy();
    });
  });

  it('shows test result failure', async () => {
    vi.mocked(api.fetchConfig).mockResolvedValue(mockConfig);
    vi.mocked(api.testProvider).mockResolvedValue({ success: false, error: 'Invalid API key' });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('LLM 配置')).toBeTruthy();
    });

    const testButtons = screen.getAllByTitle('测试连接');

    await act(async () => {
      fireEvent.click(testButtons[0]);
    });

    await waitFor(() => {
      expect(screen.getByText(/连接失败|Invalid API key/)).toBeTruthy();
    });
  });
});

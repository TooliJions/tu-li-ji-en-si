import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createNotifier,
  type NotifyChannel,
  type NotifyEvent,
} from './index';

// ─── Mock helpers ────────────────────────────────────────────────

function mockFetch(response: { ok: boolean; status?: number; json?: () => Promise<unknown> }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? 200,
    json: response.json ?? (() => Promise.resolve({})),
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch({ ok: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Telegram ────────────────────────────────────────────────────

describe('Telegram channel', () => {
  const telegramConfig: NotifyChannel = {
    type: 'telegram',
    botToken: '123456:ABC-DEF',
    chatId: '-1001234567890',
  };

  const event: NotifyEvent = {
    type: 'chapter_complete',
    title: '第一章',
    bookTitle: '测试小说',
    chapterNumber: 1,
    wordCount: 3000,
    message: '第一章写作完成，3000字',
  };

  it('sends a message to Telegram API', async () => {
    const notifier = createNotifier(telegramConfig);
    const result = await notifier.send(event);

    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/bot123456:ABC-DEF/sendMessage',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('-1001234567890'),
      })
    );
  });

  it('includes book and chapter info in message', async () => {
    const notifier = createNotifier(telegramConfig);
    await notifier.send(event);

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.text).toContain('测试小说');
    expect(body.text).toContain('第一章');
    expect(body.text).toContain('3000字');
  });

  it('returns failure on network error', async () => {
    vi.stubGlobal('fetch', mockFetch({ ok: false, status: 400 }));
    const notifier = createNotifier(telegramConfig);
    const result = await notifier.send(event);

    expect(result.success).toBe(false);
  });

  it('handles missing optional fields', async () => {
    const minimalEvent: NotifyEvent = {
      type: 'daemon_start',
      message: '守护进程启动',
    };
    const notifier = createNotifier(telegramConfig);
    const result = await notifier.send(minimalEvent);

    expect(result.success).toBe(true);
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.text).toContain('守护进程启动');
  });
});

// ─── Webhook ─────────────────────────────────────────────────────

describe('Webhook channel', () => {
  const webhookConfig: NotifyChannel = {
    type: 'webhook',
    url: 'https://example.com/hooks/notify',
  };

  const event: NotifyEvent = {
    type: 'chapter_complete',
    title: '第二章',
    bookTitle: '测试',
    chapterNumber: 2,
    wordCount: 2500,
    message: '第二章完成',
  };

  it('POSTs JSON to webhook URL', async () => {
    const notifier = createNotifier(webhookConfig);
    const result = await notifier.send(event);

    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/hooks/notify',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('chapter_complete'),
      })
    );
  });

  it('includes full event payload in body', async () => {
    const notifier = createNotifier(webhookConfig);
    await notifier.send(event);

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.type).toBe('chapter_complete');
    expect(body.message).toBe('第二章完成');
    expect(body.wordCount).toBe(2500);
  });

  it('returns failure on error response', async () => {
    vi.stubGlobal('fetch', mockFetch({ ok: false, status: 500 }));
    const notifier = createNotifier(webhookConfig);
    const result = await notifier.send(event);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ─── Feishu (飞书) ───────────────────────────────────────────────

describe('Feishu channel', () => {
  const feishuConfig: NotifyChannel = {
    type: 'feishu',
    webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/abc123',
  };

  const event: NotifyEvent = {
    type: 'quota_exhausted',
    message: 'API配额已耗尽',
  };

  it('sends to Feishu webhook', async () => {
    const notifier = createNotifier(feishuConfig);
    const result = await notifier.send(event);

    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://open.feishu.cn/open-apis/bot/v2/hook/abc123',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('uses Feishu msg_type text format', async () => {
    const notifier = createNotifier(feishuConfig);
    await notifier.send(event);

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.msg_type).toBe('text');
    expect(body.content.text).toContain('API配额已耗尽');
  });

  it('returns failure on error', async () => {
    vi.stubGlobal('fetch', mockFetch({ ok: false, status: 403 }));
    const notifier = createNotifier(feishuConfig);
    const result = await notifier.send(event);

    expect(result.success).toBe(false);
  });
});

// ─── WeCom (企业微信) ────────────────────────────────────────────

describe('WeCom channel', () => {
  const wecomConfig: NotifyChannel = {
    type: 'wecom',
    webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc123',
  };

  const event: NotifyEvent = {
    type: 'daemon_stop',
    message: '守护进程已停止',
  };

  it('sends to WeCom webhook', async () => {
    const notifier = createNotifier(wecomConfig);
    const result = await notifier.send(event);

    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc123',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('uses WeCom msgtype text format', async () => {
    const notifier = createNotifier(wecomConfig);
    await notifier.send(event);

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.msgtype).toBe('text');
    expect(body.text.content).toContain('守护进程已停止');
  });

  it('returns failure on error', async () => {
    vi.stubGlobal('fetch', mockFetch({ ok: false, status: 400 }));
    const notifier = createNotifier(wecomConfig);
    const result = await notifier.send(event);

    expect(result.success).toBe(false);
  });
});

// ─── Multi-channel ──────────────────────────────────────────────

describe('Multi-channel notifier', () => {
  const channels: NotifyChannel[] = [
    { type: 'telegram', botToken: 'tok', chatId: '123' },
    { type: 'webhook', url: 'https://example.com/hook' },
  ];

  const event: NotifyEvent = {
    type: 'daemon_start',
    message: '系统启动',
  };

  it('sends to all channels', async () => {
    const notifier = createNotifier(channels);
    const results = await notifier.sendAll(event);

    expect(results.length).toBe(2);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it('returns individual results even if some fail', async () => {
    const mixedChannels: NotifyChannel[] = [
      { type: 'telegram', botToken: 'tok', chatId: '123' },
      { type: 'webhook', url: 'https://bad-url.invalid' },
    ];

    // Make second call fail
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.toString().includes('bad-url')) {
        return { ok: false, status: 500, json: () => Promise.resolve({}) };
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) };
    });

    const notifier = createNotifier(mixedChannels);
    const results = await notifier.sendAll(event);

    expect(results.length).toBe(2);
    expect(results.some((r) => r.success)).toBe(true);
    expect(results.some((r) => !r.success)).toBe(true);
  });
});

// ─── Test ping ──────────────────────────────────────────────────

describe('testPing', () => {
  it('sends a test message via Telegram', async () => {
    const config: NotifyChannel = { type: 'telegram', botToken: 'tok', chatId: '123' };
    const notifier = createNotifier(config);
    const result = await notifier.testPing();

    expect(result.success).toBe(true);
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.text).toContain('测试');
  });

  it('sends a test message via Webhook', async () => {
    const config: NotifyChannel = { type: 'webhook', url: 'https://example.com/hook' };
    const notifier = createNotifier(config);
    const result = await notifier.testPing();

    expect(result.success).toBe(true);
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.message).toContain('测试');
  });
});

// ─── Disabled / empty config ────────────────────────────────────

describe('Disabled config', () => {
  it('returns success without calling fetch when no channels', async () => {
    const notifier = createNotifier([]);
    const event: NotifyEvent = { type: 'daemon_start', message: 'test' };
    const result = await notifier.send(event);

    expect(result.success).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns success without calling fetch for multi-channel', async () => {
    const notifier = createNotifier([]);
    const event: NotifyEvent = { type: 'daemon_start', message: 'test' };
    const results = await notifier.sendAll(event);

    expect(results).toEqual([]);
  });
});

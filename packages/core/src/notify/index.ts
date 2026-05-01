// ─── Types ──────────────────────────────────────────────────────

export type NotifyEventType =
  | 'daemon_start'
  | 'daemon_pause'
  | 'daemon_stop'
  | 'daemon_resume'
  | 'chapter_complete'
  | 'quota_exhausted'
  | 'rpm_throttled'
  | 'error'
  | 'hook_wake'
  | 'custom';

export interface NotifyEvent {
  type: NotifyEventType | string;
  title?: string;
  bookTitle?: string;
  chapterNumber?: number;
  wordCount?: number;
  message: string;
}

export interface NotifyResult {
  success: boolean;
  error?: string;
  channel: string;
}

// Channel definitions
export interface TelegramConfig {
  type: 'telegram';
  botToken: string;
  chatId: string;
}

export interface WebhookConfig {
  type: 'webhook';
  url: string;
}

export interface FeishuConfig {
  type: 'feishu';
  webhookUrl: string;
}

export interface WeComConfig {
  type: 'wecom';
  webhookUrl: string;
}

export type NotifyChannel = TelegramConfig | WebhookConfig | FeishuConfig | WeComConfig;

// ─── Message formatting ─────────────────────────────────────────

function formatEventMessage(event: NotifyEvent): string {
  const parts: string[] = [];

  if (event.bookTitle) {
    parts.push(`《${event.bookTitle}》`);
  }
  if (event.title) {
    parts.push(event.title);
  }
  if (event.chapterNumber != null) {
    parts.push(`第${event.chapterNumber}章`);
  }
  if (event.wordCount != null) {
    parts.push(`${event.wordCount}字`);
  }

  const header = parts.length > 0 ? parts.join(' · ') + '\n' : '';
  return `${header}${event.message}`;
}

// ─── Helpers ────────────────────────────────────────────────────

const NOTIFY_TIMEOUT_MS = 10000;
const MAX_RETRIES = 3;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  channel: string,
): Promise<NotifyResult> {
  let lastError: string | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NOTIFY_TIMEOUT_MS);

    try {
      const resp = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        lastError = `${channel} API ${resp.status}`;
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
          continue;
        }
        return { success: false, error: lastError, channel };
      }
      return { success: true, channel };
    } catch (err: unknown) {
      clearTimeout(timeout);
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        continue;
      }
    }
  }

  console.error(`[notify] ${channel} 发送失败，已重试 ${MAX_RETRIES} 次: ${lastError}`);
  return { success: false, error: lastError, channel };
}

// ─── Channel senders ────────────────────────────────────────────

async function sendTelegram(config: TelegramConfig, text: string): Promise<NotifyResult> {
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  return fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: 'HTML',
      }),
    },
    'telegram',
  );
}

async function sendWebhook(config: WebhookConfig, event: NotifyEvent): Promise<NotifyResult> {
  return fetchWithRetry(
    config.url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    },
    'webhook',
  );
}

async function sendFeishu(config: FeishuConfig, text: string): Promise<NotifyResult> {
  return fetchWithRetry(
    config.webhookUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msg_type: 'text',
        content: { text },
      }),
    },
    'feishu',
  );
}

async function sendWeCom(config: WeComConfig, text: string): Promise<NotifyResult> {
  return fetchWithRetry(
    config.webhookUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'text',
        text: { content: text },
      }),
    },
    'wecom',
  );
}

// ─── Dispatcher ─────────────────────────────────────────────────

async function sendToChannel(channel: NotifyChannel, event: NotifyEvent): Promise<NotifyResult> {
  const text = formatEventMessage(event);

  switch (channel.type) {
    case 'telegram':
      return sendTelegram(channel, text);
    case 'webhook':
      return sendWebhook(channel, event);
    case 'feishu':
      return sendFeishu(channel, text);
    case 'wecom':
      return sendWeCom(channel, text);
  }
}

// ─── Notifier interface ─────────────────────────────────────────

export interface Notifier {
  send(event: NotifyEvent): Promise<NotifyResult>;
  sendAll(event: NotifyEvent): Promise<NotifyResult[]>;
  testPing(): Promise<NotifyResult>;
}

class MultiNotifier implements Notifier {
  private channels: NotifyChannel[];

  constructor(channels: NotifyChannel[]) {
    this.channels = channels;
  }

  async send(event: NotifyEvent): Promise<NotifyResult> {
    if (this.channels.length === 0) {
      return { success: true, channel: 'none' };
    }
    // Send to first channel for single-send
    const result = await sendToChannel(this.channels[0], event);
    return result;
  }

  async sendAll(event: NotifyEvent): Promise<NotifyResult[]> {
    const results: NotifyResult[] = [];
    for (const ch of this.channels) {
      const result = await sendToChannel(ch, event);
      results.push(result);
    }
    return results;
  }

  async testPing(): Promise<NotifyResult> {
    if (this.channels.length === 0) {
      return { success: true, channel: 'none' };
    }
    const testEvent: NotifyEvent = {
      type: 'custom',
      message: '测试通知 — CyberNovelist 连接正常',
    };
    return this.send(testEvent);
  }
}

// ─── Factory ────────────────────────────────────────────────────

export function createNotifier(channels: NotifyChannel | NotifyChannel[]): Notifier {
  const list = Array.isArray(channels) ? channels : [channels];
  return new MultiNotifier(list);
}

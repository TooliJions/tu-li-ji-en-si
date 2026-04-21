import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Send, Bot, User, History, RotateCcw } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

async function sendCommand(bookId: string, message: string) {
  const res = await fetch(`/api/books/${bookId}/natural-agent/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error('指令执行失败');
  const data = await res.json();
  return data.data;
}

async function sendQuestion(bookId: string, question: string) {
  const res = await fetch(`/api/books/${bookId}/natural-agent/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error('提问失败');
  const data = await res.json();
  return data.data;
}

async function fetchHistory(bookId: string): Promise<Message[]> {
  const res = await fetch(`/api/books/${bookId}/natural-agent/history`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.data?.messages ?? [];
}

type Mode = 'command' | 'ask';

export default function NaturalAgentPage() {
  const [searchParams] = useSearchParams();
  const bookId = searchParams.get('bookId') ?? '';

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('ask');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bookId) return;
    fetchHistory(bookId)
      .then(setMessages)
      .catch(() => {});
  }, [bookId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || !bookId || sending) return;
    const userMessage = input.trim();
    setInput('');
    setError(null);
    setSending(true);

    const userEntry: Message = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userEntry]);

    try {
      let result: { answer?: string; rawMessage?: string; actions?: unknown[] };
      if (mode === 'ask') {
        result = await sendQuestion(bookId, userMessage);
      } else {
        result = await sendCommand(bookId, userMessage);
      }

      const replyContent =
        result.answer ??
        (result.actions
          ? `已执行指令，共 ${(result.actions as unknown[]).length} 个操作。`
          : '操作完成。');

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: replyContent, timestamp: new Date().toISOString() },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
      setMessages((prev) => prev.slice(0, -1));
      setInput(userMessage);
    } finally {
      setSending(false);
    }
  }

  if (!bookId) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
        <Bot size={40} className="mb-4 opacity-40" />
        <p className="text-sm">请先在侧边栏选择一本书，再使用自然语言 Agent。</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-card">
        <div className="flex items-center gap-2">
          <Bot size={20} />
          <h1 className="font-semibold text-base">自然语言 Agent</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">模式：</span>
          <button
            onClick={() => setMode('ask')}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              mode === 'ask'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-accent'
            }`}
          >
            提问
          </button>
          <button
            onClick={() => setMode('command')}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              mode === 'command'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-accent'
            }`}
          >
            指令
          </button>
          <button
            onClick={() =>
              fetchHistory(bookId)
                .then(setMessages)
                .catch(() => {})
            }
            className="ml-2 p-1.5 rounded hover:bg-accent text-muted-foreground"
            title="刷新历史"
          >
            <History size={15} />
          </button>
          <button
            onClick={() => setMessages([])}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground"
            title="清空对话"
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <Bot size={36} className="mb-3 opacity-30" />
            <p className="text-sm font-medium">用自然语言指挥创作</p>
            <p className="text-xs mt-1 max-w-xs">
              {mode === 'ask'
                ? '试试「林晨现在的心理状态是什么？」'
                : '试试「润色第 45 章林晨的对话部分」'}
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot size={16} className="text-primary" />
              </div>
            )}
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-tr-sm'
                  : 'bg-muted rounded-tl-sm'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <p className="text-[10px] opacity-50 mt-1 text-right">
                {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            {msg.role === 'user' && (
              <div className="shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                <User size={16} />
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className="flex gap-3 justify-start">
            <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot size={16} className="text-primary" />
            </div>
            <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-6 mb-2 px-3 py-2 rounded bg-destructive/10 text-destructive text-xs">
          {error}
        </div>
      )}

      {/* 输入区 */}
      <div className="px-6 pb-6">
        <div className="flex gap-2 items-end border rounded-xl bg-card p-2 shadow-sm">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={mode === 'ask' ? '问一个关于书籍状态的问题…' : '输入自然语言指令…'}
            rows={2}
            className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground px-2 py-1"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="shrink-0 p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5 pl-1">
          Enter 发送 · Shift+Enter 换行 · 当前模式：{mode === 'ask' ? '提问' : '指令'}
        </p>
      </div>
    </div>
  );
}

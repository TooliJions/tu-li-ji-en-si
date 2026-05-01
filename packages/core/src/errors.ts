// ─── CyberNovelist 统一错误类型 ─────────────────────────────────
// 所有业务模块应使用子类替代原生 Error，便于错误溯源和分类处理

export class CyberNovelistError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class StateError extends CyberNovelistError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'STATE_ERROR', context);
    this.name = 'StateError';
  }
}

export class ChapterError extends CyberNovelistError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CHAPTER_ERROR', context);
    this.name = 'ChapterError';
  }
}

export class AgentError extends CyberNovelistError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AGENT_ERROR', context);
    this.name = 'AgentError';
  }
}

export class PipelineError extends CyberNovelistError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'PIPELINE_ERROR', context);
    this.name = 'PipelineError';
  }
}

export class SecurityError extends CyberNovelistError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'SECURITY_ERROR', context);
    this.name = 'SecurityError';
  }
}

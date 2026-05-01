import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] 捕获到渲染错误:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
          <div className="max-w-md rounded-lg bg-white p-8 shadow-lg">
            <h1 className="mb-4 text-xl font-bold text-red-600">页面发生错误</h1>
            <p className="mb-4 text-gray-600">
              应用遇到未预期的渲染错误。请刷新页面重试，或联系开发者。
            </p>
            <details className="mb-4 rounded bg-gray-100 p-3 text-sm text-gray-700">
              <summary className="cursor-pointer font-medium">查看错误详情</summary>
              <pre className="mt-2 whitespace-pre-wrap break-all text-xs">
                {this.state.error?.message}
              </pre>
            </details>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('AgriLink ZM uncaught component error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetAndReload = () => {
    try {
      localStorage.removeItem('agrilink_auth_token');
      localStorage.removeItem('agrilink_user_id');
    } catch {
      // ignore
    }
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F4F6F3] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-[#E5E7EB] p-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-[#FEF3C7] flex items-center justify-center text-[#D97706] mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-[#111827]">Marketplace Temporarily Unavailable</h1>
            <p className="mt-2 text-sm text-[#4B5563]">
              An unexpected issue occurred while rendering this view. You can reload the page or return to the marketplace home.
            </p>
            {this.state.error?.message && (
              <div className="mt-4 p-2.5 bg-[#F9FAFB] rounded text-left font-mono text-xs text-[#6B7280] overflow-x-auto max-h-24">
                {this.state.error.message}
              </div>
            )}
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#1B5E20] px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-[#154A19] transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </button>
              <button
                type="button"
                onClick={this.handleResetAndReload}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors"
              >
                <Home className="w-4 h-4" />
                Return to Marketplace Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

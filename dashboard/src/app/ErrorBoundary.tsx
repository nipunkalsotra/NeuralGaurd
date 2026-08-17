// src/app/ErrorBoundary.tsx
// Fixes finding #16 — previously one throw anywhere (e.g. inside
// ReactFlow) blanked the entire page with a white screen. React error
// boundaries must be class components; this is the only class in the
// codebase for exactly that reason.
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("NeuralGuard crashed:", error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-canvas px-6">
          <div className="max-w-md text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-state-escalated mb-3">Something broke</p>
            <h1 className="text-2xl font-semibold text-text-primary mb-3">
              This page hit an unexpected error
            </h1>
            <p className="text-sm text-text-secondary mb-8">
              {this.state.error.message || "An unrecoverable rendering error occurred."}
            </p>
            <button
              onClick={this.handleReset}
              className="px-5 py-2.5 rounded-full bg-accent text-white text-sm font-medium hover:bg-accent-2 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

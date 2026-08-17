// src/app/Footer.tsx
export default function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-6 py-14 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <svg width="16" height="16" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <circle cx="16" cy="16" r="10.5" stroke="currentColor" strokeWidth="1.6" className="text-accent" />
              <circle cx="16" cy="16" r="5.5" className="fill-accent" />
            </svg>
            <span className="text-sm font-semibold text-text-primary">NeuralGuard</span>
          </div>
          <p className="text-xs text-text-tertiary max-w-xs">
            A self-healing agentic workflow orchestrator. Built by Nipun and Shreshtha.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-3 text-xs text-text-secondary">
          <a href="/how-it-works" className="hover:text-text-primary transition-colors">How it works</a>
          <a href="/architecture" className="hover:text-text-primary transition-colors">Architecture</a>
          <a href="/fallbacks" className="hover:text-text-primary transition-colors">Fallbacks</a>
          <a href="/dashboard" className="hover:text-text-primary transition-colors">Control plane</a>
          <a href="/about" className="hover:text-text-primary transition-colors">About</a>
          <a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-text-primary transition-colors">GitHub ↗</a>
        </div>
      </div>
    </footer>
  );
}

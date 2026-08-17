import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center px-6 text-center">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-accent mb-3">404</p>
        <h1 className="text-3xl font-semibold text-text-primary mb-4">Page not found</h1>
        <Link to="/" className="text-sm text-accent hover:text-accent-2 transition-colors">
          ← Back to NeuralGuard
        </Link>
      </div>
    </div>
  );
}

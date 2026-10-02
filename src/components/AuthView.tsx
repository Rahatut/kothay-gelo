import React, { useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { authApi } from '../lib/api';

interface AuthViewProps {
  onAuthenticated: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (mode === 'register') {
        await authApi.register(email, password);
      } else {
        await authApi.login(email, password);
      }
      onAuthenticated();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Could not sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex-1 grid place-items-center band-compact">
      <section className="shell w-full max-w-lg">
        <div className="feature-card p-7 sm:p-10">
          <div className="flex items-center gap-2 mb-6">
            <span className="badge-pill"><LockKeyhole className="w-3.5 h-3.5" aria-hidden="true" /> Your ledger</span>
            <span className="type-caption text-muted">Private by account</span>
          </div>
          <h1 className="type-display-md text-ink">See where it went.</h1>
          <p className="type-body-md text-body mt-3 mb-8">
            {mode === 'register'
              ? 'Create an account to keep your statements, evidence, and clues together.'
              : 'Sign in to return to your financial investigation desk.'}
          </p>

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="type-caption text-muted">Email</span>
              <input className="text-input mt-1 w-full" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
            </label>
            <label className="block">
              <span className="type-caption text-muted">Password</span>
              <input className="text-input mt-1 w-full" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
            </label>
            {error && <p className="type-caption text-error" role="alert">{error}</p>}
            <button className="btn-primary w-full justify-center" type="submit" disabled={isSubmitting}>
              <span>{isSubmitting ? 'Working...' : mode === 'register' ? 'Create account' : 'Sign in'}</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>

          <button type="button" className="btn-text mt-6" onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(null); }}>
            {mode === 'register' ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </button>
        </div>
      </section>
    </main>
  );
};
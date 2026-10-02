import React from 'react';

/**
 * Catches a render failure in one part of the tree and shows a sentence about it.
 *
 * This exists because of what happened twice in one afternoon: a server module
 * reached the browser bundle and threw while loading, then a client type stopped
 * matching its endpoint and `(intermediate value).map is not a function` killed
 * the dashboard. In both cases React unmounted the entire tree, so the user saw
 * a blank page with no message, and the only clue was a line in a console nobody
 * had open. An app whose entire premise is telling a user what happened to their
 * money should never fail silently.
 *
 * Deliberately plain. It states that something broke, what the user can do, and
 * gives a reference. It does not show a stack trace, an error message, or any
 * value from the error object: those can carry file paths, user identifiers, or
 * transaction text, and this boundary is a user-facing surface.
 */

interface Props {
  children: React.ReactNode;
  /** Shown so the user can describe where they were when it broke. */
  area: string;
}

interface State {
  reference: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { reference: null };

  static getDerivedStateFromError(): State {
    // A short random reference, minted from the same Web Crypto helper the ids
    // use. Not the error message: that is for the log, not the screen.
    const id =
      typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID().slice(0, 8)
        : 'unknown';
    return { reference: id };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // The full detail goes to the console for whoever is debugging, and the
    // reference goes with it so a report can be tied to this render.
    console.error(
      `[ErrorBoundary:${this.props.area}] reference=${this.state.reference}`,
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.reference === null) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-canvas text-ink grid place-items-center band-compact">
        <div className="shell w-full max-w-lg">
          <div className="feature-card p-7 sm:p-8">
            <span className="badge-pill">Something broke</span>
            <h1 className="type-display-sm text-ink mt-4">This screen could not load</h1>
            <p className="type-body-md text-body mt-3">
              Your uploaded statements and everything else you have here are saved. Only
              this one screen failed to draw.
            </p>
            <p className="type-body-sm text-muted mt-3">
              Reload the page. If it keeps happening, quote the reference below.
            </p>
            <p className="type-caption text-muted mt-4">
              Reference <span className="font-figure text-ink">{this.state.reference}</span>
              {' · '}
              {this.props.area}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={() => window.location.reload()} className="btn-primary">
                Reload
              </button>
              <button
                type="button"
                onClick={() => this.setState({ reference: null })}
                className="btn-outline"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
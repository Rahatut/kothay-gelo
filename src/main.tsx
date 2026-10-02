import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

/**
 * The outermost boundary wraps the whole app.
 *
 * `App` has already authenticated and loaded data by the time a child can throw,
 * so an uncaught render error here unmounts everything and the user is left
 * staring at an empty document. That happened twice in a row during development:
 * a Node builtin reached the browser bundle, and then a view called `.map` on a
 * payload whose type no longer matched the endpoint. Neither produced a word on
 * screen.
 *
 * The boundary says what happened, tells the user their data is safe, and gives a
 * reference to quote. It deliberately carries no stack trace or error text, since
 * those can contain paths and transaction content.
 */
const root = document.getElementById('root');

if (!root) {
  // Nothing to mount into. Replacing the body beats leaving a blank document,
  // because a silent failure here is indistinguishable from a hung server.
  document.body.textContent =
    'Kothay Gelo could not start: the page is missing its mount point.';
} else {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary area="the whole page">
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
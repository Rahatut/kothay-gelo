import React, { useState } from 'react';
import { API_BASE_URL } from '../config';

interface AskViewProps {
  locale: 'en' | 'bn';
}

interface Message {
  role: 'user' | 'assistant';
  text: string;
  figures?: { label: string; value: string }[];
  capability?: string | null;
  phrased_by?: 'model' | 'deterministic';
  estimate?: { basis: string };
  insufficient?: boolean;
}

const t = {
  en: {
    title: 'Chat about your money',
    subtitle:
      'Ask anything about your spending, income, merchants, bills, trends, or savings. Every number comes from your ledger — the AI only phrases, it never computes. Your questions are not saved.',
    placeholder: 'How much did I spend on food this month?',
    submit: 'Send',
    sending: 'Checking your ledger…',
    figures: 'Figures from your ledger',
    via: 'Answered by',
    deterministic: 'deterministic engine',
    model: 'AI phrasing, engine numbers',
    est: 'Estimate — the period is still open.',
    helpful: 'Helpful',
    notHelpful: 'Not helpful',
    suggestions: ['How much did I spend this month?', 'Which merchants cost me the most?', 'What bills recur?', 'How can I save?'],
    attribution: 'Answered by capability',
  },
  bn: {
    title: 'আপনার অর্থ সম্পর্কে চ্যাট করুন',
    subtitle:
      'খরচ, আয়, বণিক, বিল, প্রবণতা বা সঞ্চয় নিয়ে যেকোনো প্রশ্ন করুন। প্রতিটি সংখ্যা আপনার খতিয়ান থেকে আসে — AI কেবল ভঙ্গি দেয়, হিসাব করে না। আপনার প্রশ্ন সংরক্ষণ করা হয় না।',
    placeholder: 'গত মাসে খাবারে কত খরচ হয়েছে?',
    submit: 'পাঠান',
    sending: 'আপনার খতিয়ান দেখছি…',
    figures: 'আপনার খতিয়ানের হিসাব',
    via: 'উত্তর দিয়েছে',
    deterministic: 'নির্ধারিত ইঞ্জিন',
    model: 'AI ভঙ্গি, ইঞ্জিনের সংখ্যা',
    est: 'অনুমান — সময়কাল পুরো হয়নি।',
    helpful: 'সহায়ক',
    notHelpful: 'সহায়ক নয়',
    suggestions: ['এই মাসে কত খরচ হয়েছে?', 'কোন দোকানে সবচেয়ে বেশি খরচ?', 'কোন বিল প্রতিবার আসে?', 'কীভাবে বাঁচা যায়?'],
    attribution: 'উত্তরদাতা ক্ষমতা',
  },
};

export const AskView: React.FC<AskViewProps> = ({ locale }) => {
  const copy = t[locale];
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const ask = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text || loading) return;
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setQuestion('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/ask`, {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, locale, history }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.message ?? 'Could not answer that.');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: payload.answer,
          figures: payload.figures,
          capability: payload.capability,
          phrased_by: payload.phrased_by,
          estimate: payload.estimate,
          insufficient: payload.insufficient === true,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: err instanceof Error ? err.message : 'Could not answer that.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const feedback = async (text: string, feedback_type: string) => {
    await fetch(`${API_BASE_URL}/v1/ask/feedback`, {
      credentials: 'include',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: text, feedback_type }),
    }).catch(() => undefined);
  };

  return (
    <div className="space-y-6">
      <header className="border-b border-hairline pb-6">
        <h1 className="type-display-md text-ink">{copy.title}</h1>
        <p className="type-body-md text-body mt-2">{copy.subtitle}</p>
      </header>

      <div
        aria-live="polite"
        className="space-y-4 max-h-[60vh] overflow-y-auto pr-1"
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-2xl px-4 py-3 max-w-[85%] ${
              m.role === 'user'
                ? 'ml-auto bg-ink text-canvas'
                : 'mr-auto bg-surface-strong text-ink'
            }`}
          >
            <p className="type-body-md whitespace-pre-wrap">{m.text}</p>

            {m.role === 'assistant' && m.figures && m.figures.length > 0 && (
              <div className="mt-3">
                <p className="type-caption-uppercase text-muted mb-2">{copy.figures}</p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {m.figures.map((f) => (
                    <li key={f.label} className="flex justify-between border border-hairline rounded-md px-3 py-2 bg-canvas">
                      <span className="type-body-sm text-body">{f.label}</span>
                      <span className="font-figure type-body-sm text-ink tabular-nums">{f.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {m.role === 'assistant' && !m.insufficient && (
              <div className="mt-2 flex flex-wrap items-center gap-3 type-caption text-muted">
                {m.estimate && <span>{copy.est}</span>}
                {m.capability && (
                  <span>
                    {copy.attribution}: <span className="text-ink">{m.capability}</span>
                  </span>
                )}
                {m.phrased_by && (
                  <span>
                    {copy.via}: {m.phrased_by === 'model' ? copy.model : copy.deterministic}
                  </span>
                )}
              </div>
            )}

            {m.role === 'assistant' && (
              <div className="mt-2 flex gap-2">
                <button type="button" className="btn-outline btn-sm" onClick={() => void feedback(m.text, 'helpful')}>
                  {copy.helpful}
                </button>
                <button type="button" className="btn-outline btn-sm" onClick={() => void feedback(m.text, 'not_helpful')}>
                  {copy.notHelpful}
                </button>
              </div>
            )}
          </div>
        ))}

        {loading && <p className="type-caption text-muted">{copy.sending}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {copy.suggestions.map((s) => (
          <button key={s} type="button" className="btn-outline btn-sm" onClick={() => void ask(s)}>
            {s}
          </button>
        ))}
      </div>

      <form
        className="flex flex-col sm:flex-row gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <label htmlFor="ask-input" className="sr-only">
          {copy.title}
        </label>
        <input
          id="ask-input"
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={copy.placeholder}
          className="text-input flex-1"
          maxLength={500}
        />
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? copy.sending : copy.submit}
        </button>
      </form>
    </div>
  );
};

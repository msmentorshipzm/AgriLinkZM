import React, { useEffect, useRef, useState } from 'react';
import { Bot, RotateCcw, Send, Sparkles, X } from 'lucide-react';

type GeminiAssistantRoleId = 'crop_advisor' | 'trust_guide' | 'buyer_concierge';
type GeminiSpeedTier = 'standard' | 'fast';

interface ChatTurn {
  role: 'user' | 'model';
  text: string;
  model?: string;
}

const ROLE_OPTIONS: Array<{
  id: GeminiAssistantRoleId;
  label: string;
  subtitle: string;
  starters: string[];
}> = [
  {
    id: 'crop_advisor',
    label: 'Agronomy & Produce Advisor',
    subtitle: 'Zambian maize grading, horticulture, poultry, aquaculture & ZMW pricing',
    starters: [
      'What moisture level & bag weight standards apply to Grade A maize in Zambia?',
      'How should broiler & tilapia producers price stock for Chongwe & Lusaka markets?',
    ],
  },
  {
    id: 'trust_guide',
    label: 'Trust & Verification Guide',
    subtitle: 'Tier 1-3 KYC checks, MoMo name matching & anti-scam buyer protection',
    starters: [
      'How do Tier 1 NRC, Tier 2 PACRA/ZRA, and Tier 3 Site-Verified checks work?',
      'What safety rules protect Zambian buyers from advance-fee Mobile Money scams?',
    ],
  },
  {
    id: 'buyer_concierge',
    label: 'Buyer Sourcing Assistant',
    subtitle: 'Provincial sourcing, radius search & transport planning across 10 provinces',
    starters: [
      'Which active commodities are available near Lusaka or Copperbelt right now?',
      'How should a bulk buyer inspect produce before paying via Mobile Money?',
    ],
  },
];

export const GeminiChatbotDrawer: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [roleId, setRoleId] = useState<GeminiAssistantRoleId>('crop_advisor');
  const [speedTier, setSpeedTier] = useState<GeminiSpeedTier>('standard');
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  const selectedRole = ROLE_OPTIONS.find((r) => r.id === roleId) || ROLE_OPTIONS[0];

  useEffect(() => {
    if (isOpen) {
      scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history, loading, isOpen]);

  const sendMessage = async (textToSend: string) => {
    const clean = textToSend.trim();
    if (!clean || loading) return;

    setError(null);
    const prevHistory = history;
    const optimisticHistory: ChatTurn[] = [...prevHistory, { role: 'user', text: clean }];
    setHistory(optimisticHistory);
    setInput('');
    setLoading(true);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          roleId,
          speedTier,
          history: prevHistory.map((h) => ({ role: h.role, text: h.text })),
          message: clean,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        reply?: string;
        model?: string;
        error?: string;
      };
      if (!res.ok || !json.reply) {
        setError(json.error || 'Unable to reach AgriLink AI Assistant right now.');
        setHistory(prevHistory);
        setInput(clean);
      } else {
        setHistory((curr) => [
          ...curr,
          { role: 'model', text: json.reply!, model: json.model },
        ]);
      }
    } catch {
      setError('AgriLink AI Assistant timed out or could not connect. Please try again.');
      setHistory(prevHistory);
      setInput(clean);
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage(input);
  };

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open AgriLink AI Guide"
          className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-lg border border-[#1B5E20] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#1B5E20] shadow-lg transition-colors hover:bg-[#EEF3EC]"
        >
          <Sparkles className="h-4 w-4" />
          <span>AgriLink AI Guide</span>
        </button>
      )}

      {isOpen && (
        <aside
          aria-label="AgriLink AI Assistant"
          className="fixed bottom-4 right-4 z-50 flex h-[540px] max-h-[84vh] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-[#E5E7EB] bg-[#1B5E20] px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 shrink-0 text-[#F59E0B]" />
              <div>
                <div className="font-display text-sm font-bold">AgriLink AI Guide</div>
                <div className="text-[11px] text-white/80">
                  Zambian Agri-Market &amp; Trust Assistant
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {history.length > 0 && (
                <button
                  type="button"
                  title="Reset conversation"
                  aria-label="Reset conversation"
                  onClick={() => {
                    setHistory([]);
                    setError(null);
                  }}
                  className="rounded-md p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                aria-label="Close AgriLink AI Guide"
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Role & Speed Selectors */}
          <div className="grid grid-cols-1 gap-2 border-b border-[#E5E7EB] bg-[#F9FAF8] p-3 sm:grid-cols-2">
            <div>
              <label htmlFor="gemini-role-select" className="block text-[11px] font-semibold text-[#4B5563]">
                Assistant Role
              </label>
              <select
                id="gemini-role-select"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value as GeminiAssistantRoleId)}
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs font-medium text-[#111827] focus:border-[#1B5E20] focus:outline-none"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="gemini-speed-select" className="block text-[11px] font-semibold text-[#4B5563]">
                Response Speed
              </label>
              <select
                id="gemini-speed-select"
                value={speedTier}
                onChange={(e) => setSpeedTier(e.target.value as GeminiSpeedTier)}
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs font-medium text-[#111827] focus:border-[#1B5E20] focus:outline-none"
              >
                <option value="standard">Standard (Gemini 4 Hydrogen)</option>
                <option value="fast">Fast (Gemini 3.1 Flash Lite)</option>
              </select>
            </div>
          </div>

          {/* Scrollable Conversation Area */}
          <div className="flex-1 space-y-3 overflow-y-auto bg-white p-4">
            {history.length === 0 ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] p-3 text-xs text-[#374151]">
                  <div className="font-bold text-[#111827]">{selectedRole.label}</div>
                  <p className="mt-1 text-[#4B5563]">{selectedRole.subtitle}</p>
                </div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[#4B5563]">
                  Suggested Questions
                </div>
                <div className="space-y-2">
                  {selectedRole.starters.map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      disabled={loading}
                      onClick={() => void sendMessage(starter)}
                      className="w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-left text-xs text-[#111827] transition-colors hover:border-[#1B5E20] hover:bg-[#EEF3EC]"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              history.map((turn, idx) => (
                <div
                  key={`${turn.role}-${idx}`}
                  className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      turn.role === 'user'
                        ? 'bg-[#1B5E20] text-white'
                        : 'border border-[#E5E7EB] bg-[#F9FAF8] text-[#111827]'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{turn.text}</div>
                    {turn.model && (
                      <div className="mt-1.5 font-mono text-[10px] text-[#6B7280]">
                        {turn.model}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAF8] px-3.5 py-2 text-xs text-[#4B5563]">
                  Generating response...
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-[#C2410C]/40 bg-[#FFF7ED] p-3 text-xs font-medium text-[#9A3412]">
                {error}
              </div>
            )}

            <div ref={scrollEndRef} />
          </div>

          {/* Input Composer */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-[#E5E7EB] bg-[#F9FAF8] p-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about produce, grading, KYC, or sourcing..."
              aria-label="Ask AgriLink AI Guide"
              className="flex-1 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs text-[#111827] focus:border-[#1B5E20] focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send question"
              className="inline-flex items-center gap-1 rounded-lg bg-[#1B5E20] px-3 py-2 text-xs font-semibold text-white hover:bg-[#154A19] disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Send</span>
            </button>
          </form>
        </aside>
      )}
    </>
  );
};

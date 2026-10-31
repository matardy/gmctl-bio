import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mobile = true;
vi.stubGlobal('matchMedia', vi.fn(() => ({
  matches: mobile,
  addEventListener: () => {},
  removeEventListener: () => {},
})));

const agentMessages = [
  { id: 'u1', role: 'user', content: 'what services?' },
  {
    id: 'a1',
    role: 'assistant',
    content: '',
    toolCalls: [{ id: 't1', type: 'function', function: { name: 'navigate', arguments: '{"section":"services"}' } }],
  },
  { id: 'tool-1', role: 'tool', toolCallId: 't1', content: '{"section":"services"}' },
  { id: 'a2', role: 'assistant', content: 'here are the services' },
];

const agent = {
  isRunning: false,
  messages: agentMessages as unknown[],
  addMessage: vi.fn(),
  setMessages: vi.fn(),
  runAgent: vi.fn(async () => {}),
};

// Runtime connection as seen by the chat (CopilotKit's useCopilotKit).
const connection = { status: 'connected' };

// Only the agent and connection are faked; useRenderTool / useRenderToolCall
// are CopilotKit's real hooks.
vi.mock('@copilotkit/react-core/v2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@copilotkit/react-core/v2')>();
  return {
    ...actual,
    useAgent: () => ({ agent }),
    useCopilotKit: () => ({
      copilotkit: { runtimeUrl: '/api/copilotkit', runtimeConnectionStatus: connection.status },
    }),
  };
});

const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
  if (url.startsWith('/api/history?')) {
    return new Response(JSON.stringify({
      messages: [
        { role: 'user', content: 'servicios?', session_id: 's-old' },
        {
          role: 'assistant',
          content: 'aquí están.',
          session_id: 's-old',
          tool_calls: [{ id: 'c9', name: 'navigate', args: { section: 'services' } }],
        },
      ],
    }));
  }
  return new Response(JSON.stringify({ ok: true }));
});
vi.stubGlobal('fetch', fetchMock);

import { CopilotKitProvider } from '@copilotkit/react-core/v2';
import { Chat } from './chat';

const noop = () => {};

function chatElement(scrollTo: (id: string) => void = noop, ids = { anonId: '', sessionId: '' }) {
  return (
    <CopilotKitProvider>
      <Chat
        primary
        lang="en"
        setLang={noop}
        scrollTo={scrollTo}
        setTheme={noop}
        setTlFilter={noop}
        setBlogFilter={noop}
        selectedModel={{ id: 'anthropic/claude-haiku-5.5', label: 'claude-haiku-5.5', provider: 'openrouter', ctx: '1M', free: false }}
        onModelChange={noop}
        anonId={ids.anonId}
        sessionId={ids.sessionId}
        setSessionId={noop}
      />
    </CopilotKitProvider>
  );
}

function renderChat(scrollTo: (id: string) => void = noop) {
  return render(chatElement(scrollTo));
}

describe('Chat generative UI (CopilotKit useRenderTool)', () => {
  beforeEach(() => {
    mobile = true;
    agent.isRunning = false;
    agent.messages = agentMessages;
    connection.status = 'connected';
    vi.clearAllMocks();
  });

  it('renders the services card for a navigate tool call on mobile', async () => {
    renderChat();
    expect(await screen.findByText(/1:1 AI Career Mentorship/)).toBeInTheDocument();
    expect(screen.getByText('here are the services')).toBeInTheDocument();
  });

  it('never shows the raw tool result JSON as a chat message', async () => {
    renderChat();
    await screen.findByText('here are the services');
    expect(screen.queryByText('{"section":"services"}')).not.toBeInTheDocument();
  });

  it('scrolls to the section on desktop instead of rendering a card', async () => {
    mobile = false;
    const scrollTo = vi.fn();
    renderChat(scrollTo);
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith('services'));
    expect(screen.queryByText(/1:1 AI Career Mentorship/)).not.toBeInTheDocument();
  });

  it('saves the turn\'s tool calls with the assistant reply when a run finishes', async () => {
    agent.isRunning = true;
    const ids = { anonId: 'anon-1', sessionId: 'sess-1' };
    const { rerender } = render(chatElement(noop, ids));
    agent.isRunning = false;
    rerender(chatElement(noop, ids));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([url, init]) => url === '/api/history' && init?.method === 'POST');
      expect(post).toBeDefined();
      expect(JSON.parse(String(post![1]!.body))).toEqual({
        anon_id: 'anon-1',
        session_id: 'sess-1',
        role: 'assistant',
        content: 'here are the services',
        tool_calls: [{ id: 't1', name: 'navigate', args: { section: 'services' } }],
      });
    });
  });

  it('restores stored tool calls on load so cards re-render after a reload', async () => {
    agent.messages = [];
    render(chatElement(noop, { anonId: 'anon-1', sessionId: '' }));

    await waitFor(() => expect(agent.setMessages).toHaveBeenCalled());
    const restored = agent.setMessages.mock.calls[0][0] as { role: string; toolCalls?: unknown[] }[];
    expect(restored.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
    expect(restored[1].toolCalls).toEqual([
      { id: 'c9', type: 'function', function: { name: 'navigate', arguments: '{"section":"services"}' } },
    ]);
  });

  it('waits for the runtime connection before restoring (the provisional agent is discarded)', async () => {
    connection.status = 'connecting';
    agent.messages = [];
    const ids = { anonId: 'anon-1', sessionId: '' };
    const { rerender } = render(chatElement(noop, ids));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(agent.setMessages).not.toHaveBeenCalled();

    connection.status = 'connected';
    rerender(chatElement(noop, ids));
    await waitFor(() => expect(agent.setMessages).toHaveBeenCalledTimes(1));
  });
});

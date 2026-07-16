import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('matchMedia', vi.fn(() => ({
  matches: true,
  addEventListener: () => {},
  removeEventListener: () => {},
})));

vi.mock('@copilotkit/react-core/v2', () => ({
  useAgent: () => ({
    agent: {
      isRunning: false,
      messages: [
        {
          id: 'a1',
          role: 'assistant',
          content: 'here are the services',
          toolCalls: [{ id: 't1', function: { name: 'navigate', arguments: '{"section":"services"}' } }],
        },
      ],
      addMessage: vi.fn(),
      setMessages: vi.fn(),
      runAgent: vi.fn(async () => {}),
    },
  }),
}));

import { Chat } from './chat';

const noop = () => {};

describe('Chat generative cards (mobile)', () => {
  it('renders a services card when the agent navigates to services on mobile', async () => {
    render(
      <Chat
        primary
        lang="en"
        setLang={noop}
        scrollTo={noop}
        setTheme={noop}
        setTlFilter={noop}
        setBlogFilter={noop}
        selectedModel={{ id: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4.5', provider: 'anthropic', ctx: '200k', free: false }}
        onModelChange={noop}
        anonId=""
        sessionId=""
        setSessionId={noop}
      />,
    );
    expect(await screen.findByText(/1:1 AI Career Mentorship/)).toBeInTheDocument();
  });
});

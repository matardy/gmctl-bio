import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@copilotkit/react-core/v2', () => ({
  useAgent: () => ({
    agent: {
      messages: [],
      isRunning: false,
      addMessage: vi.fn(),
      addMessages: vi.fn(),
      setMessages: vi.fn(),
      runAgent: vi.fn(async () => {}),
    },
  }),
}));

import { Chat } from './chat';

const noop = () => {};

describe('Chat terminal shell', () => {
  it('renders the terminal header, quick commands, and the $ prompt', () => {
    render(
      <Chat
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
    expect(screen.getByText('// gmctl agent')).toBeInTheDocument();
    expect(screen.getByText(/claude-haiku-4\.5/)).toBeInTheDocument();
    expect(screen.getByText('/about')).toBeInTheDocument();
    expect(screen.getByText('$')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@copilotkit/react-core/v2', () => ({
  useAgent: () => ({ agent: { messages: [] } }),
  CopilotChat: () => <div data-testid="copilot-chat" />,
}));

import { Chat } from './chat';

describe('Chat shell', () => {
  it('renders the model badge and the CopilotChat surface', () => {
    render(
      <Chat
        lang="en"
        scrollTo={() => {}}
        selectedModel={{ id: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4.5', provider: 'anthropic', ctx: '200k', free: false }}
        onModelChange={() => {}}
        anonId=""
      />,
    );
    expect(screen.getByText(/claude-haiku-4\.5/)).toBeInTheDocument();
    expect(screen.getByTestId('copilot-chat')).toBeInTheDocument();
  });
});

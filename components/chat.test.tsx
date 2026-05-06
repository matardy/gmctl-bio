import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    sendMessage: vi.fn(),
    setMessages: vi.fn(),
    status: 'ready',
  }),
}));

import { Chat } from './chat';

describe('Chat quota states', () => {
  it('renders the exhausted banner when quota is exhausted', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/quota')) {
        return {
          ok: true,
          json: async () => ({
            tokens_used_24h: 12000,
            tokens_limit_24h: 12000,
            tokens_remaining_24h: 0,
            quota_exhausted: true,
          }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({ messages: [] }),
      } as Response;
    }) as typeof fetch);

    render(
      <Chat
        lang="en"
        setLang={() => {}}
        scrollTo={() => {}}
        theme="dark"
        setTheme={() => {}}
        setTlFilter={() => {}}
        setBlogFilter={() => {}}
        selectedModel={{ id: 'meta-llama/llama-3.3-70b-instruct', label: 'llama', provider: 'openrouter', ctx: '128k', free: false }}
        onModelChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/quota exhausted/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /contact/i })).toBeInTheDocument();
  });
});

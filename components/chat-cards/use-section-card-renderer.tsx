'use client';

import { useRenderTool } from '@copilotkit/react-core/v2';
import { z } from 'zod';
import type { Lang } from '@/lib/data';
import { CARD_COMPONENTS } from './index';

const navigateParameters = z.object({ section: z.string() });

/**
 * CopilotKit tool-based generative UI: registers a renderer for the agent's
 * backend `navigate` tool. On mobile, a call for a pilot section renders that
 * section's card inline in the chat (wherever `useRenderToolCall` paints the
 * tool call). On desktop it renders nothing — the chat scrolls the site
 * instead.
 */
export function useSectionCardRenderer(lang: Lang, isMobile: boolean) {
  useRenderTool(
    {
      name: 'navigate',
      parameters: navigateParameters,
      render: ({ parameters }) => {
        const section = parameters?.section;
        const Card = isMobile && section ? CARD_COMPONENTS[section] : undefined;
        if (!Card) return <></>;
        return (
          <div className="chat-card-msg">
            <Card lang={lang} />
          </div>
        );
      },
    },
    [lang, isMobile],
  );
}

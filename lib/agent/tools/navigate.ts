import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const SECTIONS = [
  'home',
  'about',
  'timeline',
  'projects',
  'services',
  'writing',
  'voices',
  'contact',
] as const;

export type Section = (typeof SECTIONS)[number];

/**
 * Server-side navigation tool. The agent calls it whenever its answer is
 * primarily about a section; the tool simply echoes the section back. The
 * frontend observes the emitted tool call (via the AG-UI tool-call events)
 * and scrolls the site to that section.
 */
export const navigateTool = tool(
  async ({ section }: { section: Section }) => ({ section }),
  {
    name: 'navigate',
    description:
      'Navigate to a section of the website. Call this when the answer is primarily about a specific section.',
    schema: z.object({
      section: z.enum(SECTIONS),
    }),
  },
);

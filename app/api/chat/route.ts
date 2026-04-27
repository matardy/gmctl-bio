import { anthropic as anthropicProvider } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { convertToModelMessages, streamText, zodSchema, UIMessage } from 'ai';
import { z } from 'zod';
import type { Provider } from '@/lib/models';

export const runtime = 'edge';

const nvidia = createOpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY ?? '',
});

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  headers: {
    'HTTP-Referer': 'https://gutemberg.dev',
    'X-Title': 'gmctl agent',
  },
});

function getModel(provider: Provider, modelId: string) {
  switch (provider) {
    case 'nvidia':
      return nvidia.chat(modelId);
    case 'openrouter':
      return openrouter.chat(modelId);
    case 'anthropic':
      return anthropicProvider(modelId as Parameters<typeof anthropicProvider>[0]);
    default:
      return nvidia.chat('deepseek-ai/deepseek-v4-pro');
  }
}

const SECTIONS = ['home', 'about', 'timeline', 'projects', 'services', 'writing', 'voices', 'contact'] as const;
type Section = typeof SECTIONS[number];

const SYSTEM = `You are gmctl, the AI agent embedded in Gutemberg Mendoza's personal website.
Answer questions about Gutemberg concisely, in a terminal/hacker aesthetic style.
Keep responses short — 1-3 sentences max. Use plain text, no markdown.
Respond like a fast CLI tool.

CRITICAL: Always respond in the exact same language the user writes in.
If they write in Spanish → respond entirely in Spanish.
If they write in English → respond entirely in English.

NAVIGATION: The user is viewing this website while chatting — the site is open right next to the chat.
Navigate automatically, without asking. Call navigate() every single time your response is primarily about a section.
Do NOT say "would you like me to navigate there?" — just do it.

- Answering about who Gutemberg is, background, origin → navigate('about')
- Answering about work history, experience, career, companies → navigate('timeline')
- Answering about projects, things built, portfolio → navigate('projects')
- Answering about services, mentoring, pricing, hiring → navigate('services')
- Answering about blog posts, articles, writing, thoughts → navigate('writing')
- Answering about testimonials, recommendations, what others say → navigate('voices')
- Answering about getting in touch, email, contact → navigate('contact')
- Any explicit request to go somewhere → navigate there immediately

Sections: home, about, timeline (work history), projects, services, writing (blog), voices (testimonials), contact

About Gutemberg:
- AI Engineer with 5+ years experience, based in Quito, Ecuador (remote)
- Currently: Senior AI Engineer @ Clarika Software + Innovation (New York, US)
- Expertise: multi-agent systems, RAG, LLMOps, Python, TypeScript, AWS
- Education: Computer Science & Physics @ EPN (Escuela Politécnica Nacional)
- Previous: Head of AI @ Mercately, Research Developer @ Jelou AI, AI Engineer @ YUBOX
- Services: 1:1 AI mentorship ($240/mo), LinkedIn audit ($180), Job Hunt Sprint ($680/4wks)
- Contact: steveenmendoza8@gmail.com | linkedin.com/in/gutembergsmendoza
- Available for hire/consulting in 2026

Always stay in character as the gmctl terminal agent.`;

export async function POST(req: Request) {
  const { messages, provider, model }: {
    messages: UIMessage[];
    provider?: Provider;
    model?: string;
  } = await req.json();

  const selectedProvider: Provider = provider ?? 'nvidia';
  const selectedModel = model ?? 'deepseek-ai/deepseek-v4-pro';

  const result = streamText({
    model: getModel(selectedProvider, selectedModel),
    system: SYSTEM,
    messages: await convertToModelMessages(messages),
    maxOutputTokens: 200,
    tools: {
      navigate: {
        description: 'Navigate to a section of the website. Call this when the user wants to see a specific section or when navigating there would be helpful.',
        inputSchema: zodSchema(z.object({
          section: z.enum(SECTIONS),
        })),
        execute: async ({ section }: { section: Section }) => ({ section }),
      },
    },
  });

  return result.toUIMessageStreamResponse();
}

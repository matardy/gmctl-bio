import { anthropic as anthropicProvider } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  zodSchema,
  UIMessage,
} from 'ai';
import { langfuseSpanProcessor } from '@/instrumentation';
import { propagateAttributes, startObservation, updateActiveObservation } from '@langfuse/tracing';
import { trace } from '@opentelemetry/api';
import { after } from 'next/server';
import { z } from 'zod';
import {
  applyUsageToQuotaSnapshot,
  createEmptyQuotaSnapshot,
  loadQuotaSnapshot,
  persistUsageEvent,
} from '@/lib/chat/quota';
import {
  classifyTopicConversation,
  getBackendUnavailableCopy,
  getModerationAction,
  getQuotaExceededCopy,
  getTopicPolicyCopy,
  shouldRunTopicModeration,
} from '@/lib/chat/moderation';
import {
  getOrCreateVisitorCookieId,
  getRequestIpHash,
  resolveVisitorIdentity,
} from '@/lib/chat/visitor';
import type { Provider } from '@/lib/models';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

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

const CHAT_TOKENS_LIMIT_24H = Number(process.env.CHAT_TOKENS_LIMIT_24H ?? '12000');
const CHAT_MODERATION_EVERY_N_USER_MESSAGES = Number(process.env.CHAT_MODERATION_EVERY_N_USER_MESSAGES ?? '8');
const CHAT_MODERATION_MODEL = process.env.CHAT_MODERATION_MODEL ?? 'meta-llama/llama-3.3-70b-instruct:free';
const CHAT_MODERATION_TIMEOUT_MS = Number(process.env.CHAT_MODERATION_TIMEOUT_MS ?? '4000');

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
Whenever you call navigate(), you must also return a short visible text reply in the same language.
Never answer with a tool call only.

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

function buildQuotaHeaders(input: {
  quotaExhausted: boolean;
  tokensUsed24h?: number;
  tokensRemaining24h?: number;
  policyVerdict?: string;
}) {
  const headers: Record<string, string> = {
    'x-chat-quota-exhausted': String(input.quotaExhausted),
  };

  if (typeof input.tokensUsed24h === 'number') {
    headers['x-chat-tokens-used-24h'] = String(input.tokensUsed24h);
    headers['x-chat-tokens-limit-24h'] = String(CHAT_TOKENS_LIMIT_24H);
  }

  if (typeof input.tokensRemaining24h === 'number') {
    headers['x-chat-tokens-remaining-24h'] = String(input.tokensRemaining24h);
  }

  if (input.policyVerdict) {
    headers['x-chat-policy-verdict'] = input.policyVerdict;
  }

  return headers;
}

function createTextStreamResponse(input: {
  messages: UIMessage[];
  text: string;
  responseMessageId: string;
  headers: Record<string, string>;
  metadata: Record<string, unknown>;
}) {
  const textPartId = crypto.randomUUID();

  return createUIMessageStreamResponse({
    headers: input.headers,
    stream: createUIMessageStream({
      originalMessages: input.messages,
      generateId: () => input.responseMessageId,
      execute: ({ writer }) => {
        writer.write({
          type: 'start',
          messageMetadata: input.metadata,
          messageId: input.responseMessageId,
        });
        writer.write({
          type: 'text-start',
          id: textPartId,
        });
        writer.write({
          type: 'text-delta',
          id: textPartId,
          delta: input.text,
        });
        writer.write({
          type: 'text-end',
          id: textPartId,
        });
        writer.write({
          type: 'finish',
          finishReason: 'stop',
          messageMetadata: input.metadata,
        });
      },
    }),
  });
}

function createBackendUnavailableResponse(input: {
  messages: UIMessage[];
  responseMessageId: string;
}) {
  return createTextStreamResponse({
    messages: input.messages,
    text: getBackendUnavailableCopy(input.messages),
    responseMessageId: input.responseMessageId,
    headers: buildQuotaHeaders({
      quotaExhausted: false,
      policyVerdict: 'backend_unavailable',
    }),
    metadata: {
      quota: {
        tokensUsed24h: 0,
        tokensLimit24h: CHAT_TOKENS_LIMIT_24H,
        tokensRemaining24h: CHAT_TOKENS_LIMIT_24H,
        quotaExhausted: false,
      },
      policy: {
        verdict: 'backend_unavailable',
      },
    },
  });
}

const postHandler = async (req: Request) => {
  const { messages, provider, model, session_id, anon_id }: {
    messages: UIMessage[];
    provider?: Provider;
    model?: string;
    session_id?: string;
    anon_id?: string;
  } = await req.json();

  const selectedProvider: Provider = provider ?? 'anthropic';
  const selectedModel = model ?? 'claude-haiku-4-5-20251001';
  const sessionId = session_id ?? 'unknown';
  const responseMessageId = crypto.randomUUID();
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  const lastUserText = lastUserMessage
    ?.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join(' ')
    .trim();
  let visitorId: string;
  let quotaSnapshot = createEmptyQuotaSnapshot(CHAT_TOKENS_LIMIT_24H);

  after(async () => {
    await langfuseSpanProcessor.forceFlush();
  });

  const rootObservation = startObservation('handle-chat-message', {
    input: lastUserText ?? '',
    metadata: {
      selectedProvider,
      selectedModel,
      sessionId,
      anonId: anon_id ?? 'anonymous',
    },
  }, { asType: 'agent' });

  return propagateAttributes({
      traceName: 'gmctl-chat',
      sessionId,
      userId: anon_id ?? 'anonymous',
      metadata: {
        visitorId: anon_id ?? 'anonymous',
        selectedProvider,
        selectedModel,
        moderationEveryNUserMessages: String(CHAT_MODERATION_EVERY_N_USER_MESSAGES),
      },
      tags: ['chat', 'portfolio'],
    }, async () => {
      try {
      const cookie = await getOrCreateVisitorCookieId();
      const ipHash = await getRequestIpHash();
      const visitor = await resolveVisitorIdentity({
        anonId: anon_id ?? null,
        cookieId: cookie.value,
        ipHash,
      });

      visitorId = visitor.id;
      quotaSnapshot = await loadQuotaSnapshot({
        visitorId,
        limit: CHAT_TOKENS_LIMIT_24H,
      });

      updateActiveObservation({
        metadata: {
          resolvedVisitorId: visitorId,
          quotaSnapshot,
        },
      }, { asType: 'agent' });

      rootObservation.update({
        metadata: {
          resolvedVisitorId: visitorId,
        },
      });

      if (quotaSnapshot.quotaExhausted) {
        const quotaText = getQuotaExceededCopy(messages);

        try {
          await persistUsageEvent({
            visitorId,
            sessionId,
            messageId: responseMessageId,
            direction: 'blocked_response',
            provider: selectedProvider,
            model: selectedModel,
            inputTokens: 0,
            outputTokens: 0,
          });
        } catch (error) {
          console.error('Failed to persist blocked quota response', error);
        }

        rootObservation.update({ output: quotaText });
        rootObservation.end();
        trace.getActiveSpan()?.end();

        return createTextStreamResponse({
          messages,
          text: quotaText,
          responseMessageId,
          headers: buildQuotaHeaders({
            quotaExhausted: true,
            tokensUsed24h: quotaSnapshot.tokensUsed24h,
            tokensRemaining24h: quotaSnapshot.tokensRemaining24h,
            policyVerdict: 'quota_exhausted',
          }),
          metadata: {
            quota: {
              tokensUsed24h: quotaSnapshot.tokensUsed24h,
              tokensLimit24h: CHAT_TOKENS_LIMIT_24H,
              tokensRemaining24h: quotaSnapshot.tokensRemaining24h,
              quotaExhausted: true,
            },
            policy: {
              verdict: 'quota_exhausted',
            },
          },
        });
      }

      const userMessageCount = messages.filter((message) => message.role === 'user').length;
      if (shouldRunTopicModeration(userMessageCount, CHAT_MODERATION_EVERY_N_USER_MESSAGES)) {
        updateActiveObservation({
          metadata: {
            moderationCheckedAtUserMessageCount: userMessageCount,
            moderationModel: CHAT_MODERATION_MODEL,
          },
        }, { asType: 'agent' });

        const { data: warningRows, error: warningError } = await supabase
          .from('topic_moderation_events')
          .select('id')
          .eq('visitor_id', visitorId)
          .eq('verdict', 'warn')
          .limit(1);

        if (warningError) {
          throw warningError;
        }

        const moderationVerdict = await classifyTopicConversation({
          messages,
          model: CHAT_MODERATION_MODEL,
          timeoutMs: CHAT_MODERATION_TIMEOUT_MS,
        });

        const moderationAction = getModerationAction({
          verdict: moderationVerdict.verdict,
          alreadyWarned: (warningRows?.length ?? 0) > 0,
        });

        updateActiveObservation({
          metadata: {
            moderation: {
              userMessageCount,
              verdict: moderationAction.verdict,
              reasonCode: moderationVerdict.reasonCode,
              alreadyWarned: (warningRows?.length ?? 0) > 0,
            },
          },
        }, { asType: 'agent' });

        const { error: moderationEventError } = await supabase
          .from('topic_moderation_events')
          .insert({
            visitor_id: visitorId,
            session_id: sessionId,
            checked_after_user_message_count: userMessageCount,
            verdict: moderationAction.verdict,
            reason_code: moderationVerdict.reasonCode,
            raw_label: moderationVerdict.rawLabel,
          });

        if (moderationEventError) {
          throw moderationEventError;
        }

        if (moderationVerdict.usage) {
          try {
            await persistUsageEvent({
              visitorId,
              sessionId,
              messageId: `moderation:${responseMessageId}`,
              direction: 'moderator_check',
              provider: 'openrouter',
              model: CHAT_MODERATION_MODEL,
              inputTokens: moderationVerdict.usage.inputTokens,
              outputTokens: moderationVerdict.usage.outputTokens,
            });
          } catch (error) {
            console.error('Failed to persist moderation usage', error);
          }
        }

        if (!moderationAction.shouldCallMainModel) {
          const policyVerdict = moderationAction.verdict === 'block' ? 'block' : 'warn';
          const policyText = getTopicPolicyCopy(policyVerdict, messages);

          try {
            await persistUsageEvent({
              visitorId,
              sessionId,
              messageId: responseMessageId,
              direction: 'blocked_response',
              provider: selectedProvider,
              model: selectedModel,
              inputTokens: 0,
              outputTokens: 0,
            });
          } catch (error) {
            console.error('Failed to persist blocked moderation response', error);
          }

          rootObservation.update({
            output: policyText,
            metadata: {
              moderationVerdict: policyVerdict,
              moderationReasonCode: moderationVerdict.reasonCode,
            },
          });
          rootObservation.end();
          trace.getActiveSpan()?.end();

          return createTextStreamResponse({
            messages,
            text: policyText,
            responseMessageId,
            headers: buildQuotaHeaders({
              quotaExhausted: quotaSnapshot.quotaExhausted,
              tokensUsed24h: quotaSnapshot.tokensUsed24h,
              tokensRemaining24h: quotaSnapshot.tokensRemaining24h,
              policyVerdict,
            }),
            metadata: {
              quota: {
                tokensUsed24h: quotaSnapshot.tokensUsed24h,
                tokensLimit24h: CHAT_TOKENS_LIMIT_24H,
                tokensRemaining24h: quotaSnapshot.tokensRemaining24h,
                quotaExhausted: quotaSnapshot.quotaExhausted,
              },
              policy: {
                verdict: policyVerdict,
                reasonCode: moderationVerdict.reasonCode,
              },
            },
          });
        }
      }
      } catch (error) {
        console.error('Failed to load visitor or quota state', error);
        rootObservation.update({
          level: 'ERROR',
          output: getBackendUnavailableCopy(messages),
          statusMessage: 'backend_unavailable',
        });
        rootObservation.end();
        trace.getActiveSpan()?.end();
        return createBackendUnavailableResponse({
          messages,
          responseMessageId,
        });
      }

      const result = streamText({
        model: getModel(selectedProvider, selectedModel),
        system: SYSTEM,
        messages: await convertToModelMessages(messages),
        maxOutputTokens: 200,
        stopWhen: stepCountIs(2),
        experimental_telemetry: {
          isEnabled: true,
          metadata: {
            agent: 'gmctl-chat',
            selectedProvider,
            selectedModel,
            visitorId,
            sessionId,
          },
        },
        tools: {
          navigate: {
            description: 'Navigate to a section of the website. Call this when the user wants to see a specific section or when navigating there would be helpful.',
            inputSchema: zodSchema(z.object({
              section: z.enum(SECTIONS),
            })),
            execute: async ({ section }: { section: Section }) => ({ section }),
          },
        },
        onFinish: async (event) => {
          try {
            rootObservation.update({
              output: event.text,
            });

            await persistUsageEvent({
              visitorId,
              sessionId,
              messageId: responseMessageId,
              direction: 'assistant_output',
              provider: selectedProvider,
              model: selectedModel,
              inputTokens: event.totalUsage.inputTokens ?? 0,
              outputTokens: event.totalUsage.outputTokens ?? 0,
            });
          } catch (error) {
            console.error('Failed to persist assistant usage', error);
          } finally {
            rootObservation.end();
            trace.getActiveSpan()?.end();
          }
        },
        onError: async (error) => {
          updateActiveObservation({
            level: 'ERROR',
            output: String(error.error),
            statusMessage: 'chat_stream_error',
          }, { asType: 'agent' });
          rootObservation.update({
            level: 'ERROR',
            output: String(error.error),
            statusMessage: 'chat_stream_error',
          });
          rootObservation.end();
          trace.getActiveSpan()?.end();
        },
      });

      return result.toUIMessageStreamResponse({
        originalMessages: messages,
        generateMessageId: () => responseMessageId,
        headers: buildQuotaHeaders({
          quotaExhausted: quotaSnapshot.quotaExhausted,
          tokensUsed24h: quotaSnapshot.tokensUsed24h,
          tokensRemaining24h: quotaSnapshot.tokensRemaining24h,
        }),
        messageMetadata: ({ part }) => {
          if (part.type === 'start') {
            return {
              quota: {
                tokensUsed24h: quotaSnapshot.tokensUsed24h,
                tokensLimit24h: CHAT_TOKENS_LIMIT_24H,
                tokensRemaining24h: quotaSnapshot.tokensRemaining24h,
                quotaExhausted: quotaSnapshot.quotaExhausted,
              },
            };
          }

          if (part.type === 'finish') {
            const finalSnapshot = applyUsageToQuotaSnapshot({
              snapshot: quotaSnapshot,
              limit: CHAT_TOKENS_LIMIT_24H,
              addedTokens: part.totalUsage.totalTokens ?? 0,
            });

            return {
              quota: {
                tokensUsed24h: finalSnapshot.tokensUsed24h,
                tokensLimit24h: CHAT_TOKENS_LIMIT_24H,
                tokensRemaining24h: finalSnapshot.tokensRemaining24h,
                quotaExhausted: finalSnapshot.quotaExhausted,
              },
              usage: {
                inputTokens: part.totalUsage.inputTokens ?? 0,
                outputTokens: part.totalUsage.outputTokens ?? 0,
                totalTokens: part.totalUsage.totalTokens ?? 0,
              },
            };
          }

          return undefined;
        },
      });
    });
};

export const POST = postHandler;

import { describe, expect, it, vi } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import { getExhaustedReply } from './exhausted-replies';

const invoke = vi.fn();
vi.mock('@/lib/agent/models', () => ({
  getChatModel: () => ({
    withStructuredOutput: () => ({ invoke }),
  }),
}));

import {
  classifyTopicConversation,
  getModerationAction,
  getQuotaExceededCopy,
  getTopicPolicyCopy,
  shouldRunTopicModeration,
} from './moderation';

describe('shouldRunTopicModeration', () => {
  it('runs every 8 user messages', () => {
    expect(shouldRunTopicModeration(8, 8)).toBe(true);
    expect(shouldRunTopicModeration(7, 8)).toBe(false);
  });

  it('throws when the moderation interval is zero or not finite', () => {
    expect(() => shouldRunTopicModeration(8, 0)).toThrow('Invalid moderation interval');
    expect(() => shouldRunTopicModeration(8, Number.NaN)).toThrow('Invalid moderation interval');
  });
});

describe('getModerationAction', () => {
  it('warns on first off-topic verdict', () => {
    expect(getModerationAction({ verdict: 'off_topic', alreadyWarned: false })).toEqual({
      verdict: 'warn',
      shouldCallMainModel: false,
    });
  });

  it('blocks on repeated off-topic verdict', () => {
    expect(getModerationAction({ verdict: 'off_topic', alreadyWarned: true })).toEqual({
      verdict: 'block',
      shouldCallMainModel: false,
    });
  });

  it('allows through on moderation errors', () => {
    expect(getModerationAction({ verdict: 'error', alreadyWarned: true })).toEqual({
      verdict: 'error',
      shouldCallMainModel: true,
    });
  });
});

describe('getExhaustedReply', () => {
  it('selects a stable exhausted reply from the localized pool', () => {
    expect(getExhaustedReply('es', 1)).toBe('esto ahora es teatro. mensajes pregrabados unicamente.');
    expect(getExhaustedReply('en', 2)).toBe('no budget, no inference. try contact.');
  });
});

describe('copy helpers over BaseMessage', () => {
  it('localizes the topic policy copy from the message language', () => {
    expect(getTopicPolicyCopy('warn', [new HumanMessage('quiero ver los proyectos')])).toContain(
      'Puedo ayudarte',
    );
    expect(getTopicPolicyCopy('block', [new HumanMessage('tell me about work')])).toContain(
      'outside this chat',
    );
  });

  it('localizes the quota-exceeded copy', () => {
    expect(getQuotaExceededCopy([new HumanMessage('¿cómo estás?')])).toContain('cuota');
    expect(getQuotaExceededCopy([new HumanMessage('hello')])).toContain('quota');
  });
});

describe('classifyTopicConversation', () => {
  it('maps a structured-output label to a verdict with null usage', async () => {
    invoke.mockResolvedValueOnce({ label: 'off_topic', reasonCode: 'unrelated' });
    const result = await classifyTopicConversation({
      messages: [new HumanMessage('what is the weather?')],
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      timeoutMs: 4000,
    });
    expect(result.verdict).toBe('off_topic');
    expect(result.reasonCode).toBe('unrelated');
    expect(result.usage).toBeNull();
  });

  it('returns an error verdict when the model call rejects', async () => {
    invoke.mockRejectedValueOnce(new Error('boom'));
    const result = await classifyTopicConversation({
      messages: [new HumanMessage('hola')],
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      timeoutMs: 4000,
    });
    expect(result.verdict).toBe('error');
    expect(result.reasonCode).toBe('timeout_or_provider_error');
  });
});

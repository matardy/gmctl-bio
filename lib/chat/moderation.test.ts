import { describe, expect, it } from 'vitest';
import { getExhaustedReply } from './exhausted-replies';
import { getModerationAction, shouldRunTopicModeration } from './moderation';

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

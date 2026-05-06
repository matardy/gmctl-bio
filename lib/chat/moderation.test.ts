import { describe, expect, it } from 'vitest';
import { getModerationAction, shouldRunTopicModeration } from './moderation';

describe('shouldRunTopicModeration', () => {
  it('runs every 8 user messages', () => {
    expect(shouldRunTopicModeration(8, 8)).toBe(true);
    expect(shouldRunTopicModeration(7, 8)).toBe(false);
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

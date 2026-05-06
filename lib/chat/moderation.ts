export type TopicVerdict = 'on_topic' | 'off_topic' | 'error';
export type ModerationActionVerdict = 'allow' | 'warn' | 'block' | 'error';

export function shouldRunTopicModeration(userMessageCount: number, interval: number) {
  if (!Number.isFinite(interval) || interval <= 0) {
    throw new RangeError('Invalid moderation interval');
  }

  return userMessageCount > 0 && userMessageCount % interval === 0;
}

export function getModerationAction(input: {
  verdict: TopicVerdict;
  alreadyWarned: boolean;
}): { verdict: ModerationActionVerdict; shouldCallMainModel: boolean } {
  if (input.verdict === 'on_topic') {
    return { verdict: 'allow', shouldCallMainModel: true };
  }

  if (input.verdict === 'error') {
    return { verdict: 'error', shouldCallMainModel: true };
  }

  if (input.alreadyWarned) {
    return { verdict: 'block', shouldCallMainModel: false };
  }

  return { verdict: 'warn', shouldCallMainModel: false };
}

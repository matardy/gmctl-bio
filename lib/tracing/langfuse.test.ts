import { afterEach, describe, expect, it } from 'vitest';
import { getLangfuseCallbacks } from './langfuse';

const originalPublic = process.env.LANGFUSE_PUBLIC_KEY;
const originalSecret = process.env.LANGFUSE_SECRET_KEY;

afterEach(() => {
  if (originalPublic === undefined) delete process.env.LANGFUSE_PUBLIC_KEY;
  else process.env.LANGFUSE_PUBLIC_KEY = originalPublic;
  if (originalSecret === undefined) delete process.env.LANGFUSE_SECRET_KEY;
  else process.env.LANGFUSE_SECRET_KEY = originalSecret;
});

describe('getLangfuseCallbacks', () => {
  it('returns an empty array when Langfuse keys are absent', () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    expect(getLangfuseCallbacks()).toEqual([]);
  });

  it('returns a handler when Langfuse keys are present', () => {
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';
    const callbacks = getLangfuseCallbacks({ sessionId: 's', userId: 'u' });
    expect(callbacks).toHaveLength(1);
  });
});

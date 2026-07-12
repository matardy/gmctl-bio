import { describe, expect, it } from 'vitest';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { getMessageText, inferResponseLanguage } from './messages';

describe('getMessageText', () => {
  it('reads plain string content', () => {
    expect(getMessageText(new HumanMessage('hola mundo'))).toBe('hola mundo');
  });

  it('reads array content parts', () => {
    const msg = new AIMessage({
      content: [
        { type: 'text', text: 'part one' },
        { type: 'text', text: 'part two' },
      ],
    });
    expect(getMessageText(msg)).toBe('part one part two');
  });
});

describe('inferResponseLanguage', () => {
  it('detects spanish from accents', () => {
    expect(inferResponseLanguage([new HumanMessage('¿cómo estás?')])).toBe('es');
  });

  it('detects spanish from hint words', () => {
    expect(inferResponseLanguage([new HumanMessage('quiero ver los proyectos')])).toBe('es');
  });

  it('defaults to english when empty', () => {
    expect(inferResponseLanguage([])).toBe('en');
  });

  it('picks the last human message', () => {
    expect(
      inferResponseLanguage([
        new HumanMessage('hello there'),
        new AIMessage('hi'),
        new HumanMessage('gracias por la experiencia'),
      ]),
    ).toBe('es');
  });
});

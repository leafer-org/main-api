import { describe, expect, it } from 'vitest';
import { pairKeyOf } from './pair-key.js';

describe('pairKeyOf', () => {
  it('user + organization — sorted', () => {
    expect(
      pairKeyOf([
        { kind: 'user', subjectId: 'U-1' },
        { kind: 'organization', subjectId: 'O-1' },
      ]),
    ).toBe('organization:O-1|user:U-1');
  });

  it('order of participants does not change result', () => {
    const a = pairKeyOf([
      { kind: 'organization', subjectId: 'O-1' },
      { kind: 'user', subjectId: 'U-1' },
    ]);
    const b = pairKeyOf([
      { kind: 'user', subjectId: 'U-1' },
      { kind: 'organization', subjectId: 'O-1' },
    ]);
    expect(a).toBe(b);
  });

  it('user + support — null subjectId becomes empty', () => {
    expect(
      pairKeyOf([
        { kind: 'user', subjectId: 'U-1' },
        { kind: 'support', subjectId: null },
      ]),
    ).toBe('support:|user:U-1');
  });

  it('support + organization', () => {
    expect(
      pairKeyOf([
        { kind: 'support', subjectId: null },
        { kind: 'organization', subjectId: 'O-1' },
      ]),
    ).toBe('organization:O-1|support:');
  });
});

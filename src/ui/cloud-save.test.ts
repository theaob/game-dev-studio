import { describe, expect, it } from 'vitest';
import { cloudChoice } from './cloud-save';

describe('cloud saves', () => {
  it('back up this device when there is no cloud save yet', () => {
    expect(cloudChoice(null, '{"week":10}', 0)).toBe('upload');
    expect(cloudChoice(null, null, 0)).toBe('upload');
  });

  it('leave a cloud save that matches this device alone', () => {
    expect(cloudChoice({ data: '{"week":10}', modified: 500 }, '{"week":10}', 0)).toBe('same');
  });

  it("replace a cloud save this device wrote (or already turned down) with this device's newer progress", () => {
    expect(cloudChoice({ data: '{"week":10}', modified: 500 }, '{"week":14}', 500)).toBe('upload');
    expect(cloudChoice({ data: '{"week":10}', modified: 400 }, null, 500)).toBe('upload');
  });

  it('ask before touching a save another device wrote since', () => {
    expect(cloudChoice({ data: '{"week":30}', modified: 900 }, '{"week":14}', 500)).toBe('ask');
    // A fresh install (or a new phone) finds the studio from the old one.
    expect(cloudChoice({ data: '{"week":30}', modified: 900 }, null, 0)).toBe('ask');
  });
});

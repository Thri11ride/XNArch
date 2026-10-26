import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { demoSnapshot } from '../shared/demo-data';
import { FirstRunWizard } from './App';

it('shows the upstream distinction and Nexus-only reporting before setup and sign-in', () => {
  const html = renderToStaticMarkup(<FirstRunWizard data={demoSnapshot()} toast={() => {}} />);
  const notice = html.match(/<section class="wizard-disclaimer"[^>]*>[\s\S]*?<\/section>/)?.[0];
  expect(notice).toContain('role="note"');
  expect(notice).toContain('Independent, unofficial project');
  expect(notice).toContain('XNArch is just a slightly tweaked and cleaned up version of Xodus Nexus v0.3.12');
  expect(notice).toContain('not an official Xodus or Xodus Nexus project');
  expect(notice).not.toContain('/issues');
  expect(notice).toContain('https://github.com/domsvoboda/xodus-nexus"');
  expect(notice).toContain('https://github.com/xodus-gaming/xodus"');
  expect(notice).toContain('target="_blank" rel="noopener noreferrer"');
  expect(html.indexOf('wizard-disclaimer')).toBeLessThan(html.indexOf('Games folder'));
  expect(html).toMatch(/<input[^>]*data-gamepad-initial/);
  expect(html).toContain('Start using Xodus Nexus');
});

import { renderToStaticMarkup } from 'react-dom/server';
import InvitationEmail from '../invitation-email';

// AC4 (server half of the ENG-1399 named DoD gate): rendering the
// invitation email produces markup containing "Orvex Wiki" and zero
// "Docmost". Renders through the exported component + the real
// react-dom/server renderer (react-email's own `render()` wraps this same
// renderer but requires --experimental-vm-modules under plain jest for its
// internal dynamic import; renderToStaticMarkup exercises the identical
// component tree without that harness dependency) — no mock of our own
// package (CS §5).
describe('InvitationEmail branding', () => {
  it('renders Orvex Wiki, zero Docmost', () => {
    const html = renderToStaticMarkup(
      InvitationEmail({ inviteLink: 'https://example.com/invite/token' }),
    );

    expect(html).toContain('Orvex Wiki');
    expect(html).not.toContain('Docmost');
  });

  it('the shared mail footer renders Orvex Wiki, zero Docmost', () => {
    const html = renderToStaticMarkup(
      InvitationEmail({ inviteLink: 'https://example.com/invite/token' }),
    );

    expect(html).toMatch(/Orvex Wiki, All Rights Reserved/);
  });
});

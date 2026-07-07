import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as workspaceSettingsDtoModule from './workspace-settings.dto';
import { OrvexWorkspaceSettings } from './workspace-settings.dto';

/**
 * RED->GREEN unit gates for the {@link OrvexWorkspaceSettings} DTO.
 * ENG-1432 AC5, AC6, and the binding Linear-scrub exclusion (§1/§5c).
 */
describe('OrvexWorkspaceSettings', () => {
  it('AC5 — rejects a non-boolean mcp.enabled with a constraint on the property chain', async () => {
    const dto = plainToInstance(OrvexWorkspaceSettings, {
      mcp: { enabled: 'yes' },
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);

    const properties: string[] = [];
    const walk = (errs: typeof errors) => {
      for (const e of errs) {
        properties.push(e.property);
        if (e.children?.length) walk(e.children as typeof errors);
      }
    };
    walk(errors);
    expect(properties).toContain('enabled');
  });

  it('AC6 — chatHistoryTtlDays accepts "never" and rejects 0', async () => {
    const okDto = plainToInstance(OrvexWorkspaceSettings, {
      ai: { chatHistoryTtlDays: 'never' },
    });
    const okErrors = await validate(okDto);
    expect(okErrors).toHaveLength(0);

    const badDto = plainToInstance(OrvexWorkspaceSettings, {
      ai: { chatHistoryTtlDays: 0 },
    });
    const badErrors = await validate(badDto);
    expect(badErrors.length).toBeGreaterThan(0);

    const properties: string[] = [];
    const walk = (errs: typeof badErrors) => {
      for (const e of errs) {
        properties.push(e.property);
        if (e.children?.length) walk(e.children as typeof badErrors);
      }
    };
    walk(badErrors);
    expect(properties).toContain('chatHistoryTtlDays');
  });

  it('Linear scrub — no `linear` key on a fresh instance', () => {
    expect('linear' in new OrvexWorkspaceSettings()).toBe(false);
  });

  it('Linear scrub — no Linear* symbol exported from the module', () => {
    const linearSymbols = Object.keys(workspaceSettingsDtoModule).filter(
      (k) => /^Linear/.test(k),
    );
    expect(linearSymbols).toEqual([]);
  });
});

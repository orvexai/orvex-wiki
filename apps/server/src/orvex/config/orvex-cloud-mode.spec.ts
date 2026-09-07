import {
  assertCloudCellPostureAtBoot,
  isCloudSoloCellAtBoot,
} from './orvex-cloud-mode';

describe('isCloudSoloCellAtBoot', () => {
  it('matches CLOUD=true with CELL_ID unset', () => {
    expect(isCloudSoloCellAtBoot({ CLOUD: 'true' })).toBe(true);
  });

  it('matches CLOUD=true with a blank or solo CELL_ID', () => {
    expect(isCloudSoloCellAtBoot({ CLOUD: 'true', CELL_ID: '  ' })).toBe(true);
    expect(isCloudSoloCellAtBoot({ CLOUD: 'true', CELL_ID: ' solo ' })).toBe(
      true,
    );
  });

  it('does not reject a real cloud cell or a self-hosted solo deployment', () => {
    expect(isCloudSoloCellAtBoot({ CLOUD: 'true', CELL_ID: 'eu1' })).toBe(
      false,
    );
    expect(isCloudSoloCellAtBoot({ CLOUD: 'false', CELL_ID: 'solo' })).toBe(
      false,
    );
    expect(isCloudSoloCellAtBoot({ CELL_ID: 'solo' })).toBe(false);
  });
});

describe('assertCloudCellPostureAtBoot', () => {
  it.each([
    { CLOUD: 'true' },
    { CLOUD: 'true', CELL_ID: '  ' },
    { CLOUD: 'true', CELL_ID: ' solo ' },
  ])('throws before boot for %j', (env) => {
    expect(() => assertCloudCellPostureAtBoot(env)).toThrow(
      'ENG-3789 AC2: refusing to start',
    );
  });

  it.each([
    { CLOUD: 'true', CELL_ID: 'eu1' },
    { CLOUD: 'false', CELL_ID: 'solo' },
    { CELL_ID: 'solo' },
  ])('allows a valid or non-cloud posture: %j', (env) => {
    expect(() => assertCloudCellPostureAtBoot(env)).not.toThrow();
  });
});

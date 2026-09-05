import { isCloudSoloCellAtBoot } from './orvex-cloud-mode';

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

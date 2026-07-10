/**
 * ENG-1650 — `OrvexLabelModule` (ENG-1385's space/workspace-scoped label
 * service) had zero importers anywhere in the tree: not `app.module.ts`,
 * not `OrvexRootModule`, not any owning feature module. `OrvexLabelService`
 * was therefore unreachable via DI at runtime despite shipping real,
 * DB-verified behaviour (SpaceScopedLabelUniquenessSpec).
 *
 * Fix: wire `OrvexLabelModule` into `LabelModule`, its owning module (the
 * po-ruling-10 pattern — cf. `PageModule` carrying `OrvexPageProvenanceModule`
 * / `OrvexPageMetadataModule`). `LabelModule` is already imported by
 * `PageModule`, so this makes the primitive reachable app-wide without
 * inventing a new consumer surface (out of scope for this cleanup).
 */
import { MODULE_METADATA } from '@nestjs/common/constants';

describe('LabelModule imports OrvexLabelModule (ENG-1650)', () => {
  it('lists OrvexLabelModule in its imports', async () => {
    const { LabelModule } = await import('./label.module');
    const { OrvexLabelModule } = await import('./orvex-label.module');

    const imports: unknown[] = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      LabelModule,
    );

    expect(imports).toBeDefined();
    expect(imports).toContain(OrvexLabelModule);
  });

  it('exports OrvexLabelService so consumers of LabelModule can inject it', async () => {
    const { LabelModule } = await import('./label.module');
    const { OrvexLabelService, ORVEX_LABEL_SERVICE } = await import(
      './orvex-label.service'
    );

    const exportsList: unknown[] = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      LabelModule,
    );

    expect(exportsList).toBeDefined();
    expect(exportsList).toContain(OrvexLabelService);
    expect(exportsList).toContain(ORVEX_LABEL_SERVICE);
  });
});

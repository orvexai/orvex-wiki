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

  it('re-exports OrvexLabelModule so consumers of LabelModule can inject OrvexLabelService', async () => {
    // Nest DI: a module may only export a provider/token that appears in its
    // OWN `providers` array; `OrvexLabelService`/`ORVEX_LABEL_SERVICE` are
    // provided by the imported `OrvexLabelModule`, not by `LabelModule`
    // itself, so exporting the raw tokens directly throws
    // `UnknownExportException` at boot (the ENG-1650 boot regression fixed
    // forward here). The correct re-export shape names the imported MODULE
    // in `exports`, which transitively surfaces everything that module
    // itself exports (`OrvexLabelService`, `ORVEX_LABEL_SERVICE`).
    const { LabelModule } = await import('./label.module');
    const { OrvexLabelModule } = await import('./orvex-label.module');

    const exportsList: unknown[] = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      LabelModule,
    );

    expect(exportsList).toBeDefined();
    expect(exportsList).toContain(OrvexLabelModule);
  });
});

import { describe, test, expect } from "vitest";
import {
  getPagePermissionRoleLabel,
  pagePermissionRoleData,
} from "@/ee/page-permission/types/page-permission-role-data";
import { PagePermissionRole } from "@/ee/page-permission/types/page-permission.types";

// review1 F2: AC8 (forward-compat) shipped with no test — "degrades
// correctly by inspection only" per the review. `getPagePermissionRoleLabel`
// is the actual exported interface `PagePermissionItem` renders through, so
// exercise it directly rather than mocking anything.
describe("ENG-1375 AC8: getPagePermissionRoleLabel forward-compat", () => {
  test("known roles resolve to their configured label", () => {
    expect(getPagePermissionRoleLabel(PagePermissionRole.WRITER)).toBe(
      pagePermissionRoleData.find((r) => r.value === PagePermissionRole.WRITER)
        .label,
    );
    expect(getPagePermissionRoleLabel(PagePermissionRole.READER)).toBe(
      pagePermissionRoleData.find((r) => r.value === PagePermissionRole.READER)
        .label,
    );
  });

  test("an unrecognised role from the engine degrades to the raw value, never throws or renders 'undefined'", () => {
    expect(() => getPagePermissionRoleLabel("owner")).not.toThrow();
    expect(getPagePermissionRoleLabel("owner")).toBe("owner");
  });
});

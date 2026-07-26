# TENANT_MOVE — deliberately-incomplete fixture (ENG-2509 DoD)

This committed fixture is the rule #10 check's RED proof: the Redis quota
counters and the Kafka outbox cursor are DELIBERATELY missing from the
inventory below, so `scripts/ci/tenant-move-coverage-check.mjs` must fail
when pointed at this file. Never used as documentation.

<!-- tenant-move-inventory:begin -->
| Name | Kind | Tenant-scoped pattern | Move strategy |
| -- | -- | -- | -- |
| workspaces | postgres | `workspaces.id = {tenant_id}` | export/import |
| pages | postgres | `pages.workspace_id = {tenant_id}` | export/import |
| orvex_page_meta | postgres | join via `pages.workspace_id` | export/import |
| comments | postgres | `comments.workspace_id = {tenant_id}` | export/import |
| attachments | postgres | `attachments.workspace_id = {tenant_id}` | export/import |
| attachment blobs | s3 | `{tenant_id}/…` object prefix | s3 prefix copy |
<!-- tenant-move-inventory:end -->

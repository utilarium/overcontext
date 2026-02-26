# Manual GCS integration test procedure

This project uses mocked GCS in CI (`tests/storage/fjell/gcs-adapter.test.ts`).
Use this checklist for manual validation against a real bucket.

1. Create a temporary bucket and set credentials (`GOOGLE_APPLICATION_CREDENTIALS`).
2. Build a provider with `createFjellGcsProvider({ bucketName, basePath, registry })`.
3. Save entities in two namespaces (`workspace-a`, `workspace-b`) and verify isolation.
4. Verify objects are JSON at `<basePath>/<namespace>/<type>/<id>.json`.
5. Run `get`, `getAll`, `find`, `count`, `delete`, `listNamespaces`, and `listTypes`.
6. Set `querySafety.maxScanFiles` low and verify wide scans fail with a safety error.
7. Delete test objects and remove the temporary bucket path.

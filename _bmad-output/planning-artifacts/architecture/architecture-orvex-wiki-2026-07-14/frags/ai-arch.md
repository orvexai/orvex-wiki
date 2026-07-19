
## Memory ownership boundary (AD-1)

The product **Memory** system-of-record — curated facts + lifecycle + firewall scope — is owned by **orvex-studio-api** (`/v1/memory`), not by ai (spine `iiCcKhGptV` AD-1; ruling 2026-07-14). `orvex-studio-ai` owns **extraction compute** and its ephemeral **chat-recall** (FR-AI11): the `ai_memories` table and the `/api/ai/…/memories` surface are the **chat-recall** store, distinct from the product Memory SoR. Retrieval of Memory is a `knowledge` call under the caller's delegated principal (I-4). Fold-in map: `vBvVDFklZo`.

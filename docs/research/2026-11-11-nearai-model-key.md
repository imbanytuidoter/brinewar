# Ключ моделі NEAR AI для Наварха

Дата: 2026-11-11. Живий запит без API-ключа:
`GET https://cloud-api.near.ai/v1/attestation/report?model=Qwen%2FQwen3.8-27B&signing_algo=ed25519&nonce=<32 випадкові байти hex>` → 200.

| поле | значення |
|---|---|
| model_attestations[0].model_name | Qwen/Qwen3.8-27B |
| signing_algo | ed25519 |
| signing_public_key | 89154a43a47684742c3d1753252bb6f49f61da9d8c84fc9b1def2df130cb2d93 |
| request_nonce | наш nonce (94066f1f…984d), тобто звіт свіжий |
| intel_quote, nvidia_payload | присутні |
| app_name | dstack-nvidia-0.5.12 |

Висновок: ключ з Psephex (08.11) досі атестований для цієї моделі. Для `set_model` беремо `Qwen/Qwen3.8-27B` і цей ключ.

Не перевірено: чи `GET /v1/signature/<chat_id>?signing_algo=ed25519` для реальної відповіді підписаний саме цим ключем і текстом `model:sha256(request):sha256(response)`. Потрібен API-ключ тімейта, перевіряємо в етапі 4 першою ж живою партією (у Psephex 08.11 схема така: `docs/evidence/runs/1-signature.json`).

Контракт TDX-quote сам не перевіряє, ключ закріплює власник після цієї перевірки (межа SPEC 1).

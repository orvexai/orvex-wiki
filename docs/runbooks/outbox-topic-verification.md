# Wiki outbox topic verification (ENG-3790)

This runbook is the live-cluster check for the two Kafka topics that this
repository configures but does not provision. The platform/events owner, who
maintains the `my-idp-apps` `studio-events` KafkaTopic declarations, owns the
broker-side confirmation. The wiki owner owns the pod configuration and boot
log confirmation.

## Expected routing

| Environment | Wiki namespace | `KAFKA_OUTBOX_TOPIC` | Required shape |
| --- | --- | --- | --- |
| Prod | `orvex-wiki` | `wiki-events.eu-central-1` | one partition |
| Dev | `orvex-wiki-dev` | `wiki-events.dev.eu-central-1` | one partition |

## Procedure

1. In the `my-idp-apps` `studio-events` deployment source, confirm that a
   `KafkaTopic` declaration exists for each expected topic. Confirm the live
   resources are Ready and have exactly one partition; do not create topics
   manually as a substitute for the GitOps declaration.

2. Inspect the running wiki pods and confirm the environment received the
   matching value from `ConfigMap/orvex-wiki-env`:

   ```sh
   kubectl -n orvex-wiki exec deploy/orvex-wiki -- printenv KAFKA_OUTBOX_TOPIC
   kubectl -n orvex-wiki-dev exec deploy/orvex-wiki -- printenv KAFKA_OUTBOX_TOPIC
   ```

   The results must be `wiki-events.eu-central-1` and
   `wiki-events.dev.eu-central-1`, respectively. Also confirm
   `KAFKA_BROKERS` points at the shared platform Kafka bootstrap service.

3. Review each pod's startup log for the matching successful assertion:

   ```text
   Outbox topic-shape assertion OK: <topic> exists with 1 partition
   ```

   The `<topic>` value must match that environment's ConfigMap and KafkaTopic.
   A `topic ... does not exist on the configured brokers` message means the
   topic was not provisioned or the pod is pointed at the wrong broker and
   must be corrected before event delivery is considered verified.

4. Exercise one wiki mutation and confirm the outbox row is marked
   `relayed_at`, then confirm the event is readable from the corresponding
   topic with the wiki consumer tooling. The ENG-3576 retry loop should remain
   clear after the mutation; a continuing loop is corroborating evidence of a
   broker, topic, or consumer mismatch, not proof that the topic exists.

Record the operator, timestamp, cluster, topic metadata, pod values, and the
matching boot-log lines in the deployment change evidence. This live check is
outside the repository's unit and render tests because the KafkaTopic CRs and
broker state are owned by `my-idp-apps` and the platform/events owner.

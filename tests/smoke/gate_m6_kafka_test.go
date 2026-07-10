package smoke

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	kafka "github.com/segmentio/kafka-go"
)

// gateM6ScanTopicOnce takes one real pass over every partition of topic
// (earliest -> the partition's offset at call time — a bounded window, never
// an indefinite tail) on the REAL broker set, looking for a message whose
// JSON value decodes with `aggregateId == wantAggregateID`. It never mocks
// or substitutes an in-memory broker (CS §5 — Kafka here is remote-but-owned
// infra, not this repo's own package); AC2 exists precisely to prove the
// real relay->real broker leg, so the double the unit-level
// `InMemoryKafkaPublisher` uses is deliberately NOT reused here.
//
// Returns (nil, nil) on a clean scan with no match (the caller polls again
// — the relay ticks every 2s); returns (nil, err) only on a genuine
// connectivity/protocol failure so the caller can FAIL LOUDLY rather than
// silently give up.
func gateM6ScanTopicOnce(
	t *testing.T,
	brokers []string,
	topic string,
	wantAggregateID string,
) (map[string]any, error) {
	t.Helper()
	if len(brokers) == 0 {
		return nil, fmt.Errorf("no Kafka brokers configured")
	}

	dialer := &kafka.Dialer{Timeout: opTimeout}
	ctx, cancel := context.WithTimeout(context.Background(), opTimeout)
	defer cancel()

	conn, err := dialer.DialContext(ctx, "tcp", brokers[0])
	if err != nil {
		return nil, fmt.Errorf("dial broker %s: %w", brokers[0], err)
	}
	defer func() { _ = conn.Close() }()

	partitions, err := conn.ReadPartitions(topic)
	if err != nil {
		return nil, fmt.Errorf("read partitions for topic %q: %w", topic, err)
	}
	if len(partitions) == 0 {
		return nil, fmt.Errorf("topic %q reports zero partitions", topic)
	}

	for _, p := range partitions {
		msg, err := gateM6ScanPartition(dialer, brokers[0], topic, p.ID, wantAggregateID)
		if err != nil {
			return nil, fmt.Errorf("scan partition %d: %w", p.ID, err)
		}
		if msg != nil {
			return msg, nil
		}
	}
	return nil, nil
}

// gateM6ScanPartition reads partition [firstOffset, lastOffsetAtCallTime)
// once — a bounded, terminating window, not an indefinite tail — decoding
// each message value as JSON and returning the first one whose
// `aggregateId` field matches.
func gateM6ScanPartition(
	dialer *kafka.Dialer,
	broker, topic string,
	partition int,
	wantAggregateID string,
) (map[string]any, error) {
	ctx, cancel := context.WithTimeout(context.Background(), opTimeout)
	defer cancel()

	pconn, err := dialer.DialLeader(ctx, "tcp", broker, topic, partition)
	if err != nil {
		return nil, fmt.Errorf("dial partition leader: %w", err)
	}
	defer func() { _ = pconn.Close() }()

	first, err := pconn.ReadFirstOffset()
	if err != nil {
		return nil, fmt.Errorf("read first offset: %w", err)
	}
	last, err := pconn.ReadLastOffset()
	if err != nil {
		return nil, fmt.Errorf("read last offset: %w", err)
	}
	if last <= first {
		return nil, nil // empty partition — not an error, just nothing (yet) to find.
	}

	if _, err := pconn.Seek(first, kafka.SeekAbsolute); err != nil {
		return nil, fmt.Errorf("seek to first offset %d: %w", first, err)
	}

	for offset := first; offset < last; {
		_ = pconn.SetReadDeadline(time.Now().Add(opTimeout))
		msg, err := pconn.ReadMessage(1 << 20)
		if err != nil {
			return nil, fmt.Errorf("read message at offset %d: %w", offset, err)
		}
		offset = msg.Offset + 1

		var decoded map[string]any
		if json.Unmarshal(msg.Value, &decoded) != nil {
			continue // a non-JSON message on this topic is not this test's concern.
		}
		if aggID, ok := decoded["aggregateId"].(string); ok && aggID == wantAggregateID {
			return decoded, nil
		}
	}
	return nil, nil
}

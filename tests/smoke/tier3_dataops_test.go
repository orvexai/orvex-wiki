package smoke

import (
	"bytes"
	"context"
	"io"
	"testing"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/stretchr/testify/require"
)

// TestTier3DataOps exercises a full write/read/delete round-trip against each
// engine, staying strictly side-effect-free on the product schema: Postgres
// uses a TEMP table inside a rolled-back transaction; Redis and S3 use random,
// self-cleaning keys under dedicated `smoke:` / `smoke/` namespaces.
// Addressable via `go test -run TestTier3`.
func TestTier3DataOps(t *testing.T) {
	tests := []struct {
		name string
		run  func(t *testing.T)
	}{
		{
			name: "postgres_temp_table_roundtrip",
			run: func(t *testing.T) {
				ctx := opContext(t)
				conn := connectPostgres(t)

				tx, err := conn.Begin(ctx)
				require.NoError(t, err, "postgres: BEGIN failed")
				// Rollback leaves the product schema untouched even on success.
				defer func() { _ = tx.Rollback(ctx) }()

				_, err = tx.Exec(ctx,
					`CREATE TEMP TABLE smoke_roundtrip (id int PRIMARY KEY, note text) ON COMMIT DROP`)
				require.NoError(t, err, "postgres: CREATE TEMP TABLE failed")

				const wantNote = "orvex-wiki-smoke"
				_, err = tx.Exec(ctx,
					`INSERT INTO smoke_roundtrip (id, note) VALUES ($1, $2)`, 1, wantNote)
				require.NoError(t, err, "postgres: INSERT failed")

				var gotID int
				var gotNote string
				err = tx.QueryRow(ctx,
					`SELECT id, note FROM smoke_roundtrip WHERE id = $1`, 1).Scan(&gotID, &gotNote)
				require.NoError(t, err, "postgres: SELECT failed")
				require.Equal(t, 1, gotID, "postgres: round-tripped id mismatch")
				require.Equal(t, wantNote, gotNote, "postgres: round-tripped note mismatch")
			},
		},
		{
			name: "redis_set_get_del_roundtrip",
			run: func(t *testing.T) {
				ctx := opContext(t)
				client := connectRedis(t)

				key := "smoke:" + randToken(t)
				const value = "orvex-wiki-smoke"
				// TTL is a safety net so an aborted run cannot leak the key.
				require.NoError(t, client.Set(ctx, key, value, time.Minute).Err(),
					"redis: SET %s failed", key)

				got, err := client.Get(ctx, key).Result()
				require.NoError(t, err, "redis: GET %s failed", key)
				require.Equal(t, value, got, "redis: round-tripped value mismatch")

				removed, err := client.Del(ctx, key).Result()
				require.NoError(t, err, "redis: DEL %s failed", key)
				require.Equal(t, int64(1), removed, "redis: DEL removed unexpected key count")
			},
		},
		{
			name: "s3_put_get_delete_roundtrip",
			run: func(t *testing.T) {
				ctx := opContext(t)
				client, bucket := newS3Client(t)

				key := "smoke/" + randToken(t)
				payload := []byte("orvex-wiki-smoke-" + randToken(t))
				// Backstop cleanup with a fresh context in case an assertion below
				// aborts before the explicit RemoveObject runs.
				defer func() {
					cleanupCtx, cancel := context.WithTimeout(context.Background(), opTimeout)
					defer cancel()
					_ = client.RemoveObject(cleanupCtx, bucket, key, minio.RemoveObjectOptions{})
				}()

				_, err := client.PutObject(ctx, bucket, key,
					bytes.NewReader(payload), int64(len(payload)),
					minio.PutObjectOptions{ContentType: "application/octet-stream"})
				require.NoError(t, err, "s3: PutObject %q failed", key)

				obj, err := client.GetObject(ctx, bucket, key, minio.GetObjectOptions{})
				require.NoError(t, err, "s3: GetObject %q failed", key)
				body, err := io.ReadAll(obj)
				_ = obj.Close()
				require.NoError(t, err, "s3: reading object %q body failed", key)
				require.Equal(t, payload, body, "s3: round-tripped object body mismatch")

				err = client.RemoveObject(ctx, bucket, key, minio.RemoveObjectOptions{})
				require.NoError(t, err, "s3: RemoveObject %q failed", key)

				_, statErr := client.StatObject(ctx, bucket, key, minio.StatObjectOptions{})
				require.Error(t, statErr, "s3: object %q still present after delete", key)
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, tc.run)
	}
}

package smoke

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// TestTier1Infra proves raw connectivity to each engine in the claimed subset:
// Postgres (connect + SELECT 1), Redis (AUTH+PING) and S3 (HeadBucket). No
// product data is touched. Addressable via `go test -run TestTier1`.
func TestTier1Infra(t *testing.T) {
	tests := []struct {
		name string
		run  func(t *testing.T)
	}{
		{
			name: "postgres_connect_select_1",
			run: func(t *testing.T) {
				ctx := opContext(t)
				conn := connectPostgres(t)

				var one int
				err := conn.QueryRow(ctx, "SELECT 1").Scan(&one)
				require.NoError(t, err, "postgres: SELECT 1 failed")
				require.Equal(t, 1, one, "postgres: SELECT 1 returned unexpected value")
			},
		},
		{
			name: "redis_auth_ping",
			run: func(t *testing.T) {
				ctx := opContext(t)
				client := connectRedis(t)

				pong, err := client.Ping(ctx).Result()
				require.NoError(t, err, "redis: AUTH+PING failed")
				require.Equal(t, "PONG", pong, "redis: PING returned unexpected response")
			},
		},
		{
			name: "s3_head_bucket",
			run: func(t *testing.T) {
				ctx := opContext(t)
				client, bucket := newS3Client(t)

				exists, err := client.BucketExists(ctx, bucket)
				require.NoError(t, err, "s3: HeadBucket on %q failed", bucket)
				require.True(t, exists, "s3: bucket %q does not exist", bucket)
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, tc.run)
	}
}

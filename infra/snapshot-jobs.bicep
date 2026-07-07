// Ephemeral-state snapshot + rehydrate Jobs (ACA Jobs, Manual trigger).
// Capture the CURRENT LIVE state of the four ephemeral stores to the durable `snapshots` share and
// restore it back — NOT the one-off migration seed. Strategy: analysis/10-ephemeral-state-snapshots.md.
// Requires the `snapshots` managed-environment storage from snapshots-storage.bicep.
// Trigger via `az rest .../start` (see scripts/azure/snapshot-all.ps1 and restore-all.ps1).
//
// Naming: `<store>-snapshot` = capture live -> share, `<store>-rehydrate` = share -> store.
// All shell one-liners are single-line (CRLF-safe); single quotes are doubled for Bicep.
param location string = resourceGroup().location
param environmentName string = 'cae-spark-demo'

@secure()
param dbPassword string

@secure()
param s3AccessKey string

@secure()
param s3SecretKey string

@secure()
param spicedbToken string

var snapshotsVolume = [
  {
    name: 'snapshots'
    storageType: 'AzureFile'
    storageName: 'snapshots'
  }
]
var snapshotsMount = [
  {
    volumeName: 'snapshots'
    mountPath: '/snapshots'
  }
]

resource env 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: environmentName
}

// ---------------------------------------------------------------------------
// PostgreSQL — dump every non-template DB (app DBs + Temporal) in custom format
// ---------------------------------------------------------------------------
resource pgSnapshot 'Microsoft.App/jobs@2023-05-01' = {
  name: 'pg-snapshot'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 1
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      secrets: [
        { name: 'db-password', value: dbPassword }
      ]
    }
    template: {
      volumes: snapshotsVolume
      containers: [
        {
          name: 'snapshot'
          image: 'pgvector/pgvector:pg16'
          command: [ '/bin/sh', '-c' ]
          args: [
            'export PGPASSWORD="$DB_PASSWORD"; until pg_isready -h postgresql -U postgres; do echo waiting-postgres; sleep 2; done; mkdir -p /snapshots/pg; echo dumping-globals; pg_dumpall -h postgresql -U postgres --globals-only -f /snapshots/pg/globals.sql; for db in $(psql -h postgresql -U postgres -Atqc "SELECT datname FROM pg_database WHERE datallowconn AND NOT datistemplate AND datname <> \'postgres\'"); do echo dumping-$db; pg_dump -h postgresql -U postgres -Fc --no-owner --no-privileges -d "$db" -f /snapshots/pg/$db.dump; done; echo listing:; ls -la /snapshots/pg; echo pg-snapshot-done'
          ]
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
          env: [
            { name: 'DB_PASSWORD', secretRef: 'db-password' }
          ]
          volumeMounts: snapshotsMount
        }
      ]
    }
  }
}

resource pgRehydrate 'Microsoft.App/jobs@2023-05-01' = {
  name: 'pg-rehydrate'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 1
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      secrets: [
        { name: 'db-password', value: dbPassword }
      ]
    }
    template: {
      volumes: snapshotsVolume
      containers: [
        {
          name: 'rehydrate'
          image: 'pgvector/pgvector:pg16'
          command: [ '/bin/sh', '-c' ]
          args: [
            'export PGPASSWORD="$DB_PASSWORD"; until pg_isready -h postgresql -U postgres; do echo waiting-postgres; sleep 2; done; if [ -f /snapshots/pg/globals.sql ]; then echo restoring-globals; psql -h postgresql -U postgres -f /snapshots/pg/globals.sql || true; fi; for f in /snapshots/pg/*.dump; do [ -e "$f" ] || continue; db=$(basename "$f" .dump); echo restoring-$db; createdb -h postgresql -U postgres "$db" 2>/dev/null || true; pg_restore -h postgresql -U postgres -d "$db" --no-owner --no-privileges --clean --if-exists "$f" || true; done; echo pg-rehydrate-done'
          ]
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
          env: [
            { name: 'DB_PASSWORD', secretRef: 'db-password' }
          ]
          volumeMounts: snapshotsMount
        }
      ]
    }
  }
}

// ---------------------------------------------------------------------------
// Qdrant — snapshot every collection and download it to the share
// ---------------------------------------------------------------------------
resource qdrantSnapshot 'Microsoft.App/jobs@2023-05-01' = {
  name: 'qdrant-snapshot'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 900
      replicaRetryLimit: 1
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
    }
    template: {
      volumes: snapshotsVolume
      containers: [
        {
          name: 'snapshot'
          image: 'curlimages/curl:8.11.1'
          command: [ '/bin/sh', '-c' ]
          args: [
            'until curl -sf http://qdrant:6333/ >/dev/null; do echo waiting-qdrant; sleep 2; done; mkdir -p /snapshots/qdrant; rm -f /snapshots/qdrant/*.snapshot; for c in $(curl -sS http://qdrant:6333/collections | grep -o \'"name":"[^"]*"\' | sed \'s/.*://;s/"//g\'); do echo snapshotting-$c; snap=$(curl -sS -X POST http://qdrant:6333/collections/$c/snapshots | grep -o \'"name":"[^"]*"\' | sed \'s/.*://;s/"//g\' | head -n1); echo downloading-$snap; curl -sS "http://qdrant:6333/collections/$c/snapshots/$snap" -o /snapshots/qdrant/$c.snapshot; done; ls -la /snapshots/qdrant; echo qdrant-snapshot-done'
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          volumeMounts: snapshotsMount
        }
      ]
    }
  }
}

resource qdrantRehydrate 'Microsoft.App/jobs@2023-05-01' = {
  name: 'qdrant-rehydrate'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 900
      replicaRetryLimit: 1
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
    }
    template: {
      volumes: snapshotsVolume
      containers: [
        {
          name: 'rehydrate'
          image: 'curlimages/curl:8.11.1'
          command: [ '/bin/sh', '-c' ]
          args: [
            'until curl -sf http://qdrant:6333/ >/dev/null; do echo waiting-qdrant; sleep 2; done; for f in /snapshots/qdrant/*.snapshot; do [ -e "$f" ] || continue; c=$(basename "$f" .snapshot); echo restoring-$c; curl -sS -X POST "http://qdrant:6333/collections/$c/snapshots/upload?priority=snapshot" -F "snapshot=@$f"; echo; done; echo verify:; curl -sS http://qdrant:6333/collections; echo; echo qdrant-rehydrate-done'
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          volumeMounts: snapshotsMount
        }
      ]
    }
  }
}

// ---------------------------------------------------------------------------
// MinIO — mirror each app bucket to the share (incl. temporal-payloads)
// ---------------------------------------------------------------------------
resource minioSnapshot 'Microsoft.App/jobs@2023-05-01' = {
  name: 'minio-snapshot'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 900
      replicaRetryLimit: 1
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      secrets: [
        { name: 's3-access-key', value: s3AccessKey }
        { name: 's3-secret-key', value: s3SecretKey }
      ]
    }
    template: {
      volumes: snapshotsVolume
      containers: [
        {
          name: 'snapshot'
          image: 'minio/mc'
          command: [ '/bin/sh', '-c' ]
          args: [
            'until mc alias set az http://minio:9000 "$S3_KEY" "$S3_SECRET" >/dev/null 2>&1; do echo waiting-minio; sleep 2; done; for b in dms-local temporal-payloads quarantine-bucket; do echo mirroring-$b; mc mirror --overwrite --remove az/$b /snapshots/minio/$b || true; done; echo COUNT:; mc ls --recursive az | wc -l; echo minio-snapshot-done'
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'S3_KEY', secretRef: 's3-access-key' }
            { name: 'S3_SECRET', secretRef: 's3-secret-key' }
          ]
          volumeMounts: snapshotsMount
        }
      ]
    }
  }
}

resource minioRehydrate 'Microsoft.App/jobs@2023-05-01' = {
  name: 'minio-rehydrate'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 900
      replicaRetryLimit: 1
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      secrets: [
        { name: 's3-access-key', value: s3AccessKey }
        { name: 's3-secret-key', value: s3SecretKey }
      ]
    }
    template: {
      volumes: snapshotsVolume
      containers: [
        {
          name: 'rehydrate'
          image: 'minio/mc'
          command: [ '/bin/sh', '-c' ]
          args: [
            'until mc alias set az http://minio:9000 "$S3_KEY" "$S3_SECRET" >/dev/null 2>&1; do echo waiting-minio; sleep 2; done; for b in dms-local temporal-payloads quarantine-bucket; do echo restoring-$b; mc mb -p az/$b || true; mc mirror --overwrite --remove /snapshots/minio/$b az/$b || true; done; echo COUNT:; mc ls --recursive az | wc -l; echo minio-rehydrate-done'
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'S3_KEY', secretRef: 's3-access-key' }
            { name: 'S3_SECRET', secretRef: 's3-secret-key' }
          ]
          volumeMounts: snapshotsMount
        }
      ]
    }
  }
}

// ---------------------------------------------------------------------------
// SpiceDB — zed backup captures schema + all live relationships in one file
// (authzed/zed entrypoint is `zed`; no shell — write directly to the share root)
// ---------------------------------------------------------------------------
resource spicedbSnapshot 'Microsoft.App/jobs@2023-05-01' = {
  name: 'spicedb-snapshot'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 300
      replicaRetryLimit: 2
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      secrets: [
        { name: 'zed-token', value: spicedbToken }
      ]
    }
    template: {
      volumes: snapshotsVolume
      containers: [
        {
          name: 'snapshot'
          image: 'authzed/zed:latest'
          args: [
            'backup'
            'create'
            '/snapshots/spicedb-relationships.zedbackup'
            '--endpoint'
            'spicedb:50051'
            '--token'
            '$(ZED_TOKEN)'
            '--insecure'
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'ZED_TOKEN', secretRef: 'zed-token' }
          ]
          volumeMounts: snapshotsMount
        }
      ]
    }
  }
}

resource spicedbRehydrate 'Microsoft.App/jobs@2023-05-01' = {
  name: 'spicedb-rehydrate'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 300
      replicaRetryLimit: 2
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      secrets: [
        { name: 'zed-token', value: spicedbToken }
      ]
    }
    template: {
      volumes: snapshotsVolume
      containers: [
        {
          name: 'rehydrate'
          image: 'authzed/zed:latest'
          args: [
            'backup'
            'restore'
            '/snapshots/spicedb-relationships.zedbackup'
            '--endpoint'
            'spicedb:50051'
            '--token'
            '$(ZED_TOKEN)'
            '--insecure'
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'ZED_TOKEN', secretRef: 'zed-token' }
          ]
          volumeMounts: snapshotsMount
        }
      ]
    }
  }
}

"""Download the local MinIO dms-local bucket to a staging dir for migration to Azure MinIO."""
import os
import pathlib

import boto3

ROOT = pathlib.Path(__file__).resolve().parents[2]
env = {}
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()

s3 = boto3.client(
    "s3",
    endpoint_url="http://localhost:9000",
    aws_access_key_id=env["S3_ACCESS_KEY_ID"],
    aws_secret_access_key=env["S3_SECRET_ACCESS_KEY"],
)
buckets = [b["Name"] for b in s3.list_buckets()["Buckets"]]
print("buckets:", buckets)

stage = pathlib.Path(os.environ["TEMP"]) / "minio-mig"
total = 0
nobj = 0
for bucket in ["dms-local"]:
    if bucket not in buckets:
        print(f"  {bucket}: not present, skip")
        continue
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket):
        for obj in page.get("Contents", []):
            key, sz = obj["Key"], obj["Size"]
            dest = stage / bucket / key
            dest.parent.mkdir(parents=True, exist_ok=True)
            s3.download_file(bucket, key, str(dest))
            total += sz
            nobj += 1
print(f"downloaded {nobj} objects, {total / 1e6:.1f} MB to {stage}")

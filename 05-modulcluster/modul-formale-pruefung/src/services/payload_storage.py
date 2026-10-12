"""S3 payload storage for Temporal.

Large payloads are offloaded to S3 instead of travelling inline, which keeps
document lists and Inhaltsverzeichnis chunks under the Temporal payload limit.
Every client that runs FVP workflows needs it, not just the production worker.
"""

from temporal.s3_payload_storage import S3PayloadStorage

from src.config.env import ENV


def create_payload_storage() -> S3PayloadStorage:
    """Build the payload storage from the environment."""
    return S3PayloadStorage(
        bucket_name=ENV.TEMPORAL.S3_BUCKET_NAME,
        endpoint_url=ENV.TEMPORAL.S3_ENDPOINT_URL,
        access_key=ENV.TEMPORAL.S3_ACCESS_KEY_ID.get_secret_value(),
        secret_key=ENV.TEMPORAL.S3_SECRET_ACCESS_KEY.get_secret_value(),
        region=ENV.TEMPORAL.S3_REGION,
    )

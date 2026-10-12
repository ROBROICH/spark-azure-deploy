from pydantic import BaseModel, ConfigDict, Field, SecretStr


class TemporalHostConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    HOST: str = Field(min_length=1)


class TemporalConfig(TemporalHostConfig):
    S3_BUCKET_NAME: str = Field(min_length=1)
    S3_ENDPOINT_URL: str = Field(min_length=1)
    S3_ACCESS_KEY_ID: SecretStr = Field(min_length=1)
    S3_SECRET_ACCESS_KEY: SecretStr = Field(min_length=1)
    S3_REGION: str

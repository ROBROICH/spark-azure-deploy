from sqlalchemy import String
from sqlalchemy.orm import DeclarativeBase, mapped_column
from sqlalchemy.orm.attributes import Mapped
from sqlalchemy.sql.functions import func
from sqlalchemy.sql.sqltypes import DateTime


class Base(DeclarativeBase):
    pass


class SpiceDBMigration(Base):
    __tablename__ = "spicedb_migrations"

    version: Mapped[str] = mapped_column(String, primary_key=True)
    applied_at: Mapped[str] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

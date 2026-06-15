"""Unit tests for file content validation (shebang detection, BOM handling)."""

import pytest

from src.config.settings import settings
from src.services.files.file_validation import validate_file_upload
from src.utils.exceptions import (
    FileInvalidFileExtensionError,
    FileInvalidFileTypeError,
)


@pytest.mark.parametrize(
    "shebang",
    [
        b"#!/bin/bash\necho pwned\n",
        b"#!/bin/sh\nrm -rf /\n",
        b"#!/usr/bin/env python3\nimport os\n",
        b"#!/usr/bin/perl\nsystem('ls')\n",
        b"#!/usr/bin/env node\nprocess.exit()\n",
        b"#! /bin/bash\necho hi\n",  # with space after #!
    ],
)
def test_shebang_content_rejected_by_validation(shebang):
    """Any file starting with a shebang is rejected by content validation."""
    with pytest.raises(FileInvalidFileTypeError):
        validate_file_upload(
            filename="script.json",  # allowed extension
            allowed_extensions=settings.ALLOWED_FILE_EXTENSIONS,
            allowed_mime_types=settings.ALLOWED_FILE_TYPES,
            content_bytes=shebang,
        )


@pytest.mark.parametrize(
    "bom",
    [
        b"\xef\xbb\xbf",  # UTF-8 BOM
        b"\xff\xfe",  # UTF-16 LE BOM
        b"\xfe\xff",  # UTF-16 BE BOM
    ],
)
def test_bom_prefixed_shebang_rejected(bom):
    """A shebang preceded by a BOM is still rejected."""
    content = bom + b"#!/bin/bash\necho pwned\n"
    with pytest.raises(FileInvalidFileTypeError):
        validate_file_upload(
            filename="script.json",
            allowed_extensions=settings.ALLOWED_FILE_EXTENSIONS,
            allowed_mime_types=settings.ALLOWED_FILE_TYPES,
            content_bytes=content,
        )


def test_csv_upload_allowed_for_public_validation():
    """CSV files are valid for the Erwiderungs-specific DMS allow-list."""
    mime_type = validate_file_upload(
        filename="erwiderungen.csv",
        allowed_extensions=settings.ERWIDERUNGS_ALLOWED_FILE_EXTENSIONS,
        allowed_mime_types=settings.ERWIDERUNGS_ALLOWED_FILE_TYPES,
    )

    assert mime_type == "text/csv"


def test_csv_upload_rejected_by_general_public_validation():
    """CSV files are not valid for general public DMS uploads."""
    with pytest.raises(FileInvalidFileExtensionError):
        validate_file_upload(
            filename="erwiderungen.csv",
            allowed_extensions=settings.PUBLIC_ALLOWED_FILE_EXTENSIONS,
            allowed_mime_types=settings.PUBLIC_ALLOWED_FILE_TYPES,
        )


def test_csv_content_allowed_for_public_validation():
    """CSV content is valid even when byte-level magic cannot identify it."""
    mime_type = validate_file_upload(
        filename="erwiderungen.csv",
        allowed_extensions=settings.ERWIDERUNGS_ALLOWED_FILE_EXTENSIONS,
        allowed_mime_types=settings.ERWIDERUNGS_ALLOWED_FILE_TYPES,
        content_bytes=b"argument,erwiderung\nA,B\n",
    )

    assert mime_type == "text/csv"

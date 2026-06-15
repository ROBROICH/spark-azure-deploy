"""Enums for Supplementary Requests Service."""

from enum import Enum


class Priority(str, Enum):
    """Supplementary request priority."""

    MUST = "must"
    SHOULD = "should"


class ProcessStep(str, Enum):
    """Process step that generated the supplementary request."""

    FORMAL_COMPLETENESS_CHECK = "formalCompletenessCheck"
    PLAUSIBILITY_CHECK = "plausibilityCheck"
    MATERIAL_COMPLETENESS_CHECK = "materialCompletenessCheck"
    LEGAL_REVIEW = "legalReview"


class SourceType(str, Enum):
    """Source reference type for the supplementary request."""

    TABLE_OF_CONTENTS = "tableOfContents"
    REQUIRED_DOCUMENTS = "requiredDocuments"
    CONTRADICTION = "contradiction"
    MATERIAL_LAW = "materialLaw"
    MATERIAL_NORM = "materialNorm"
    MATERIAL_SATZ = "materialSatz"
    MATERIAL_FUNDSTELLE = "materialFundstelle"
    MANUAL = "manual"

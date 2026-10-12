"""Application entry point — starts the Temporal worker."""

# ruff: noqa: E402
import asyncio
import contextlib

from temporal.observability import (
    ObservabilityConfig,
    setup_observability,
    shutdown_observability,
)

from src.env import ENV

setup_observability(
    ObservabilityConfig(
        service_name=ENV.OTEL_SERVICE_NAME,
        otel_endpoint=ENV.OTEL_ENDPOINT,
    )
)

from temporal.registry import RECHTSMETHODIK_WORKFLOW
from temporal.s3_payload_storage import S3PayloadStorage
from temporal.worker import start_temporal_worker

from src.activities import activities
from src.workflows.legal_definitionen.erkennung.lde import LegalDefinitionenExtrahiererAgent
from src.workflows.legal_definitionen.legal_definitionen_workflow import LegalDefinitionenWorkflow
from src.workflows.load_norm.load_norm import LoadNormWorkflow
from src.workflows.main_workflow import RechtsmethodikWorkflow
from src.workflows.norm_workflow.atomarisierung.at import AtomarisierungsAgentWorkflow
from src.workflows.norm_workflow.norm_main_workflow import NormDekonstruktionWorkflow
from src.workflows.norm_workflow.normtyp.nt import NormTypAgentWorkflow
from src.workflows.norm_workflow.praedikatenlogik.pm import (
    PraedikatenlogikModelliererAgentWorkflow,
)
from src.workflows.norm_workflow.regelungsgegenstand.rgi import (
    RegelungsgegenstandsIdentifikatorAgentWorkflow,
)
from src.workflows.norm_workflow.rf_konstrukteur.rk import (
    RechtsfolgeKonstrukteurAgentWorkflow,
)
from src.workflows.norm_workflow.satz_kategorie.sk import (
    SatzKategorieAgentWorkflow,
)
from src.workflows.rf_workflow.adressaten_ermessen_workflow.adressaten_ermessen_workflow import (
    AdressatenErmessenWorkflow,
)
from src.workflows.rf_workflow.adressaten_ermessen_workflow.ermessensart.ea import (
    ErmessensArtAgentWorkflow,
)
from src.workflows.rf_workflow.adressaten_ermessen_workflow.ermessensspielraum_identifikation.ei import (
    ErmessensIdentifikationsAgentWorkflow,
)
from src.workflows.rf_workflow.adressaten_ermessen_workflow.rechtsfolgen_adressat.ra import (
    RechtsfolgenAdressatenAgentWorkflow,
)
from src.workflows.rf_workflow.rf_main_workflow import RechtsfolgenAnalyseWorkflow
from src.workflows.rf_workflow.sollensanordnungen.sa import (
    SollensanordnungsAgentWorkflow,
)
from src.workflows.tbm_workflow.formelextraktion.fe import (
    FormelExtrahiererAgentWorkflow,
)
from src.workflows.tbm_workflow.pruefformulierung.pf import (
    PruefFormulierungsAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.bestimmte_rechtsbegriffe.bre import (
    BestimmteRechtsbegriffeErkennerAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.rechtsbegriffe_workflow import (
    RechtsbegriffeWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_workflow import (
    AuslegungWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.ergebnis.ef import (
    ErgebnisFormuliererAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.historie.ha import (
    HistorieAuslegerAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.drucksachen.dkr import (
    DrucksachenKontextRetrievalAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.enrich_context_workflow import (
    EnrichContextWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.urteile.ukr import (
    UrteileKontextRetrievalAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.systematik.sa import (
    SystematikAuslegerAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.telos.ta import (
    TelosAuslegerAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.urteil_klassifikation.uk import (
    UrteilKlassifikationAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.auslegung.wa import (
    WortlautAuslegerAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.extractor.we import (
    WortlautWordExtractorAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.wortlaut.wortlaut_workflow import (
    WortlautAuslegungWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.erkennung.ure import (
    UnbestimmteRechtsbegriffeErkennerAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.pruefung.urp import (
    UnbestimmteRechtsbegriffePrueferAgentWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.unbestimmte_rechtsbegriffe_workflow import (
    UnbestimmteRechtsbegriffeWorkflow,
)
from src.workflows.tbm_workflow.tbm_main_workflow import TatbestandsAnalyseWorkflow
from src.workflows.tbm_workflow.verweis.verweis_explizit.ve import (
    VerweisExplizitAgentWorkflow,
)
from src.workflows.tbm_workflow.verweis.verweis_implizit.vi import (
    VerweisImplizitAgentWorkflow,
)
from src.workflows.tbm_workflow.verweis.verweis_workflow import VerweisWorkflow

WORKFLOWS = [
    RechtsmethodikWorkflow,
    LoadNormWorkflow,
    NormDekonstruktionWorkflow,
    NormTypAgentWorkflow,
    SatzKategorieAgentWorkflow,
    PraedikatenlogikModelliererAgentWorkflow,
    AtomarisierungsAgentWorkflow,
    RegelungsgegenstandsIdentifikatorAgentWorkflow,
    TatbestandsAnalyseWorkflow,
    FormelExtrahiererAgentWorkflow,
    PruefFormulierungsAgentWorkflow,
    RechtsbegriffeWorkflow,
    BestimmteRechtsbegriffeErkennerAgentWorkflow,
    UnbestimmteRechtsbegriffeErkennerAgentWorkflow,
    UnbestimmteRechtsbegriffePrueferAgentWorkflow,
    SystematikAuslegerAgentWorkflow,
    WortlautAuslegungWorkflow,
    WortlautAuslegerAgentWorkflow,
    WortlautWordExtractorAgentWorkflow,
    HistorieAuslegerAgentWorkflow,
    EnrichContextWorkflow,
    UrteileKontextRetrievalAgentWorkflow,
    DrucksachenKontextRetrievalAgentWorkflow,
    VerweisWorkflow,
    VerweisExplizitAgentWorkflow,
    VerweisImplizitAgentWorkflow,
    RechtsfolgenAnalyseWorkflow,
    SollensanordnungsAgentWorkflow,
    RechtsfolgenAdressatenAgentWorkflow,
    ErmessensIdentifikationsAgentWorkflow,
    ErmessensArtAgentWorkflow,
    AdressatenErmessenWorkflow,
    UnbestimmteRechtsbegriffeWorkflow,
    AuslegungWorkflow,
    RechtsfolgeKonstrukteurAgentWorkflow,
    TelosAuslegerAgentWorkflow,
    UrteilKlassifikationAgentWorkflow,
    ErgebnisFormuliererAgentWorkflow,
    LegalDefinitionenExtrahiererAgent,
    LegalDefinitionenWorkflow,
]


async def main() -> None:
    """Start the Temporal worker with all registered workflows and activities."""
    storage = S3PayloadStorage(
        bucket_name=ENV.TEMPORAL.S3_BUCKET_NAME,
        endpoint_url=ENV.TEMPORAL.S3_ENDPOINT_URL,
        access_key=ENV.TEMPORAL.S3_ACCESS_KEY_ID.get_secret_value(),
        secret_key=ENV.TEMPORAL.S3_SECRET_ACCESS_KEY.get_secret_value(),
        region=ENV.TEMPORAL.S3_REGION,
    )
    try:
        await start_temporal_worker(
            host=ENV.TEMPORAL.HOST,
            workflows=WORKFLOWS,
            activities=activities,
            task_queue=RECHTSMETHODIK_WORKFLOW.task_queue,
            storage=storage,
        )
    finally:
        shutdown_observability()


if __name__ == "__main__":
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(main())

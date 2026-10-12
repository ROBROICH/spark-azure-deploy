from temporal.contracts import NormTyp, RechtsmethodikWorkflowOutput

from src.absatz import Absatz
from src.workflows.main_workflow import RechtsmethodikWorkflow
from src.workflows.rf_workflow.rf_types import RechtsfolgenWorkflowResult, RFWorkflowSatzOutput
from src.workflows.tbm_workflow.tbm_types import TBMWorkflowOutput, TBMWorkflowSatzOutput


def test_internal_norm_type_fields_serialize_to_the_public_contract() -> None:
    tbm_satz = TBMWorkflowSatzOutput(
        satz_nr="1",
        markers=[],
        satz_text="Test",
        norm_typ_lvl1=NormTyp.VERFAHRENSRECHTLICH,
    )
    rf_satz = RFWorkflowSatzOutput(
        satz_nr="1",
        markers=[],
        satz_text="Test",
        norm_typ_lvl1=NormTyp.VERFAHRENSRECHTLICH,
    )
    tbm_output = TBMWorkflowOutput(
        gesetz="Testgesetz",
        jurabk="TestG",
        standangaben=[],
        paragraph_nr="1",
        paragraph_titel="Test",
        paragraph_text="Test",
        absaetze=[Absatz(absatz_nr="1", absatz_text="Test", saetze=[tbm_satz])],
        regelungsgegenstand=None,
    )
    rf_output = RechtsfolgenWorkflowResult(absaetze=[Absatz(absatz_nr="1", absatz_text="Test", saetze=[rf_satz])])

    merged = RechtsmethodikWorkflow.merge_tbm_rf(
        tbm_output.model_dump(exclude_none=True),
        rf_output.model_dump(exclude_none=True),
    )

    result = RechtsmethodikWorkflowOutput.model_validate(merged)
    assert result.absaetze[0].saetze[0].norm_typ_lvl1 == NormTyp.VERFAHRENSRECHTLICH
    wire_satz = result.model_dump(by_alias=True)["absaetze"][0]["saetze"][0]
    assert wire_satz["normTypLvl1"] == NormTyp.VERFAHRENSRECHTLICH

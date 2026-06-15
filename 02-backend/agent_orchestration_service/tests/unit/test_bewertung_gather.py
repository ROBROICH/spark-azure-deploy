from uuid import UUID

from src.workflows.bewertung.gather import _reconstruct_atomares_tbm


def test_reconstruct_atomares_tbm_preserves_stored_unbestimmter_rechtsbegriff_auslegung() -> None:
    tbm_id = "00000000-0000-0000-0000-000000000001"
    urb_id = "00000000-0000-0000-0000-000000000002"

    tbm = _reconstruct_atomares_tbm(
        tbm={
            "id": tbm_id,
            "text": "TBM",
            "prueffrage": "Prueffrage?",
            "pruefgegenstand": "Pruefgegenstand",
        },
        brbs_by_tbm={},
        lds_by_brb={},
        urbs_by_tbm={
            tbm_id: [
                {
                    "id": urb_id,
                    "begriff": "oeffentliches Interesse",
                    "auslegung": "Final interpretation",
                }
            ]
        },
        avs_by_urb={},
        explizite_by_tbm={},
        implizite_by_tbm={},
    )

    assert tbm.id == UUID(tbm_id)
    unbestimmter = tbm.rechtsbegriffe.unbestimmte_rechtsbegriffe[0]
    assert unbestimmter.auslegung == "Final interpretation"

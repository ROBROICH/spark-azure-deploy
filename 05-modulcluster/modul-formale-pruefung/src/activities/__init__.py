from src.activities.dms_activities import (
    download_json_from_dms,
    get_inhalts_extraktion_doc_chunks,
    get_inhalts_extraktion_docs,
    upload_temporal_checkpoint,
)

activities = [
    get_inhalts_extraktion_docs,
    get_inhalts_extraktion_doc_chunks,
    upload_temporal_checkpoint,
    download_json_from_dms,
]

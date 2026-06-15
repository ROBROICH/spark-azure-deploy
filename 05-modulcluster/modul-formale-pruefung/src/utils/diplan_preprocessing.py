from typing import Any


def diplan_document_type_preprocessing(
    input_data: dict[str, Any],
) -> list[dict[str, Any]]:
    """Flattens a nested planning application structure into a list of document definitions.

    This helper function transforms the complex, nested folder structure often returned
    by planning APIs (e.g., XPlanung/ELWIS wrappers) into a flat list of dictionaries
    that align with the `DocumentTypeDefinition` schema.

    Structure Expected:
        root -> furtherInformation -> folder[] -> children[]

    Args:
        input_data (Dict[str, Any]): The raw nested JSON dictionary containing
            folder and document requirement structures.

    Returns:
        List[Dict[str, Any]]: A flat list of dictionaries, where each entry represents
        a document type with keys matching `DocumentTypeDefinition` fields
        (category, document_type_name, document_type_description, etc.).
    """
    flattened_records: list[dict[str, Any]] = []

    # Safe navigation through the nested dictionary
    folders = input_data

    for folder in folders:
        # The folder name acts as the 'Category' (e.g., "Umweltfachlicher Teil")
        raw_category = folder.get("name", "").strip()

        for child in folder.get("children", []):
            # The 'contentRequirements' field serves as the description
            requirements = child.get("contentRequirements", "").strip()

            # Use 'name' if requirements are empty to ensure description is not empty
            description = requirements if requirements else child.get("name", "")

            doc_object = {
                "category": raw_category,
                "document_type_name": child.get("name", ""),
                "document_type_description": description,
                # Explicitly mapping optional fields, handled gracefully by Pydantic if missing
                "expected_count": None,
                "id": child.get("id"),
                "is_optional": not child.get("required", True),
            }
            flattened_records.append(doc_object)

    return flattened_records

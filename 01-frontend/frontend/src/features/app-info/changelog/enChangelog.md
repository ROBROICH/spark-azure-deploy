## Version 0.3.0 (12.10.2026)

- An administration area for project types is available, including topic catalogs with legal bases, required documents, and decision templates.
- AI suggestions that need review are flagged: uncertain document assignments in the formal completeness check (“Assignment uncertain”) and uncertain objection classifications. The material completeness check marks the hints to review first.
- Failed processing runs are shown with their cause in the affected area of a procedure.
- CAD and GIS plan sheets are rendered as images during content extraction before they are converted.
- The user manual is available as a searchable website.
- Plausibility check hints are sorted by a new relevance score, and duplicate hints are merged. Repeated passages, copied sentences, and cross-references are also used as indications of possible contradictions.
- In the legal review, the sentence details show the scope and type of discretion for each legal consequence instead of the addressee.
- Users without the administrator role only see procedures they are a member of; administrators still see all procedures.
- PDF redaction stops with an error if text recognition or personal-data detection fails, instead of returning partly unredacted pages. Metadata, annotations, forms, and embedded files are removed.
- ZIP imports no longer fail on automatic retries. Encrypted, split, or otherwise unsupported archives receive specific error messages.
- A failed formal completeness check can be restarted without uploading the documents again.
- For requirements from legal norms, documents are assigned by relevance instead of processing order.
- Legal norm lookups no longer fail when the search returns only one result, and legal norm texts with formatting are split into sentences correctly.
- The default topic catalog cites Article 28(2) of the Basic Law for “Kommunale Belange”.
- Content extraction no longer fails on documents with many chapters.
- SPARK Workflow is now accessible in accordance with BITV 2.0 and EN 301 549.
- Additional bug fixes and optimizations were completed.

## Version 0.2.3 (12.10.2026)

- PDF redaction removes content more reliably: redacted content no longer remains in page objects referenced outside the page structure.
- Additional bug fixes and security updates were completed.

## Version 0.2.2 (10.08.2026)

- A German user manual is available.
- PDF redaction removes digital signatures before redacting.
- The user list no longer shows administrator roles.
- Legal methodology also processes procedures when law documents are missing.

## Version 0.2.1 (15.07.2026)

- The plausibility check was expanded to include bidirectional checks for contradictions between documents (previous scope: checks within one document and between a document and the explanatory report).
- The dialog for editing the legal basis in the material completeness check was expanded to include all available legal norms.
- Notes added during text recognition are removed more reliably so EWMS can process objections without unnecessary security warnings.
- ZIP archives now have more time to extract, so uploads with many or large files are processed more reliably.
- Uploaded files are rejected if the virus scan does not return a clear result.
- The browser tab shows the title of the current page, and focus handling for form input errors was improved.
- Various interface adjustments (including accessibility improvements), bug fixes, and general quality improvements were completed.

## Version 0.2.0-beta (15.06.2026)

- The “Public participation” process step is available.
- Subsequent changes to application documents (for example plan amendments) and rerunning AI analyses are available.
- Legal methodology, risk notes, and feedback functions were implemented in the “Legal review and resolution drafting” work step.
- The redaction assistant is available.
- Objection management (EWMS) features are available in the interface.
- Logging services were implemented.
- Integration with the Fachplanungsportal was completed.
- A role and permission concept was implemented.
- The “Material completeness check” and “Legal review and resolution drafting” process steps are available.
- Adding custom required documents with an identical name is now prevented.
- The “+” and “-” icons in the sensitivity filter now increase and decrease the filter value.
- Control of the embedding interfaces for FVP and PP was refined. The configuration was adjusted so embedding requests from extraction (FVP) and from PP are routed separately to different providers.
- The maximum file size for individual files in uploaded ZIP archives was increased from 128 MB to 1024 MB.
- A changelog was added.
- Additional bug fixes and optimizations were completed.

## Version 0.1.0-beta (31.03.2026)

- The first release state of the application in the BzA-A scope.
- Content extraction from application documents, the formal completeness check, and the plausibility check are available.

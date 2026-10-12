# Agent Orchestration command-test checklist

This is the coverage authority for issue #4337. Every production command crosses the real Python
HTTP listener. Temporal intent is selected through the accepted exact-input fixture seam; the only
route-time peer, Project Logic, is exercised through the production `PlsApiClient` against the
suite-owned fail-closed TCP fake.

| Command                 | Success intent frozen                                                            | Additional meaningful branch                                                                   |
| ----------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| PDF anonymization       | Input PDF bytes and returned PDF media/bytes                                     | Empty and non-PDF uploads return incumbent 400/415                                             |
| FPP download            | Project/file identity, version, queue, allow-duplicate policy                    | Typed configured Temporal failure returns incumbent 500                                        |
| Formal completeness/FVP | Versioned workflow start followed by `IN_PROGRESS` status patch                  | Status-patch failure is warning-only; version lookup failure and unmatched Temporal input fail |
| Single-norm SuZ         | Norm/version identity, queue, priority, allow-duplicate policy                   | Missing project input is rejected before either dependency                                     |
| Batch MVP               | New start result with project-scoped identity                                    | A separate recorded already-started input returns the attached handle identity                 |
| Bewertung               | Norm/version identity, priority, reuse/conflict policies                         | Recorded already-started outcome maps to incumbent 409 code/message                            |
| Risikohinweise          | VAE-node/version identity, priority, reuse/conflict policies                     | Invalid VAE identity is rejected before either dependency                                      |
| Cancellation            | Exact workflow ID and successful result                                          | Recorded cancellation failure maps to incumbent 500 detail; missing path identity is 404       |

All JSON responses are checked as original values with strict TypeBox schemas before parsing.
Binary equality is limited to the actual anonymized-PDF client contract. Project Logic expectations
validate the six audit-context headers, semantic request body, and exact call count. The fixture
startup proof rejects eager Temporal worker and payload-storage construction; successful commands
also run with every Temporal address pointed at a closed loopback endpoint, so a live callback or
Temporal network dependency cannot satisfy the suite.

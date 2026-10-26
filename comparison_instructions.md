# Reusable semantic comparison instruction

Compare `baseline.json` (the human-created Assignment 2 artifact) with `ai_requirements.json` (the LLM-derived artifact) to prepare a factual working draft for a university report. If `baseline.json` is absent and `assignment2_baseline.json` is available, use the latter and record the exact source filename. Do not overwrite either input. If the source is otherwise unclear, request clarification.

The purpose is to help the student identify differences. Do not make the student's critical evaluation, recommend acceptance or rejection, rank document quality, or supply the student's decision or justification.

Read both artifacts completely, including preconditions, postconditions, acceptance criteria, demo instructions, assumptions, and open questions. Compare meaning and observable behavior rather than wording, numbering, field order, spelling, or item counts. Use assumptions and questions as context, not as implemented requirements or evidence that an unresolved behavior is already specified. Do not use the system description to silently fill gaps in either artifact. This is an artifact comparison, not a specification compliance audit.

Cover Functional Requirements, Non-Functional Requirements, User Stories, and Product Backlog. Identify actual IDs and short capability labels on both sides. Qualify baseline IDs by section, because requirement, story, and backlog numbering may differ. Match by purpose, actor, inputs, outputs, conditions, and outcome. Group items describing the same underlying capability, allowing one-to-many and many-to-many matches. Do not force unrelated items into a match. Cross-reference another section when it supplies relevant evidence, while making clear which section contains that evidence.

For each comparison row, start the Difference cell with a classification relative to the baseline:

- **Equivalent:** the compared capability and relevant conditions have the same meaning; wording or regrouping alone does not count as expansion.
- **Expanded:** the LLM retains the compared capability and adds explicit behavior, scope, conditions, or verification detail.
- **Reduced:** a recognizable LLM counterpart retains part of the compared capability but omits a specified aspect.
- **Missing:** a baseline capability or distinct behavioral facet has no explicit LLM counterpart. Identify any related LLM item, but state that it does not specify the missing facet.
- **Newly introduced:** an LLM capability or explicit constraint has no explicit baseline counterpart. This means new relative to this baseline, not necessarily absent from the system description.

When a group contains both additions and omissions, use separate rows for the distinct facets instead of calling the whole group equivalent or expanded. An apparent conflict should be described factually with both conditions; do not invent a sixth classification or resolve the conflict for the student. Explain uncertainty where equivalence is not established. "Not explicit" is different from "prohibited" or "unsupported."

For non-functional requirements, inspect constraints embedded in the baseline even if it has no dedicated non-functional section. Distinguish a newly separate category from a newly introduced constraint. Report missing measurement targets as undefined, not as invented numerical targets. For stories, compare role, goal, reason, and explicit acceptance conditions. For backlog items, compare delivered behavior and demo expectations as well as scope. Do not equate numeric importance scores with categorical priorities or compare estimates whose units are undefined. Record structural differences once where possible rather than repeating them in every row.

Write `comparison_draft.md` with a brief source and notation note followed by one table using exactly these columns:

| Category | Assignment 2 | LLM version | Difference | My Decision | My Justification |
| --- | --- | --- | --- | --- | --- |

Fill only the first four columns. Keep the final two cells of every row truly empty: no placeholders, suggestions, dashes, or questions. Use `No explicit counterpart` in a source column where needed. Keep differences concise, specific, neutral, and traceable to the cited item IDs. Include meaningful equivalent mappings, additions, reductions, and omissions. Avoid duplicate rows that describe the same difference within the same category.

Before finishing, verify that all relevant source items have a mapping or an explicitly documented absence, that every cited ID exists in its stated section, that all four categories appear, and that every manual decision and justification cell remains blank. Leave all final critical judgments to the student.

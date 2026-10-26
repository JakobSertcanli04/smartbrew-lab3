# Submission checklist

Assignment source: `requirements/assignmentlab`.

## Included in this repository

- Task A source artifacts: `requirements/assignment2_baseline.json` and `requirements/ai_requirements.json`.
- Final comparison and revised requirements: `requirements/comparison_shortlist_single_table.docx`, `.comparison_rows.json`, `comparison_shortlist.json` and `reviewed_requirements.json`.
- Prompt strategy and edited prompt record: `requirements/prompts_and_strategy.txt`.
- Task B's ten-feature prototype, feature mapping, installation/demonstration README and documented functions.
- Twenty-five integration tests, forty mutation definitions, current mutation results and an archived initial assessment.
- Available generation-conversation record: `docs/task-b-conversation.txt`.

The application is confined to the selected ten functions. Personal runtime databases, installed dependencies, npm cache and full TAP log directories are excluded from Git. New users install from the committed package lockfile and start with automatically seeded data.

## Complete before submitting in Canvas

1. Record the actual model names and versions used for each task. Exact versions are not available from these requirement files; do not infer or invent them.
2. Add/export the full code-generation conversation required by Task B. The included record identifies its summaries and does not claim to be a complete verbatim export. Add the original elicitation main prompts and key responses if they belong to an earlier session.
3. Manually run the README's ten GUI demonstrations on the evaluation Windows machine. Automated HTTP/SQLite tests do not substitute for visual browser verification.
4. Share the repository URL in the submission. For a private repository, ensure `riccardoRubei` has received the collaborator invitation and can accept it.
5. Follow the assignment's Canvas instructions for uploading Task A report/artifacts and Task B code or its repository reference. No Canvas submission is performed by this project.

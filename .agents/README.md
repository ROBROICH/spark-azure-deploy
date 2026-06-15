# Declaration on the Use of AI Coding Assistants
AI Coding Assistants were employed in the development of SPARK Workflow. In the spirit of the "Public Money, Public Code" principle, and to lower the barrier to entry for other open source developers, the AI Coding Assistant Skills used in this project are being made publicly available alongside the source code. 
The use of AI Coding Assistants in software development is as of now widely regarded as industry best practice. In the interest of transparency, this is disclosed explicitly, along with the measures implemented to govern its responsible use.

## AI Coding Assistant Skills
"Skills" are plain-text instruction files that guide how an AI Coding Assistant works on a task — for example by encoding project conventions, recurring workflows, or quality and review rules. The assistant reads the applicable Skills before starting and follows them within their defined scope.

The SPARK Workflow development team used these Skills with current frontier models; the Skills themselves are model- and tool-agnostic and can be used universally.

They can be found in the following locations:
- Root `.agents` directory (repository-wide skills)
- Subdirectory `.agents` directories (skills scoped to a specific subdirectory)

## Commitment to Responsible Use
- **Human accountability:** Every piece of code generated or modified by the AI Coding Assistant was manually reviewed, evaluated, and approved by a developer.
- **Four-eyes principle:** For every change, the CI/CD pipeline enforces the code review by a second developer.
- **Extensive testing:** Unit tests are mandatory components of the CI/CD pipeline. End-to-end tests are regularly performed. 
- **Security reviews:** Regular CVE scans are conducted.
- **External reviews:** Security and code reviews were conducted by independent third parties.
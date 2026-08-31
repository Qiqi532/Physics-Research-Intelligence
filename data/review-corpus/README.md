# Open-paper review corpus

This directory supports a small, traceable personal evaluation corpus. `manifest.json` records public arXiv metadata and verified local PDF checksums. The review-target tag is a coverage aid for human review; it is not a stored classification or an evaluation result.

The nine manifest records prefer arXiv entries with an explicit DOI so the current DOI-keyed application can provide a full local detail page and reading-state controls. Additional verified PDFs may remain locally as optional human-review material, but only records in the manifest are imported.

## Safety and licensing

- Papers are acquired only from the official arXiv PDF endpoint without authentication or access-control bypass.
- A `null` `licenseUrl` means the API record did not publish an explicit license URL. It must not be interpreted as a Creative Commons grant. Check each arXiv record and the repository terms before reuse or redistribution.
- PDFs are for local human review. Do not commit PDFs to Git or redistribute them from this repository.
- Application import and model processing use only the public title, authors, metadata, and abstract. The importer never reads PDF bytes, and downloaded full text is not sent to an AI provider.

## Download and verification

From the repository root, run:

```powershell
pnpm --filter @pri/worker corpus:download
```

The command accepts only approved HTTPS arXiv PDF URLs, bounds retries and response size, checks the PDF signature, byte length, and SHA-256, and places a file only after every check succeeds. A matching existing file is reused. A mismatched file is never silently overwritten; move it aside manually and investigate before retrying.

Local files are stored in `data/review-corpus/pdfs/`, which is intentionally ignored. To redownload, preserve the existing file for diagnosis, remove only the exact paper file after confirming its manifest entry, and rerun the command.

## Import

After configuring a dedicated local database in the ignored `.env` and applying migrations, run:

```powershell
pnpm --filter @pri/worker corpus:import
```

The import is idempotent through the existing arXiv source-record key. It stores public facts only and reports per-record outcomes without printing abstracts, local paths, or secrets.

# LifeOS

Full static publication of LifeOS, retaining architecture, transitions, email/password authentication, private profiles/memories and the local account-scoped workbench. Backend: existing Supabase project, unchanged.

GitHub Pages serves `/lifeos-web/`. The workflow injects only the browser publishable key from the Actions secret `SUPABASE_PUBLISHABLE_KEY`; the published browser necessarily receives that public key. Never configure service-role credentials, database passwords or SMTP credentials here. Data isolation relies on Supabase RLS, not key secrecy.

Add the exact new callbacks in Supabase Authentication URL Configuration, retaining existing addresses:

- https://buqi080318.github.io/lifeos-web/auth/callback/
- https://buqi080318.github.io/lifeos-web/auth/reset/

Set Site URL to https://buqi080318.github.io/lifeos-web/ when making this the primary site. Confirm email delivery and redirects before inviting new users.

Profiles/memories remain in the same backend. Courses, grades, plans and knowledge-library files remain local; changing origin requires explicit export/import and reauthorizing local folders. No cloud upload feature is introduced by hosting migration.

Same-account GitHub project sites share browser origin/storage, including the existing Canglu site. Review third-party scripts on that origin before broad use. Pages does not apply Netlify `_headers`; HTML CSP is retained but does not replace all security response headers. This is not a high-availability or paid-service architecture.

GitHub Pages' restrictions on sensitive transactions and commercial SaaS apply: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

# Hosting and deployment

Tube Race is a static single-page app. It has no backend and no per-play cost:
the browser loads a handful of generated JSON files and runs the whole game
client-side. Hosting is therefore just "serve a folder of static files over
HTTPS", which it does from its own AWS stack.

## The model

The site lives at `https://tube-race.isseikuzuki.co.uk`, a subdomain off the
existing `isseikuzuki.co.uk` hosted zone. It has its own private S3 bucket and
its own CloudFront distribution, entirely separate from the main website. The
bucket is never public; CloudFront reads it through an Origin Access Control,
and an ACM certificate in `us-east-1` (the only region CloudFront reads certs
from) serves HTTPS for the subdomain. Because the bucket is private it answers a
missing key with a 403 rather than a 404, so the distribution maps both 403 and
404 back to `/index.html` with a 200, which is the standard single-page-app
fallback.

The Terraform mirrors the `ikuzuki/website` repo's two-root layout. The
`infrastructure/bootstrap` root is run once by hand and creates the durable
backend (a state bucket and a DynamoDB lock table) plus the IAM role that CI
assumes. The `infrastructure/environments/dev` root holds the actual site: the
bucket, the distribution, the certificate and its DNS validation, and the A and
AAAA alias records that point the subdomain at CloudFront. The hosted zone
itself is only ever looked up, never created or modified beyond adding the
tube-race records.

## One-time manual bootstrap

The deploy role cannot create itself, so the bootstrap is a manual step run
locally with admin credentials. Using the `fpl-dev` profile (the same account
that owns the domain), from `infrastructure/bootstrap`:

```bash
terraform init
terraform apply
```

This creates `tube-race-tf-state`, `tube-race-tf-lock`, and the
`Tube-Race-CICD-Role` whose trust policy is scoped to the `ikuzuki/tube-race`
repository. It reuses the account-wide GitHub OIDC provider that the website
bootstrap already created rather than making a second one. Note its outputs:
`deploy_role_arn` is the role ARN you will hand to GitHub next.

You do not run the `environments/dev` apply by hand. The first push to `main`
(or a manual run of the Deploy workflow) does that for you, including requesting
the certificate and writing its DNS validation records. The first apply pauses
while ACM validates the certificate against the new DNS records, which usually
takes a few minutes; once it issues, the distribution comes up and the
subdomain resolves. Allow time for DNS to propagate on the very first deploy.

## GitHub repository variables

CI authenticates by OIDC, so there are no long-lived AWS secrets to store. Set
two repository variables (Settings, then Secrets and variables, then Actions,
then the Variables tab) on `ikuzuki/tube-race`:

`AWS_DEPLOY_ROLE_ARN` is the `deploy_role_arn` printed by the bootstrap apply.
`CLOUDFRONT_DISTRIBUTION_ID` is the `cloudfront_distribution_id` output of the
`environments/dev` apply, which you can read after the first deploy with
`terraform output` in that directory (or from the AWS console). Until that
variable is set the cache invalidation step has nothing to target, so set it
after the first successful infra apply and before relying on content updates
going live promptly.

## What the deploy does

On a push to `main`, the Deploy workflow applies the `environments/dev`
Terraform when infrastructure changed, then builds `web/` and syncs the output
to the bucket. The sync sets cache headers deliberately: content-hashed assets
under `assets/` are marked immutable and cached for a year, while `index.html`
and the daily data under `data/` are sent with `no-cache` so a fresh build and
regenerated puzzles are picked up immediately. It finishes by invalidating
`/index.html` and `/data/*` on CloudFront. Old hashed assets are left in place
on purpose: their names never collide, so keeping them means a session loaded
just before a deploy does not break.

The separate `ci.yml` workflow (lint, typecheck, tests, build for both the
Python pipeline and the web app) is unchanged and still gates every pull
request.

## Moving the site later

Where the site lives is defined once, in `web/src/config.ts`. `BASE_PATH` is the
path it is served from (currently `/`, since it owns its domain at the root) and
`DEFAULT_SITE_URL` is its public origin, which feeds the canonical link, the
Open Graph and Twitter tags, the sitemap and the share text. Vite reads
`BASE_PATH` for its build `base`, so changing that one constant moves every
generated URL with it. To host under a subpath instead of a subdomain, set
`BASE_PATH` to that path and `DEFAULT_SITE_URL` to the new origin; nothing else
in the app hardcodes the location. A build-time `VITE_SITE_URL` environment
variable can override the origin without editing the file, which is handy for
preview deploys.

If the domain itself changes, the canonical origin is referenced in three
generated-but-static files as well (`web/index.html`, `web/public/robots.txt`
and `web/public/sitemap.xml`); update those to match, and change the `subdomain`
or `domain_name` variables in `infrastructure/environments/dev` so the
certificate and DNS records follow.

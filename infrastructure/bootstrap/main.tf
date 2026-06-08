# Bootstrap: creates the Terraform state backend (S3 + DynamoDB lock) and the
# GitHub Actions OIDC trust + deploy IAM role for tube-race. Run once locally
# with local state and admin (fpl-dev) creds, then the env root uses the S3
# backend declared below.
#
# The OIDC provider is account-wide and already exists (created by the website
# bootstrap). We data-source it rather than creating a duplicate: AWS only
# permits one provider per issuer URL.

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region  = var.region
  profile = var.aws_profile

  default_tags {
    tags = {
      Project   = "tube-race"
      ManagedBy = "terraform"
      Owner     = "issei"
    }
  }
}

# --- Terraform state bucket ---
resource "aws_s3_bucket" "tf_state" {
  bucket = "tube-race-tf-state"
}

resource "aws_s3_bucket_versioning" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tf_state" {
  bucket                  = aws_s3_bucket.tf_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# --- DynamoDB lock table ---
resource "aws_dynamodb_table" "tf_lock" {
  name         = "tube-race-tf-lock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}

# --- GitHub Actions OIDC trust ---
# Provider already exists at the account level (shared with website + fpl).
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "github_actions_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }

    # Trust only the main branch of the tube-race repo. The Deploy workflow runs
    # on push to main and on workflow_dispatch (which also reports the main ref),
    # so this covers CI without letting any other branch or PR assume the role.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:ref:refs/heads/main"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

# Deploy policy. Scoped by resource wherever the service supports it: S3 to the
# tube-race-* buckets, DynamoDB to the lock table, Route 53 to hosted zones.
# CloudFront and ACM do not support resource-level permissions, so they are
# action-scoped against "*". This is tighter than "*" but not minimal: the S3
# reads are wildcarded (Get*/List*) because the aws_s3_bucket refresh calls a
# broad, provider-version-dependent set of bucket sub-resource reads, while the
# writes are enumerated to the few the stack and the deploy sync actually make.
data "aws_iam_policy_document" "cicd" {
  statement {
    sid    = "S3SiteAndState"
    effect = "Allow"
    actions = [
      # Reads: wildcarded so the bucket refresh never trips on a denied Get.
      "s3:Get*",
      "s3:List*",
      # Object writes: the deploy sync and the Terraform state backend.
      "s3:PutObject",
      "s3:DeleteObject",
      # Bucket lifecycle + the specific config writes the s3-static-site module
      # and the env-root bucket policy make.
      "s3:CreateBucket",
      "s3:PutBucketVersioning",
      "s3:PutEncryptionConfiguration",
      "s3:PutBucketPublicAccessBlock",
      "s3:PutBucketTagging",
      "s3:PutBucketPolicy",
      "s3:DeleteBucketPolicy",
    ]
    resources = [
      "arn:aws:s3:::tube-race-*",
      "arn:aws:s3:::tube-race-*/*",
    ]
  }

  statement {
    sid    = "DynamoDBLock"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
      "dynamodb:DescribeTable",
    ]
    resources = [aws_dynamodb_table.tf_lock.arn]
  }

  # CloudFront does not support resource-level permissions, so this is scoped by
  # action against "*". Kept broad (cloudfront:*) deliberately: the distribution
  # plus its Origin Access Control, tagging and cache invalidation span a large,
  # provider-version-dependent action surface, and this is a one-shot apply that
  # cannot be test-run here, so narrowing it risks breaking the first deploy.
  # No IAM grant: OAC authorises CloudFront to read the bucket via the bucket
  # policy, so neither iam:PassRole nor any iam:* action is needed.
  statement {
    sid    = "CloudFrontFull"
    effect = "Allow"
    actions = [
      "cloudfront:*",
    ]
    resources = ["*"]
  }

  # Terraform plan needs to read account info, tags, regions.
  statement {
    sid    = "ReadOnlyDiscovery"
    effect = "Allow"
    actions = [
      "sts:GetCallerIdentity",
      "tag:GetResources",
    ]
    resources = ["*"]
  }

  # Route 53: ListHostedZones + GetChange are account-wide actions that do not
  # support resource-level scoping (per AWS service-authorization docs).
  statement {
    sid    = "Route53AccountWideReads"
    effect = "Allow"
    actions = [
      "route53:ListHostedZones",
      "route53:GetChange",
    ]
    resources = ["*"]
  }

  # Hosted-zone-scoped reads and writes for the tube-race subdomain records.
  # Scoped to any hosted zone in this account (single-tenant: only
  # isseikuzuki.co.uk lives here). ListTagsForResource is required by the
  # aws_route53_zone data source on every plan/refresh.
  statement {
    sid    = "Route53ManageRecords"
    effect = "Allow"
    actions = [
      "route53:GetHostedZone",
      "route53:ListResourceRecordSets",
      "route53:ListTagsForResource",
      "route53:ChangeResourceRecordSets",
    ]
    resources = ["arn:aws:route53:::hostedzone/*"]
  }

  # ACM: most actions cannot be reliably resource-scoped at policy-write time
  # because cert ARNs include a UUID that does not exist until apply.
  statement {
    sid    = "AcmManageCertificates"
    effect = "Allow"
    actions = [
      "acm:RequestCertificate",
      "acm:DescribeCertificate",
      "acm:DeleteCertificate",
      "acm:ListCertificates",
      "acm:GetCertificate",
      "acm:AddTagsToCertificate",
      "acm:RemoveTagsFromCertificate",
      "acm:ListTagsForCertificate",
      "acm:UpdateCertificateOptions",
      "acm:RenewCertificate",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role" "cicd" {
  name               = "Tube-Race-CICD-Role"
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume.json
}

resource "aws_iam_role_policy" "cicd" {
  name   = "tube-race-cicd-policy"
  role   = aws_iam_role.cicd.id
  policy = data.aws_iam_policy_document.cicd.json
}

output "deploy_role_arn" {
  description = "ARN to set as the AWS_DEPLOY_ROLE_ARN repo variable on ikuzuki/tube-race."
  value       = aws_iam_role.cicd.arn
}

output "state_bucket" {
  value = aws_s3_bucket.tf_state.id
}

output "lock_table" {
  value = aws_dynamodb_table.tf_lock.id
}

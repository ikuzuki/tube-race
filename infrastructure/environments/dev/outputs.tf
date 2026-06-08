output "site_bucket" {
  description = "Name of the S3 bucket the deploy uploads to."
  value       = module.site_bucket.bucket_id
}

output "site_url" {
  description = "Public URL once DNS and the cert are live."
  value       = "https://${local.site_fqdn}/"
}

output "cloudfront_domain" {
  description = "CloudFront default domain (useful before DNS propagates)."
  value       = module.cdn.domain_name
}

output "cloudfront_distribution_id" {
  description = "Distribution ID. Set this as the CLOUDFRONT_DISTRIBUTION_ID repo variable."
  value       = module.cdn.distribution_id
}

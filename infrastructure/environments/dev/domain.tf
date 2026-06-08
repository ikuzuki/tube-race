# Custom-domain wiring: ACM certificate (in us-east-1, mandatory for CloudFront)
# + DNS validation records + a subdomain alias record pointing at the
# distribution. The site is a single subdomain off an existing hosted zone.

# CloudFront only reads ACM certs from us-east-1. The rest of the stack lives
# in eu-west-2 (London). Aliased provider for the us-east-1 cert.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "tube-race"
      Environment = var.environment
      ManagedBy   = "terraform"
      Owner       = "issei"
    }
  }
}

# Existing hosted zone for the apex domain, created when isseikuzuki.co.uk was
# registered (and managed by the separate website repo). Looked up by name; this
# stack never creates or owns the zone, it only adds the tube-race subdomain
# records into it.
data "aws_route53_zone" "primary" {
  name = var.domain_name
}

# Certificate covers the single subdomain. DNS-validated against the existing
# hosted zone.
resource "aws_acm_certificate" "site" {
  provider = aws.us_east_1

  domain_name       = local.site_fqdn
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# DNS validation: ACM publishes a CNAME challenge, Terraform writes it into the
# hosted zone, ACM checks it, and the cert flips from PENDING_VALIDATION to
# ISSUED.
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.site.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.primary.zone_id
}

# Explicit "wait for validation" resource. The CloudFront distribution's
# viewer_certificate depends on this rather than on the cert itself, so
# CloudFront only sees the cert after it has been validated.
resource "aws_acm_certificate_validation" "site" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# A and AAAA alias records pointing the subdomain at the CloudFront
# distribution. Alias records (not CNAMEs) so they behave like first-class
# records and resolve to both IPv4 and IPv6.
resource "aws_route53_record" "site_a" {
  zone_id = data.aws_route53_zone.primary.zone_id
  name    = local.site_fqdn
  type    = "A"

  alias {
    name                   = module.cdn.domain_name
    zone_id                = module.cdn.distribution_hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "site_aaaa" {
  zone_id = data.aws_route53_zone.primary.zone_id
  name    = local.site_fqdn
  type    = "AAAA"

  alias {
    name                   = module.cdn.domain_name
    zone_id                = module.cdn.distribution_hosted_zone_id
    evaluate_target_health = false
  }
}

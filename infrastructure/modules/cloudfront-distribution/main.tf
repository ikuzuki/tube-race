# CloudFront distribution fronting the private S3 site bucket via OAC.
# Custom-domain wiring is optional: pass `acm_certificate_arn` + `aliases`
# to attach a custom domain, otherwise the default *.cloudfront.net cert
# is used.

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${var.name}-oac"
  description                       = "OAC for ${var.name} site bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = var.price_class
  comment             = var.name
  aliases             = var.aliases

  origin {
    origin_id                = "site"
    domain_name              = var.site_bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id       = "site"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # AWS-managed CachingOptimized
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  # Analytics beacon: /e* is answered by a CloudFront Function with a 204 and
  # never reaches the origin. The request still lands in the access logs, so the
  # event (carried in the query string) is captured there. target_origin_id is
  # required but unused, since the function short-circuits the request.
  dynamic "ordered_cache_behavior" {
    for_each = var.enable_beacon ? [1] : []
    content {
      path_pattern           = "/e*"
      target_origin_id       = "site"
      viewer_protocol_policy = "https-only"
      allowed_methods        = ["GET", "HEAD", "OPTIONS"]
      cached_methods         = ["GET", "HEAD"]
      compress               = false

      # AWS-managed CachingDisabled: beacons must not be cached.
      cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"

      function_association {
        event_type   = "viewer-request"
        function_arn = aws_cloudfront_function.beacon[0].arn
      }
    }
  }

  # Standard access logging to the shared analytics bucket (per-site prefix).
  dynamic "logging_config" {
    for_each = var.log_bucket_domain == null ? [] : [1]
    content {
      bucket          = var.log_bucket_domain
      prefix          = var.log_prefix
      include_cookies = false
    }
  }

  # Single-page app served from a private OAC bucket. A missing key returns
  # 403 (the bucket is private, so S3 never reveals a 404), and a genuine
  # missing route can surface as 404. Either way the SPA's index.html should
  # render with a 200 and let the client take over, so map both to /index.html.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.acm_certificate_arn == null
    acm_certificate_arn            = var.acm_certificate_arn
    ssl_support_method             = var.acm_certificate_arn == null ? null : "sni-only"
    minimum_protocol_version       = var.acm_certificate_arn == null ? null : "TLSv1.2_2021"
  }
}

# Beacon responder: returns 204 for /e* at the edge, so analytics beacons are
# cheap and never hit the origin. Created only when beacons are enabled.
resource "aws_cloudfront_function" "beacon" {
  count = var.enable_beacon ? 1 : 0

  name    = "${var.name}-beacon-204"
  runtime = "cloudfront-js-2.0"
  publish = true
  comment = "Answers analytics beacons (/e*) with a 204 at the edge"

  code = <<-EOT
    function handler(event) {
      return {
        statusCode: 204,
        statusDescription: "No Content",
        headers: {
          "cache-control": { value: "no-store" }
        }
      };
    }
  EOT
}

variable "region" {
  type    = string
  default = "eu-west-2"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "domain_name" {
  description = "Apex domain whose Route 53 hosted zone already exists (managed by the website repo). The site is served from a subdomain off this zone."
  type        = string
  default     = "isseikuzuki.co.uk"
}

variable "subdomain" {
  description = "Subdomain label the site is served at, prepended to domain_name (e.g. 'tube-race' -> tube-race.isseikuzuki.co.uk)."
  type        = string
  default     = "tube-race"
}

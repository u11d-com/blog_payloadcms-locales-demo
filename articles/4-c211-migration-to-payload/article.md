# How Connect211 Scaled with Payload: Our Migration Story

At u11d, we’re passionate about building robust, scalable platforms for social good. Our partner, [Connect211](https://connect211.com/) is a modern search engine for community resources, helping people quickly find vital services in their area. As Connect211 grew to serve 50+ domains and thousands of requests per second, their original Strapi-based architecture began to show its limits.

## The Challenge

Strapi required us to run a separate app and database instance for every tenant. This approach was resource-intensive, hard to scale, and made maintenance and development complex. We needed a solution that could handle multi-tenancy natively, support custom logic, and scale seamlessly.

## Why Payload?

Payload CMS offered exactly what we needed:

- True Multi-Tenancy: With the `multiTenantPlugin`, we now run a single autoscaling app that serves all tenants. No more duplicating code or infrastructure.
- Custom Logic: Payload’s extensibility let us implement advanced features—like auto-translations for text fields and custom caching strategies—directly in the CMS.
- Performance: We handle thousands of requests per second, hosted on DigitalOcean, with full control over caching and scaling.
- Smooth Migration: Our migration from Strapi was seamless, thanks to a custom script that mapped and imported all tenant data and assets.

## The Result

With Payload and Next.js, Connect211 is now a unified, scalable platform that empowers communities with reliable, multilingual access to resources—without the operational overhead of our previous stack.

CTA:
Want to learn more about how we build scalable, modern web platforms? Read our blog or contact us to see how we can help your organization grow.

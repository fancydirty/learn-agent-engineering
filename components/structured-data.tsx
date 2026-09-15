// JSON-LD must be server-rendered inline (plain <script>, not next/script) so
// crawlers see it in the initial HTML without executing JavaScript.

export function OrganizationStructuredData() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Agent Mentor",
    "url": "https://agentmentor.dev",
    "logo": "https://learn.agentmentor.dev/icon.svg",
    "sameAs": ["https://learn.agentmentor.dev"],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}

export function WebSiteStructuredData() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Agent Mentor Learn",
    "url": "https://learn.agentmentor.dev",
    "description": "Open courses that track the Agent ecosystem, from first principles to production systems.",
    "inLanguage": ["en", "zh", "ja", "ko", "es", "pt-BR"],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}

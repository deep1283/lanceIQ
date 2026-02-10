const EMAIL_ATTRS = ["email", "mail", "userPrincipalName"];
const NAME_ATTRS = ["displayName", "givenName", "familyName"];
const GROUP_ATTRS = ["groups"];

function decodeEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractNameId(xml: string) {
  const match = xml.match(/<[^:>]*:?NameID[^>]*>([^<]+)<\/[^:>]*:?NameID>/i);
  return match ? decodeEntities(match[1].trim()) : null;
}

function extractAttributes(xml: string) {
  const attrs: Record<string, string[]> = {};
  const attrRegex = /<[^:>]*:?Attribute[^>]*Name="([^"]+)"[^>]*>([\s\S]*?)<\/[^:>]*:?Attribute>/gi;
  let attrMatch: RegExpExecArray | null;
  while ((attrMatch = attrRegex.exec(xml)) !== null) {
    const name = attrMatch[1];
    const block = attrMatch[2];
    const values: string[] = [];
    const valueRegex = /<[^:>]*:?AttributeValue[^>]*>([^<]+)<\/[^:>]*:?AttributeValue>/gi;
    let valueMatch: RegExpExecArray | null;
    while ((valueMatch = valueRegex.exec(block)) !== null) {
      values.push(decodeEntities(valueMatch[1].trim()));
    }
    if (values.length) {
      const key = name.trim();
      attrs[key] = values;
    }
  }
  return attrs;
}

function findFirst(attrs: Record<string, string[]>, names: string[]) {
  for (const name of names) {
    const entry = Object.entries(attrs).find(
      ([key]) => key.toLowerCase() === name.toLowerCase()
    );
    if (entry && entry[1].length) return entry[1];
  }
  return null;
}

export function parseSamlResponse(xml: string) {
  const attributes = extractAttributes(xml);
  const nameId = extractNameId(xml);
  const emailValues = findFirst(attributes, EMAIL_ATTRS);
  const email = emailValues?.[0] || nameId || null;

  const displayName = findFirst(attributes, ["displayName"])?.[0];
  const givenName = findFirst(attributes, ["givenName"])?.[0];
  const familyName = findFirst(attributes, ["familyName"])?.[0];
  const name =
    displayName ||
    [givenName, familyName].filter(Boolean).join(" ") ||
    null;

  const groupValues = findFirst(attributes, GROUP_ATTRS) || [];

  return {
    email,
    name,
    groups: groupValues,
    externalId: nameId || email,
    rawAttributes: attributes,
  };
}

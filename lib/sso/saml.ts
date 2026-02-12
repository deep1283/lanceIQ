import { DOMParser } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import xpath from 'xpath';

type ReplayInsertClient = {
  from: (table: string) => {
    insert: (payload: Record<string, unknown>) => {
      select: (columns: string) => {
        maybeSingle: () => Promise<{ data: { id: string } | null; error: { code?: string; message?: string } | null }>;
      };
    };
  };
};

const XMLNS_DS = 'http://www.w3.org/2000/09/xmldsig#';
const EMAIL_ATTRS = ['email', 'mail', 'userPrincipalName'];
const NAME_ATTRS = ['displayName'];
const GIVEN_NAME_ATTRS = ['givenName'];
const FAMILY_NAME_ATTRS = ['familyName'];
const GROUP_ATTRS = ['groups'];
const DEFAULT_CLOCK_SKEW_SEC = 120;

type SamlVerificationInput = {
  samlResponseBase64: string;
  metadataXml: string | null;
  expectedAcsUrl: string;
  expectedAudience: string;
  now?: Date;
  clockSkewSec?: number;
};

export type VerifiedSamlAssertion = {
  assertionId: string;
  issuer: string;
  email: string;
  name: string | null;
  groups: string[];
  externalId: string;
  rawAttributes: Record<string, string[]>;
  notOnOrAfter: string;
};

class SamlSecurityError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class SamlReplayDetectedError extends SamlSecurityError {
  constructor() {
    super('saml_replay_detected', 'SAML assertion replay detected.');
  }
}

function fail(code: string, message: string): never {
  throw new SamlSecurityError(code, message);
}

function parseXml(xml: string) {
  const parser = new DOMParser({
    errorHandler: {
      warning: () => undefined,
      error: () => undefined,
      fatalError: () => undefined,
    },
  });

  const doc = parser.parseFromString(xml, 'text/xml');
  const parserErrors = selectNodes(doc, "//*[local-name()='parsererror']") as Node[];
  if (parserErrors.length > 0) {
    fail('invalid_saml_xml', 'SAML XML is malformed.');
  }
  return doc;
}

function selectNodes(node: Node, query: string) {
  return xpath.select(query, node) as Node[];
}

function mustGetAttribute(node: Node, attribute: string) {
  const value = (node as Element).getAttribute(attribute)?.trim() || null;
  if (!value) {
    fail('missing_saml_attribute', `Required SAML attribute missing: ${attribute}`);
  }
  return value;
}

function firstText(node: Node, query: string) {
  const nodes = selectNodes(node, query) as Node[];
  if (!nodes.length) return null;
  const value = nodes[0].nodeValue?.trim() || null;
  return value;
}

function allText(node: Node, query: string) {
  const nodes = selectNodes(node, query) as Node[];
  return nodes
    .map((entry) => entry.nodeValue?.trim() || '')
    .filter((entry) => entry.length > 0);
}

function toPemCertificate(raw: string) {
  const compact = raw.replace(/\s+/g, '');
  if (!compact) return null;
  const lines = compact.match(/.{1,64}/g) || [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
}

function parseMetadata(metadataXml: string | null) {
  if (!metadataXml || !metadataXml.trim()) {
    fail('saml_metadata_missing', 'SSO metadata is missing for provider.');
  }

  const doc = parseXml(metadataXml);
  const entityDescriptor = (selectNodes(doc, "/*[local-name()='EntityDescriptor']") as Node[])[0];
  if (!entityDescriptor) {
    fail('saml_metadata_invalid', 'SSO metadata is invalid: missing EntityDescriptor.');
  }

  const entityId = mustGetAttribute(entityDescriptor, 'entityID');

  const signingCertTexts = allText(
    doc,
    "//*[local-name()='KeyDescriptor' and (@use='signing' or not(@use))]//*[local-name()='X509Certificate']/text()"
  );

  const fallbackCertTexts = signingCertTexts.length
    ? signingCertTexts
    : allText(doc, "//*[local-name()='X509Certificate']/text()");

  const certificates = fallbackCertTexts
    .map((entry) => toPemCertificate(entry))
    .filter(Boolean) as string[];

  if (!certificates.length) {
    fail('saml_metadata_no_signing_cert', 'SSO metadata does not include signing certificates.');
  }

  return { entityId, certificates };
}

function verifyAssertionSignature(xml: string, certificates: string[]) {
  const responseDoc = parseXml(xml);
  const assertionNode = (selectNodes(responseDoc, "//*[local-name()='Assertion']") as Node[])[0];
  if (!assertionNode) {
    fail('missing_saml_assertion', 'SAML assertion is missing.');
  }

  const assertionSignatureNode = (
    selectNodes(
      assertionNode,
      `./*[local-name()='Signature' and namespace-uri()='${XMLNS_DS}']`
    ) as Node[]
  )[0];

  if (!assertionSignatureNode) {
    fail('unsigned_saml_assertion', 'SAML assertion must be signed.');
  }

  for (const cert of certificates) {
    try {
      const verifier = new SignedXml({ publicCert: cert, getCertFromKeyInfo: () => null });
      verifier.loadSignature(assertionSignatureNode);
      const valid = verifier.checkSignature(xml);
      if (!valid) {
        continue;
      }

      const signedReferences = verifier.getSignedReferences();
      for (const signedReference of signedReferences) {
        const signedDoc = parseXml(signedReference);
        const signedAssertion = (selectNodes(signedDoc, "/*[local-name()='Assertion']") as Node[])[0];
        if (!signedAssertion) {
          continue;
        }

        const assertionId =
          (signedAssertion as Element).getAttribute('ID') ||
          (signedAssertion as Element).getAttribute('Id') ||
          (signedAssertion as Element).getAttribute('id');

        if (!assertionId) {
          fail('saml_assertion_id_missing', 'SAML assertion ID is missing.');
        }

        return {
          signedAssertionDoc: signedDoc,
          assertionId,
        };
      }
    } catch {
      continue;
    }
  }

  fail('invalid_saml_signature', 'SAML assertion signature verification failed.');
}

function findFirstAttribute(attributes: Record<string, string[]>, names: string[]) {
  for (const name of names) {
    const entry = Object.entries(attributes).find(
      ([key]) => key.toLowerCase() === name.toLowerCase()
    );
    if (entry && entry[1].length > 0) return entry[1][0];
  }
  return null;
}

function extractAssertionAttributes(assertionNode: Node) {
  const attributeNodes = selectNodes(
    assertionNode,
    ".//*[local-name()='Attribute']"
  ) as Node[];

  const attributes: Record<string, string[]> = {};
  for (const attributeNode of attributeNodes) {
    const name = (attributeNode as Element).getAttribute('Name')?.trim();
    if (!name) continue;
    const values = allText(attributeNode, "./*[local-name()='AttributeValue']/text()");
    if (values.length > 0) {
      attributes[name] = values;
    }
  }

  return attributes;
}

function parseSamlTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    fail('invalid_saml_time', `Invalid SAML timestamp: ${value}`);
  }
  return date;
}

function requireTimeWindow(assertionNode: Node, now: Date, skewSec: number) {
  const conditionsNode = (selectNodes(assertionNode, "./*[local-name()='Conditions']") as Node[])[0];
  if (!conditionsNode) {
    fail('missing_saml_conditions', 'SAML assertion conditions are required.');
  }

  const notBefore = parseSamlTime((conditionsNode as Element).getAttribute('NotBefore'));
  const notOnOrAfter = parseSamlTime((conditionsNode as Element).getAttribute('NotOnOrAfter'));

  if (!notOnOrAfter) {
    fail('missing_saml_expiry', 'SAML assertion must include NotOnOrAfter.');
  }

  const nowMs = now.getTime();
  const skewMs = skewSec * 1000;

  if (notBefore && nowMs + skewMs < notBefore.getTime()) {
    fail('saml_not_yet_valid', 'SAML assertion is not yet valid.');
  }

  if (nowMs - skewMs >= notOnOrAfter.getTime()) {
    fail('saml_expired', 'SAML assertion is expired.');
  }

  return notOnOrAfter;
}

function requireAudience(assertionNode: Node, expectedAudience: string) {
  const audiences = allText(
    assertionNode,
    ".//*[local-name()='AudienceRestriction']/*[local-name()='Audience']/text()"
  );

  if (!audiences.length) {
    fail('missing_saml_audience', 'SAML audience restriction is required.');
  }

  if (!audiences.includes(expectedAudience)) {
    fail('invalid_saml_audience', 'SAML audience does not match service provider entity ID.');
  }
}

function requireSubjectConfirmation(assertionNode: Node, expectedAcsUrl: string, now: Date, skewSec: number) {
  const confirmations = selectNodes(
    assertionNode,
    ".//*[local-name()='SubjectConfirmationData']"
  ) as Node[];

  if (!confirmations.length) {
    fail('missing_subject_confirmation', 'SAML subject confirmation is required.');
  }

  const nowMs = now.getTime();
  const skewMs = skewSec * 1000;

  const validConfirmation = confirmations.some((node) => {
    const recipient = (node as Element).getAttribute('Recipient')?.trim() || null;
    if (!recipient || recipient !== expectedAcsUrl) {
      return false;
    }

    const notOnOrAfter = parseSamlTime((node as Element).getAttribute('NotOnOrAfter'));
    if (!notOnOrAfter) {
      return false;
    }

    return nowMs - skewMs < notOnOrAfter.getTime();
  });

  if (!validConfirmation) {
    fail('invalid_subject_confirmation', 'SAML subject confirmation is invalid for this ACS endpoint.');
  }
}

function requireDestination(responseDoc: Document, expectedAcsUrl: string) {
  const responseNode = (selectNodes(responseDoc, "/*[local-name()='Response']") as Node[])[0];
  if (!responseNode) {
    fail('missing_saml_response', 'SAML response root element is missing.');
  }

  const destination = mustGetAttribute(responseNode, 'Destination');
  if (destination !== expectedAcsUrl) {
    fail('invalid_saml_destination', 'SAML Destination does not match ACS endpoint.');
  }
}

function extractUnverifiedEmailFromResponseXml(xml: string) {
  const doc = parseXml(xml);
  const assertion = (selectNodes(doc, "//*[local-name()='Assertion']") as Node[])[0];
  if (!assertion) return null;

  const attributes = extractAssertionAttributes(assertion);
  const email = findFirstAttribute(attributes, EMAIL_ATTRS);
  if (email && email.includes('@')) return email;

  const nameId = firstText(assertion, ".//*[local-name()='NameID']/text()");
  if (nameId && nameId.includes('@')) return nameId;

  return null;
}

export function extractUnverifiedEmailFromSamlResponseBase64(samlResponseBase64: string) {
  const xml = Buffer.from(samlResponseBase64, 'base64').toString('utf-8');
  return extractUnverifiedEmailFromResponseXml(xml);
}

export function verifyAndExtractSamlAssertion(input: SamlVerificationInput): VerifiedSamlAssertion {
  const now = input.now || new Date();
  const skewSec = Number.isFinite(input.clockSkewSec)
    ? Math.max(0, Math.floor(input.clockSkewSec || 0))
    : DEFAULT_CLOCK_SKEW_SEC;

  if (!input.samlResponseBase64?.trim()) {
    fail('missing_saml_response', 'SAMLResponse is required.');
  }

  const responseXml = Buffer.from(input.samlResponseBase64, 'base64').toString('utf-8');
  const responseDoc = parseXml(responseXml);
  requireDestination(responseDoc, input.expectedAcsUrl);

  const metadata = parseMetadata(input.metadataXml);
  const signatureResult = verifyAssertionSignature(responseXml, metadata.certificates);

  const assertionNode = (selectNodes(signatureResult.signedAssertionDoc, "/*[local-name()='Assertion']") as Node[])[0];
  if (!assertionNode) {
    fail('missing_saml_assertion', 'Signed SAML assertion is missing.');
  }

  const issuer = firstText(assertionNode, "./*[local-name()='Issuer']/text()");
  if (!issuer) {
    fail('missing_saml_issuer', 'SAML assertion issuer is missing.');
  }

  if (issuer !== metadata.entityId) {
    fail('invalid_saml_issuer', 'SAML issuer does not match configured identity provider.');
  }

  requireAudience(assertionNode, input.expectedAudience);
  const notOnOrAfter = requireTimeWindow(assertionNode, now, skewSec);
  requireSubjectConfirmation(assertionNode, input.expectedAcsUrl, now, skewSec);

  const attributes = extractAssertionAttributes(assertionNode);
  const nameId = firstText(assertionNode, ".//*[local-name()='NameID']/text()");

  const email = findFirstAttribute(attributes, EMAIL_ATTRS) || nameId;
  if (!email || !email.includes('@')) {
    fail('missing_saml_email', 'SAML assertion is missing a valid email attribute.');
  }

  const displayName = findFirstAttribute(attributes, NAME_ATTRS);
  const givenName = findFirstAttribute(attributes, GIVEN_NAME_ATTRS);
  const familyName = findFirstAttribute(attributes, FAMILY_NAME_ATTRS);

  const name =
    displayName ||
    [givenName, familyName].filter(Boolean).join(' ').trim() ||
    null;

  const groups = Object.entries(attributes)
    .filter(([key]) => GROUP_ATTRS.some((entry) => entry.toLowerCase() === key.toLowerCase()))
    .flatMap(([, values]) => values);

  return {
    assertionId: signatureResult.assertionId,
    issuer,
    email,
    name,
    groups,
    externalId: nameId || email,
    rawAttributes: attributes,
    notOnOrAfter: notOnOrAfter.toISOString(),
  };
}

export function deriveSamlRole(groups: string[]) {
  const mappingRaw = process.env.SAML_GROUP_ROLE_MAP_JSON;
  if (!mappingRaw || !mappingRaw.trim()) {
    return 'member' as const;
  }

  type Role = 'admin' | 'viewer' | 'exporter' | 'legal_hold_manager';
  const allowedRoles: Role[] = ['admin', 'legal_hold_manager', 'exporter', 'viewer'];

  let mapping: Partial<Record<Role, string[]>>;
  try {
    mapping = JSON.parse(mappingRaw) as Partial<Record<Role, string[]>>;
  } catch {
    return 'member' as const;
  }

  const normalizedGroups = new Set(groups.map((entry) => entry.trim().toLowerCase()).filter(Boolean));
  for (const role of allowedRoles) {
    const candidates = Array.isArray(mapping[role]) ? mapping[role] : [];
    const matched = candidates.some((group) => normalizedGroups.has(group.trim().toLowerCase()));
    if (matched) {
      return role;
    }
  }

  return 'member' as const;
}

export async function storeSamlReplayAssertion(
  admin: ReplayInsertClient,
  params: { assertionId: string; issuer: string; expiresAt: string }
) {
  const { error } = await admin
    .from('saml_replay_cache')
    .insert({
      assertion_id: params.assertionId,
      issuer: params.issuer,
      expires_at: params.expiresAt,
    })
    .select('id')
    .maybeSingle();

  if (!error) {
    return;
  }

  if (error.code === '23505') {
    throw new SamlReplayDetectedError();
  }

  fail('saml_replay_cache_failure', 'Failed to store SAML replay cache entry.');
}

export function toSamlSecurityError(err: unknown) {
  if (err instanceof SamlSecurityError) {
    return err;
  }
  return new SamlSecurityError('saml_verification_failed', 'SAML verification failed.');
}

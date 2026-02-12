import { describe, it, expect } from 'vitest';
import { SignedXml } from 'xml-crypto';
import {
  SamlReplayDetectedError,
  storeSamlReplayAssertion,
  verifyAndExtractSamlAssertion,
} from '@/lib/sso/saml';

const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCkIA/AhUHRBVkU
iv3TGqpG/xjdQO5CKngCdOMzjCIdSNylEdmXC5Byk8s460Qi6CB6Et0W5bl/nCsH
oNmUeWZQoSwp7fosQsufefKJfzJ81T5IbL7ka+Jpb9v7/BDBaYhbHsJBy33NDI+G
f5xDfpunwj3SKzuqA8+dtT8lW34F5dTXw9BmETFwbt2u1c4dF6P1YUbly43QJXCn
OYkzHB2D2AIz7+QffJ4Gawhrledc8Tk3dR6sKjGt+B/WiOTgSDNR9YNHovEqWrHe
0g3b+ZfvcD1m8K+nmZCCJrtwLRC4UbRQeu+vukdwf8QKYiLPwiuJ76fLEOcwwcBF
lW9tnnmTAgMBAAECggEAUKOQGb9ffxtpkTZZUAeh8hAUX2Evr0K+hDZ6CzGm8UyD
XHdQuW3tIt6K0wSFDcGPc2shRcbJRXGtkqntPY4IP0VxNYi/ik+nTEvWZsggPkVn
vJ3xjLmVHMjhBQXsFZuMa3jJaRpaTQ0G18aLOH5UbDB7v2+OeRI2R/5tcCVr3ekr
x9fyYg4i+SrWM5Un5pxjFkDvAG4tuDmCHuyPKyI3K8WXLAEHgnnXU9V45Zxv0qA8
vxTqO+rE33UPzSCzMnxIGm3+LRWqxohz4juhVX7rmvcgUZSnpVt74CAST9iCwODk
6MFghU1wbZtlmCmafX4YRU8m8gPZbSxxxlASt/25QQKBgQDmSN8eiBTd+lIt8oCv
Dc8+fm5oWZdVw7EmmwrV/HuruNkN9jA+MZsUx6mD41OFYRCeYI9IdTsXTUF4DUFC
VscSTIxgvq+oAYOdPWiZEjZUpFuV+c/84xXaTuD5/dTbLZ3usLYo/LSWcVdnbMT7
dNCgbnw7hTv2hVzSxZhCEuNVnwKBgQC2c+VwuOa5jIR9oSXF/Hxo4NCcAjWBdWeM
06Z6i8eKrXJOOd4Fr8tTEwXaTrhiwSv6kQyPaxyi2dxgqUimZDzMoYGd9oHBpyEH
88fw7mVQMIlm7YBpCU64lqbbdfKNPRQFJl15wDRENlWOxQ3Fy9VSWMSsT6r/q+uE
2hlYSRwPjQKBgDr9Z8pWaaIDQZHrkPNGwlPr5zRr3sxleLe+96OhLbzreQ6OhgUo
h+Vm0BGs5fRAzRUE/y88eIqbi63JF3J68DvLyBnwPub2nFRnKqgrdidwgtWETLcn
JK3rjs37K8+Je+9s7PzK3ye6mP0xa7ROVDMEmmZU1utrdj+3xi0G0Z1ZAoGAXGqg
EVTXKa1PfwMdSwf1THpzsFI+H/EEHoUmknQzAr+QYqdVGrRM3SuJj2bIZt1KFYVb
Q1oSCzsnMZ8NuZqUYWJ9cTHnz9uEE68b26Ill1S+hHBQ1uNsCHvm0MsRrRD/Dwy7
1GvTDaon9EVEEKiKyUdFd7Jy/0Zp6cU/iUSe/hECgYBr6jdhbPeRw4HAaqcGrIqR
hpo+6C2vhCz49zg40xCuIEuOMWmkkAdeCvxCPwoGNCr9uyrZxTz8q3SJ8hiGbN3c
Mb8/LBVRgw6B0qYlPaZXcIxCefxyeBO2Zirg/nGIA4HRUB9iSa8gLq9qAWKP64B1
3MzWPjL5ZBCtjNaL6zmYRA==
-----END PRIVATE KEY-----`;

const TEST_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIDBzCCAe+gAwIBAgIUCqvgXrBUo6djRtu/OhUhL3DlKYAwDQYJKoZIhvcNAQEL
BQAwEzERMA8GA1UEAwwIVGVzdCBJZFAwHhcNMjYwMjEyMDc1MTE4WhcNMjcwMjEy
MDc1MTE4WjATMREwDwYDVQQDDAhUZXN0IElkUDCCASIwDQYJKoZIhvcNAQEBBQAD
ggEPADCCAQoCggEBAKQgD8CFQdEFWRSK/dMaqkb/GN1A7kIqeAJ04zOMIh1I3KUR
2ZcLkHKTyzjrRCLoIHoS3RbluX+cKweg2ZR5ZlChLCnt+ixCy5958ol/MnzVPkhs
vuRr4mlv2/v8EMFpiFsewkHLfc0Mj4Z/nEN+m6fCPdIrO6oDz521PyVbfgXl1NfD
0GYRMXBu3a7Vzh0Xo/VhRuXLjdAlcKc5iTMcHYPYAjPv5B98ngZrCGuV51zxOTd1
HqwqMa34H9aI5OBIM1H1g0ei8Spasd7SDdv5l+9wPWbwr6eZkIImu3AtELhRtFB6
76+6R3B/xApiIs/CK4nvp8sQ5zDBwEWVb22eeZMCAwEAAaNTMFEwHQYDVR0OBBYE
FKNognDtmSpz/huQiTYm7efwNB63MB8GA1UdIwQYMBaAFKNognDtmSpz/huQiTYm
7efwNB63MA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBABZFu0aN
DApJhOekxh9cPA15fNzheIwK9C/Y2hoNxkpB2DXht2rKi70oCJU1lq/FysVGC9tr
86u5dwzqukTc3ti7E0kcZe0kiiLiyjuKuEaN6Big62fxqXD8v0LsZ+luN9h2ipOa
wrOpo3Xqw9IIDe/R2lVf7pG2mJ+XFXM+s8/3ENp/3DntVGTl2stMZhUp2fdMuX8e
phiqr8swaQszprGo1inpe0kTeGlNIfmYThorOtONzuTU9dAVIkNOrE5HJsLAK7oI
kmizHYwgx/pgYVaeCIx8uVPvuq3aJkOGTNgZjbnT2EB40yBzqTTeyadrajPla2AO
6t9Tok6+4t24qpk=
-----END CERTIFICATE-----`;

const TEST_ISSUER = 'https://idp.example.com/metadata';
const TEST_AUDIENCE = 'https://sp.example.com/api/sso/saml/metadata';
const TEST_ACS = 'https://sp.example.com/api/sso/saml/acs';

function pemToBase64Body(pem: string) {
  return pem
    .replace('-----BEGIN CERTIFICATE-----', '')
    .replace('-----END CERTIFICATE-----', '')
    .replace(/\s+/g, '');
}

function buildMetadataXml(entityId: string = TEST_ISSUER) {
  return `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>${pemToBase64Body(TEST_CERT_PEM)}</X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
  </IDPSSODescriptor>
</EntityDescriptor>`;
}

function signResponse(xml: string) {
  const signer = new SignedXml({ privateKey: TEST_PRIVATE_KEY });
  signer.addReference({
    xpath: "//*[local-name()='Assertion']",
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/2001/10/xml-exc-c14n#',
    ],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
  });
  signer.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
  signer.canonicalizationAlgorithm = 'http://www.w3.org/2001/10/xml-exc-c14n#';
  signer.computeSignature(xml, {
    location: {
      reference: "//*[local-name()='Assertion']",
      action: 'append',
    },
  });
  return signer.getSignedXml();
}

function buildSamlResponse(params?: {
  signed?: boolean;
  issuer?: string;
  audience?: string;
  destination?: string;
}) {
  const signed = params?.signed !== false;
  const issuer = params?.issuer || TEST_ISSUER;
  const audience = params?.audience || TEST_AUDIENCE;
  const destination = params?.destination || TEST_ACS;

  const now = new Date();
  const notBefore = new Date(now.getTime() - 60_000).toISOString();
  const notOnOrAfter = new Date(now.getTime() + 5 * 60_000).toISOString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_response_1" Version="2.0" IssueInstant="${now.toISOString()}" Destination="${destination}">
  <saml:Issuer>${issuer}</saml:Issuer>
  <saml:Assertion ID="_assertion_1" Version="2.0" IssueInstant="${now.toISOString()}">
    <saml:Issuer>${issuer}</saml:Issuer>
    <saml:Subject>
      <saml:NameID>alice@acme.com</saml:NameID>
      <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
        <saml:SubjectConfirmationData Recipient="${destination}" NotOnOrAfter="${notOnOrAfter}" />
      </saml:SubjectConfirmation>
    </saml:Subject>
    <saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}">
      <saml:AudienceRestriction>
        <saml:Audience>${audience}</saml:Audience>
      </saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AttributeStatement>
      <saml:Attribute Name="email"><saml:AttributeValue>alice@acme.com</saml:AttributeValue></saml:Attribute>
      <saml:Attribute Name="displayName"><saml:AttributeValue>Alice Security</saml:AttributeValue></saml:Attribute>
      <saml:Attribute Name="groups"><saml:AttributeValue>admins</saml:AttributeValue></saml:Attribute>
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>`;

  const responseXml = signed ? signResponse(xml) : xml;
  return Buffer.from(responseXml, 'utf-8').toString('base64');
}

describe('SAML security verification', () => {
  it('rejects unsigned assertions', () => {
    const samlResponse = buildSamlResponse({ signed: false });

    expect(() =>
      verifyAndExtractSamlAssertion({
        samlResponseBase64: samlResponse,
        metadataXml: buildMetadataXml(),
        expectedAcsUrl: TEST_ACS,
        expectedAudience: TEST_AUDIENCE,
      })
    ).toThrow(/must be signed/i);
  });

  it('rejects bad issuer', () => {
    const samlResponse = buildSamlResponse({ issuer: 'https://evil.example.com/idp' });

    expect(() =>
      verifyAndExtractSamlAssertion({
        samlResponseBase64: samlResponse,
        metadataXml: buildMetadataXml(TEST_ISSUER),
        expectedAcsUrl: TEST_ACS,
        expectedAudience: TEST_AUDIENCE,
      })
    ).toThrow(/issuer/i);
  });

  it('rejects bad audience', () => {
    const samlResponse = buildSamlResponse({ audience: 'https://wrong-sp.example.com/metadata' });

    expect(() =>
      verifyAndExtractSamlAssertion({
        samlResponseBase64: samlResponse,
        metadataXml: buildMetadataXml(),
        expectedAcsUrl: TEST_ACS,
        expectedAudience: TEST_AUDIENCE,
      })
    ).toThrow(/audience/i);
  });

  it('rejects bad destination', () => {
    const samlResponse = buildSamlResponse({ destination: 'https://sp.example.com/api/sso/saml/other' });

    expect(() =>
      verifyAndExtractSamlAssertion({
        samlResponseBase64: samlResponse,
        metadataXml: buildMetadataXml(),
        expectedAcsUrl: TEST_ACS,
        expectedAudience: TEST_AUDIENCE,
      })
    ).toThrow(/destination/i);
  });

  it('rejects replay cache duplicates', async () => {
    const adminMock = {
      from: () => ({
        insert: () => ({
          select: () => ({
            maybeSingle: async () => ({
              data: null,
              error: { code: '23505', message: 'duplicate key value' },
            }),
          }),
        }),
      }),
    };

    await expect(
      storeSamlReplayAssertion(adminMock as any, {
        assertionId: '_assertion_1',
        issuer: TEST_ISSUER,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      })
    ).rejects.toBeInstanceOf(SamlReplayDetectedError);
  });
});

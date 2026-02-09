import crypto from 'crypto';

const SHA256_OID = '2.16.840.1.101.3.4.2.1';

function encodeLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function encodeTag(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), encodeLength(content.length), content]);
}

function encodeInteger(value: number | bigint): Buffer {
  let bytes: number[] = [];
  let v = BigInt(value);
  if (v === 0n) bytes = [0];
  while (v > 0n) {
    bytes.unshift(Number(v & 0xffn));
    v >>= 8n;
  }
  if (bytes[0] & 0x80) bytes.unshift(0x00);
  return encodeTag(0x02, Buffer.from(bytes));
}

function encodeBoolean(value: boolean): Buffer {
  return encodeTag(0x01, Buffer.from([value ? 0xff : 0x00]));
}

function encodeNull(): Buffer {
  return encodeTag(0x05, Buffer.alloc(0));
}

function encodeOctetString(content: Buffer): Buffer {
  return encodeTag(0x04, content);
}

function encodeOid(oid: string): Buffer {
  const parts = oid.split('.').map((p) => parseInt(p, 10));
  const first = parts[0] * 40 + parts[1];
  const body: number[] = [first];
  for (const part of parts.slice(2)) {
    const stack: number[] = [];
    let value = part;
    stack.push(value & 0x7f);
    value >>= 7;
    while (value > 0) {
      stack.unshift((value & 0x7f) | 0x80);
      value >>= 7;
    }
    body.push(...stack);
  }
  return encodeTag(0x06, Buffer.from(body));
}

function encodeSequence(children: Buffer[]): Buffer {
  return encodeTag(0x30, Buffer.concat(children));
}

export function buildRfc3161Request(hashedHex: string) {
  const hashBytes = Buffer.from(hashedHex, 'hex');
  const nonce = crypto.randomBytes(8);
  const nonceValue = BigInt(`0x${nonce.toString('hex')}`);

  const hashAlgorithm = encodeSequence([encodeOid(SHA256_OID), encodeNull()]);
  const messageImprint = encodeSequence([hashAlgorithm, encodeOctetString(hashBytes)]);

  const request = encodeSequence([
    encodeInteger(1), // v1
    messageImprint,
    encodeInteger(nonceValue),
    encodeBoolean(true),
  ]);

  return { request, nonceHex: nonce.toString('hex') };
}

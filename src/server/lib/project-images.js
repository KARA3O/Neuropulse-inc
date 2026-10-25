import { HttpError } from './http.js';

export const MAX_PROJECT_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PROJECT_IMAGE_REQUEST_BYTES = MAX_PROJECT_IMAGE_BYTES + 64 * 1024;

const FORMATS = [
  {
    contentType: 'image/jpeg',
    extension: 'jpg',
    matches: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  {
    contentType: 'image/png',
    extension: 'png',
    matches: (bytes) => bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => bytes[i] === byte),
  },
  {
    contentType: 'image/webp',
    extension: 'webp',
    matches: (bytes) =>
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP',
  },
];

/** Match the declared image type to its file signature before storing an upload. */
export function getProjectImageFormat(contentType, bytes) {
  const format = FORMATS.find((candidate) => candidate.contentType === contentType.toLowerCase());
  if (!format || !format.matches(bytes)) {
    throw new HttpError(415, 'Choose a valid JPEG, PNG or WebP image.');
  }
  return format;
}

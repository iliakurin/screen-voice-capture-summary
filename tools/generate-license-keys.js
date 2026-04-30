const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const COUNT = 100;
const PREFIX = "SVC";
const HASH_PREFIX = "SVC_LICENSE_V1:";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const root = path.join(__dirname, "..");

function randomGroup(length) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return out;
}

function createKey() {
  return [PREFIX, randomGroup(5), randomGroup(5), randomGroup(5), randomGroup(5)].join("-");
}

function normalize(key) {
  return key.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashKey(key) {
  return crypto.createHash("sha256").update(`${HASH_PREFIX}${normalize(key)}`).digest("hex");
}

const keys = new Set();
while (keys.size < COUNT) keys.add(createKey());

const sortedKeys = [...keys].sort();
const hashes = sortedKeys.map(hashKey).sort();

const hashFile = `window.SVC_LICENSE_HASHES = Object.freeze(${JSON.stringify(hashes, null, 2)});\n`;
const privateFile = [
  "Screen Voice Capture and Summary private license keys",
  "Do not ship this file with the app.",
  "",
  ...sortedKeys,
  "",
].join("\n");

fs.writeFileSync(path.join(root, "license-hashes.js"), hashFile, "utf8");
fs.writeFileSync(path.join(root, "PRIVATE_LICENSE_KEYS_DO_NOT_SHIP.txt"), privateFile, "utf8");

console.log(`Generated ${COUNT} license keys.`);

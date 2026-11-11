import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Expected a stable major.minor.patch version, received ${version}.`);
}

const expectedTag = `v${version}`;
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
if (tag && tag !== expectedTag) {
  throw new Error(`Release tag ${tag} does not match package version ${version}. Expected ${expectedTag}.`);
}

console.log(`Vinyl Room ${version}: ${expectedTag}${tag ? " verified" : " expected"}.`);

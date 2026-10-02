/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: semantic-release interpolates these with lodash templates */
/** @type {import('semantic-release').GlobalConfig} */
const config = {
  branches: ["main"],
  tagFormat: "v${version}",

  plugins: [
    [
      "semantic-release-gitmoji",
      {
        releaseRules: {
          major: [":boom:"],
          minor: [":sparkles:"],
          patch: [
            ":bug:",
            ":ambulance:",
            ":lock:",
            ":lipstick:",
            ":zap:",
            ":recycle:",
          ],
        },
      },
    ],

    [
      "@semantic-release/npm",
      {
        npmPublish: false,
      },
    ],

    "@semantic-release/github",

    [
      "@semantic-release/git",
      {
        assets: ["package.json"],
        message:
          ":bookmark: chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
  ],
};

export default config;

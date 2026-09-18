/**
 * The e2e suite runs inside its own container and talks to the deployed
 * services over the compose network, so it has no ts-jest path mapping back
 * into the monorepo.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testRegex: '.*\\.e2e\\.spec\\.ts$',
  // Containers can take a moment to accept connections after compose
  // reports them as started.
  testTimeout: 30000,
};

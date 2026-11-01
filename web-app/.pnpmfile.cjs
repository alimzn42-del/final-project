// pnpm install hook: adjusts a package's manifest while it is being installed.
//
// @prisma/client lists the Prisma CLI and TypeScript as OPTIONAL peer
// dependencies. pnpm links them whenever they are installed anywhere in the
// workspace (both are dev tools here), and the production copy made by
// `pnpm deploy --prod` then carried both, plus Prisma Studio and an embedded
// Postgres: about 230 MB the backend never uses at runtime. The runtime client
// does not need either, so the two optional links are removed.

function readPackage(pkg) {
  if (pkg.name === '@prisma/client') {
    if (pkg.peerDependencies) {
      delete pkg.peerDependencies.prisma;
      delete pkg.peerDependencies.typescript;
    }
    if (pkg.peerDependenciesMeta) {
      delete pkg.peerDependenciesMeta.prisma;
      delete pkg.peerDependenciesMeta.typescript;
    }
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };

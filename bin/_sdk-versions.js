"use strict";
let SdkVersions = module.exports;

SdkVersions.log = function (pkg) {
  let mainSemvers = {};

  let dwPkg = require("dashwallet/package.json");
  let isRequested =
    dwPkg.version === pkg.dependencies.dashwallet.replace(/\^/g, "");
  if (isRequested) {
    console.info(`  ${dwPkg.name} v${dwPkg.version}`);
  } else {
    console.info(
      `  ${dwPkg.name} v${dwPkg.version} (${pkg.dependencies.dashwallet})`,
    );
  }

  let names = Object.keys(pkg.dependencies);
  for (let name of names) {
    if ("dashwallet" === name) {
      continue;
    }

    if (!name.match("dash")) {
      continue;
    }

    mainSemvers[name] = pkg.dependencies[name];
  }

  let tuples = Object.entries(dwPkg.dependencies);
  for (let [name, dwSemver] of tuples) {
    if (!name.match("dash")) {
      continue;
    }

    let depPkg = require(`${name}/package.json`);
    let installed = depPkg.version;
    let versions = installed;

    let mainSemver = mainSemvers[name];
    let mainVer = mainSemver?.replace(/\^/g, "");
    let mainMismatch = false;
    if (mainVer) {
      mainMismatch = mainVer !== installed;
    }
    if (mainMismatch) {
      versions = `${versions} (${mainSemver})`;
    }

    let dwVer = dwSemver.replace(/\^/g, "");
    let dwMismatch = dwVer !== installed;
    if (dwMismatch) {
      if (dwSemver !== mainSemver) {
        versions = `${versions} [${dwSemver}]`;
      }
    }

    console.info(`    ${name} v${versions}`);
  }

  names = Object.keys(pkg.dependencies);
  for (let name of names) {
    if ("dashwallet" === name) {
      continue;
    }

    if (!name.match("dash")) {
      continue;
    }

    let peerDep = dwPkg.dependencies[name];
    if (peerDep) {
      continue;
    }

    let depPkg = require(`${name}/package.json`);
    console.info(`  ${name} v${depPkg.version}`);
  }
};

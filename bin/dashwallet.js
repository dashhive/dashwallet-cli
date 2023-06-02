#!/usr/bin/env node
"use strict";

//@ts-ignore
let pkg = require("../package.json");

/**
 * @typedef {import('../').Config} Config
 * @typedef {import('../').Safe} Safe
 * @typedef {import('../').Cache} Cache
 * @typedef {import('dashsight').CoreUtxo} CoreUtxo
 * @typedef {import('../').MiniUtxo} MiniUtxo
 * @typedef {import('../').PayWallet} PayWallet
 * @typedef {import('../').Preferences} Preferences
 * @typedef {import('../').PrivateWallet} PrivateWallet
 * @typedef {import('../').WalletAddress} WalletAddress
 * @typedef {import('../').WalletInstance} WalletInstance
 * @typedef {CoreUtxo & WalletUtxoPartial} WalletUtxo
 *
 * @typedef WalletUtxoPartial
 * @prop {String} wallet
 */

let Path = require("node:path");
let Fs = require("node:fs/promises");

let Os = require("node:os");

let envSuffix = "";
require("dotenv").config({ path: Path.join(__dirname, "../.env") });
if ("string" === typeof process.env.DASH_ENV) {
  envSuffix = `${process.env.DASH_ENV}`;
}

let home = Os.homedir();

//
//
// TODO XXXX DO NOT COMMIT. DO NOT PULL IN. DO NOT COLLECT $200.
//
//
let Wallet = require("dashwallet");
//let Wallet = require("../../");
let Cli = require("./_cli.js");
let Qr = require("./_qr.js");

let DashKeys = require("dashkeys");
let DashSight = require("dashsight");
let DashTx = require("dashtx");
// let Qr = require("./qr.js");

const ADDR_CHAR_LEN = 34;

/**
 * @param {String} v
 * @returns {String} - JSON with syntax highlighting
 */
let colorize = function (v) {
  return v;
};
if (!process.stdout.isTTY) {
  let _colorize = require("@pinojs/json-colorizer");
  colorize = _colorize;
}

/**
 * @typedef FsStoreConfig
 * @prop {String} dir
 * @prop {String} cachePath
 * @prop {String} payWalletsPath
 * @prop {String} preferencesPath
 * @prop {String} privateWalletsPath
 */

/** @type {Config} */
//@ts-ignore
let config = { staletime: 5 * 60 * 1000 };

/**
 * @callback Subcommand
 * @param {Config} config
 * @param {WalletInstance} wallet
 * @param {Array<String>} args
 */

let jsonOut = false;
let offline = false;

let Storage = require("./_storage.js"); //jshint ignore:line

async function main() {
  /* jshint maxcomplexity:1000 */
  /* jshint maxstatements:200 */
  let args = process.argv.slice(2);

  let confName = Cli.removeOption(args, ["-c", "--config-name"]);
  if (null !== confName) {
    // intentional empty string on CLI takes precedence over ENVs
    envSuffix = `${confName}`;
  }
  // ..dev => dev
  let dashEnv = envSuffix.replace(/^\.+/, "");
  // dev => .dev
  if (dashEnv) {
    envSuffix = `.${dashEnv}`;
  }

  /** @type {FsStoreConfig} */
  let storeConfig = {
    dir: `${home}/.config/dash${envSuffix}`,

    // paths
    cachePath: "",
    payWalletsPath: "",
    preferencesPath: "",
    privateWalletsPath: "",
  };
  if (envSuffix.length > 0) {
    console.error(`🚜 DASH_ENV=${process.env.DASH_ENV}`);
    console.error(`⚙️ ~/.config/dash${envSuffix}/`);
    console.error();
  }

  require("dotenv").config({ path: `${storeConfig.dir}/env` });
  require("dotenv").config({ path: `${storeConfig.dir}/.env.secret` });

  let confDir = Cli.removeOption(args, ["-c", "--config-dir"]);
  if (confDir) {
    // TODO check validity
    storeConfig.dir = confDir;
  }

  let jsonArg = Cli.removeFlag(args, ["--json"]);
  if (jsonArg) {
    jsonOut = true;
  }

  let syncNow = Cli.removeOption(args, ["--sync"]);
  if (syncNow) {
    config.staletime = 0;
  }

  config.dashsight = DashSight.create({
    baseUrl: "", // TODO baseUrl is deprecated and should not be required
    insightBaseUrl:
      process.env.INSIGHT_BASE_URL || "https://insight.dash.org/insight-api",
    dashsightBaseUrl:
      process.env.DASHSIGHT_BASE_URL || "https://insight.dash.org/insight-api",
    //"https://dashsight.dashincubator.dev/insight-api",
    dashsocketBaseUrl:
      process.env.DASHSOCKET_BASE_URL || "https://insight.dash.org/socket.io",
  });

  storeConfig.cachePath = Path.join(storeConfig.dir, "cache.json");
  storeConfig.payWalletsPath = Path.join(storeConfig.dir, "pay-wallets.json");
  storeConfig.preferencesPath = Path.join(storeConfig.dir, "preferences.json");
  storeConfig.privateWalletsPath = Path.join(
    storeConfig.dir,
    "private-wallets.json",
  );
  config.store = Storage.create(storeConfig, config);
  // TODO
  //getWallets / getEachWallet
  //getWallets
  //getWallet
  //setWallet
  //getAddresses / getEachAddress
  //getAddress
  //setAddress

  config.safe = await config.store.init(storeConfig);

  let wallet = await Wallet.create(config);

  let version = Cli.removeFlag(args, ["version", "-V", "--version"]);
  if (version) {
    showVersion();
    process.exit(0);
    return;
  }

  let handle = Cli.removeFlag(args, ["connect", "contact", "friend"]);
  if (handle) {
    await upsertContact(config, wallet, args);
    return wallet;
  }

  let isRequestingTransfer = Cli.removeFlag(args, ["request"]);
  if (isRequestingTransfer) {
    await requestMoney(config, wallet, args);
    return wallet;
  }

  let importWif = Cli.removeFlag(args, ["import"]);
  if (importWif) {
    await createWif(config, wallet, args);
    return wallet;
  }

  let list = Cli.removeFlag(args, ["coins", "list"]);
  if (list) {
    await listCoins(config, wallet, args);
    return wallet;
  }

  let est = Cli.removeFlag(args, ["appraise", "estimate"]);
  if (est) {
    await appraise(config, wallet, args);
    return wallet;
  }

  let denom = Cli.removeFlag(args, ["denom", "denominate"]);
  if (denom) {
    await denominate(config, wallet, args);
    return wallet;
  }

  let send = Cli.removeFlag(args, ["send", "pay"]);
  if (send) {
    await sendMoney(config, wallet, args);
    return wallet;
  }

  /*
  // TODO figure out how to bypass outputs
  let donate = Cli.removeFlag(args, ["donate"]);
  if (donate) {
    args.push("--donate");
    await send(config, wallet, args);
    return wallet;
  }
  */

  let showBalances = Cli.removeFlag(args, [
    "contacts",
    "accounts",
    "balance",
    "balances",
  ]);
  if (showBalances) {
    await getBalances(config, wallet, args);
    return null;
  }

  // TODO add note/comment to wallet, address, tx, etc

  let exp = Cli.removeFlag(args, ["export"]);
  if (exp) {
    await exportWif(config, wallet, args);
    return wallet;
  }

  let gen = Cli.removeFlag(args, ["create", "generate", "new"]);
  if (gen) {
    let genWif = Cli.removeFlag(args, ["wif", "address"]);
    if (!genWif) {
      console.error(`Unrecognized subcommand '${gen} ${args[0]}'`);
      process.exit(1);
    }
    await generateWif(config, wallet, args);
    return wallet;
  }

  let rm = Cli.removeFlag(args, ["delete", "remove", "rm"]);
  if (rm) {
    await remove(config, wallet, args);
    return wallet;
  }

  let showStats = Cli.removeFlag(args, ["stat", "stats", "status"]);
  if (showStats) {
    await stat(config, wallet, args);
    return wallet;
  }

  let forceSync = Cli.removeFlag(args, ["reindex", "sync"]);
  if (forceSync) {
    let now = Date.now();
    console.info("syncing...");
    await wallet.sync({ now: now, staletime: 0 });
    return null;
  }

  let help = Cli.removeFlag(args, ["help", "--help", "-h"]);
  if (help) {
    usage();
    return null;
  }

  if (!args[0]) {
    usage();
    process.exit(1);
    return;
  }

  throw new Error(`'${args[0]}' is not a recognized subcommand`);
}

let SHORT_VERSION = `${pkg.name} v${pkg.version} - ${pkg.description}`;

function showVersion() {
  console.info(SHORT_VERSION);
  let sdkVersions = require("./_sdk-versions.js");
  sdkVersions.log(pkg);
}

let USAGE = [
  `${SHORT_VERSION}`,
  ``,
  `USAGE:`,
  `    dashwallet <subcommand> [flags] [options] [--] [args]`,
  ``,
  `SUBCOMMANDS:`,
  `    accounts                           show accounts (and extra wallets)`,
  `    export <addr> [./dir/ or x.wif]    write private keys to disk`,
  `    contact <handle> xpub-or-addr      add contact or show xpubs & addrs`,
  `    request <handle> [amount]          show QR and payment address`,
  `    generate address                   (for debugging only) save a one-off WIF`,
  `    import <./path/to.wif>             copy and index private key(s)`,
  `    coins [--sort wallet,amount,addr]  show all spendable coins`,
  `    denominate <coins-or-amounts>      prepare coins for cash-like transactions`,
  `                    [--broadcast]`,
  `    send <handle|pay-addr> <DASH>      send money to an address/contact`,
  `                    [--broadcast]        using the specified coins or accounts`,
  `                    [--coins Xxxxx:xx:0,...]`,
  `                    [--acounts main,@johndoe,...]`,
  `                    [--break-change]`,
  `                    [--allow-change]`,
  `                    [--change-account main]`,
  // TODO or contact
  `    remove <addr> [--no-wif]           remove stand-alone key`,
  `    stat <addr>                        show current coins & balance`,
  `    estimate <#inputs> <#outputs>      show low-level block fees`,
  `                                       (TODO: move to DashTX)`,
  `    sync                               update address caches`,
  `    version                            show version and exit`,
  ``,
  `OPTIONS:`,
  `    -c, --config-name '', DASH_ENV=''  use ~/.config/dash{.suffix}/`,
  `    --config-dir ~/.config/dash/       change full config path`,
  `    --json                             output as JSON (if possible)`,
  //`    --offline                             no sync, cache updates, balance checks, etc`,
  `    --sync                             wait for sync first`,
  ``,
].join("\n");

function usage() {
  console.info(USAGE);
}

/** @type {Subcommand} */
async function upsertContact(config, wallet, args) {
  let [handle, xpubOrAddr] = args;
  if (!handle) {
    throw Error(
      `Usage: dashwallet contact <handle> [xpub-or-static-addr] [--legacy <address count>]`,
    );
  }
  let countStr = Cli.removeOption(args, ["--legacy", "-n"]);
  let count = parseInt(countStr, 10) || 1;

  let xpub = "";
  let address = "";
  let isXPub = await Wallet.isXPub(xpubOrAddr);
  let isAddr = await Wallet.isAddr(xpubOrAddr);
  if (isXPub) {
    xpub = xpubOrAddr;
  } else if (isAddr) {
    address = xpubOrAddr;
  } else if (xpubOrAddr) {
    throw new Error(`unrecognized option ${xpubOrAddr}`);
  }

  let [rxXPub, txWallet] = await wallet // jshint ignore:line
    .contact({
      handle,
      xpub,
      address,
    });

  let txAddrsInfo = {
    addresses: [],
    index: 0,
  };
  if (txWallet?.xpub) {
    txAddrsInfo = await wallet.getNextPayAddrs({ handle, count });
  }
  if (!txAddrsInfo.addresses.length) {
    // TODO live wallet link to request xpub
    console.error("no xpub or unused addresses found");
    process.exit(1);
    return;
  }

  let addrIndex = `#${txAddrsInfo.index}`;
  let multiUse = txWallet?.address || txWallet?.addr;
  if (multiUse) {
    addrIndex = `multi-use`;
  }

  console.info();
  console.info(`Send DASH to '${handle}':`);

  let txAddr = txAddrsInfo.addresses[0];
  console.info();
  console.info(`XPub Address:\n${txAddrsInfo.xpub}`);
  console.info(`(legacy address [${addrIndex}]: ${txAddr})`);
  console.info();
  let url = toUrl(txAddrsInfo.xpub, txAddr);
  console.info(url);

  let qr = toQrAscii(txAddrsInfo.xpub, txAddr);
  console.info();
  console.info(qr);
  console.info();

  console.info(`1. You can send money to ${handle} by:`);
  console.info(`    a) scanning the QR above with compatible software`);
  console.info(`    or b) run the following command:`);
  console.info();
  console.info(`        dashwallet send ${handle} 0.001`);
  console.info();
  console.info(`2. To let ${handle} add YOU as a contact, run this:`);
  console.info();
  console.info(`        dashwallet request ${handle}`);
  console.info();
  console.info();
}

/** @type {Subcommand} */
async function requestMoney(config, wallet, args) {
  let [handle, amount] = args;
  if (!handle) {
    throw Error(
      `Usage: dashwallet request <handle> [amount] [--legacy <address count>]`,
    );
  }
  let countStr = Cli.removeOption(args, ["--legacy", "-n"]);
  let count = parseInt(countStr, 10) || 1;

  // TODO XXXX denominate amount and print to screen

  let [rxXPub] = await wallet.contact({
    handle,
  });

  console.info();
  console.info(`Receive DASH from '${handle}':`);
  console.info();
  console.info(`XPub Address:`);
  console.info(rxXPub);
  let rxAddrsInfo = await wallet.getNextReceiveAddrs({ handle, count });
  if (count === 1) {
    let rxAddr = rxAddrsInfo.addresses[0];
    console.info(
      `(next legacy address [#${rxAddrsInfo.index}] is '${rxAddr}')`,
    );
  } else {
    console.info();
    console.info(`Legacy addresses:`);
    rxAddrsInfo.addresses.forEach(
      /**
       * @param {String} addr
       * @param {Number} i
       */
      function (addr, i) {
        let index = i + rxAddrsInfo.index;
        console.info(`    ${addr} (legacy address ${index})`);
      },
    );
  }
  console.info();

  let rxAddr = rxAddrsInfo.addresses[0];
  let url = toUrl(rxXPub, rxAddr, null, amount);
  console.info(url);

  let qr = toQrAscii(rxXPub, rxAddr, null, amount, { invert: true });
  console.info();
  console.info(qr);
  console.info();

  // TODO set your preferred nickname globally in preferences, and per-contact
  console.info(`1. ${handle} can add YOU as a contact by:`);
  console.info(`    a) scanning the QR above with contact-compatible software`);
  console.info(`    or b) run the following command:`);
  console.info();
  console.info(`        dashwallet contact @YOUR_NICKNAME ${rxXPub}`);
  console.info();
  console.info(`2. ${handle} can send money TO YOU with this command:`);
  console.info();
  console.info(`        dashwallet send @YOUR_NICKNAME ${amount}`);
  console.info();
  console.info(`3. You can add ${handle} as a contact by:`);
  console.info(`    a) asking them for the QR to scan from that command`);
  console.info(`    or b) ask them to run this to create your an xpub:`);
  console.info();
  console.info(`        dashwallet request @YOUR_NICKNAME`);
  console.info();
  console.info(`4. YOU run 'dashwallet contact ${handle} <XPUB>' to add them`);
  console.info();
  console.info(`        dashwallet contact @YOUR_NICKNAME THEIR_XPUB_HERE`);
  console.info();
  console.info();
}

/** @type {Subcommand} */
async function createWif(config, wallet, args) {
  let wifPaths = args;
  if (!wifPaths.length) {
    throw Error(`Usage: dashwallet import <./path/1.wif> [./path/2.wif, ...]`);
  }

  /** @type {Array<String>} */
  let wifs = [];
  await wifPaths.reduce(async function (promise, wifPath) {
    await promise;

    let wif = await Fs.readFile(wifPath, "utf8");
    // TODO check wif-y-ness
    wifs.push(wif.trim());
  }, Promise.resolve());

  let addrInfos = await wallet.import({
    wifs,
  });

  console.info();
  console.info(`Imported the following into the standalone 'wifs' wallet:`);
  addrInfos.forEach(
    /** @param {WalletAddress} addrInfo */
    function (addrInfo) {
      let address = addrInfo.address || addrInfo.addr;
      let totalBalance = Wallet.getBalance(addrInfo.utxos);
      let dashBalance = Wallet.toDash(totalBalance).toFixed(8);
      console.info(`    ${address} (Đ${dashBalance})`);
    },
  );
}

/** @type {Subcommand} */
async function remove(config, wallet, args) {
  let noWif = Cli.removeFlag(args, ["--no-wif"]);
  let force = Cli.removeFlag(args, ["--force"]);
  let [addrPrefix] = args;

  if (!addrPrefix?.length) {
    throw Error(`Usage: dashwallet remove <addr> [--no-wif]`);
  }

  let addrInfo = await wallet.findAddr(addrPrefix);
  if (!addrInfo) {
    console.error();
    console.error(`'${addrPrefix}' did not matches any address in any wallets`);
    console.error();
    process.exit(1);
  }

  let address = addrInfo.address || addrInfo.addr;
  let wifInfo = await wallet.findWif({
    address: address,
    addr: address,
  });
  if (!wifInfo) {
    console.info();
    console.info(`Deleted cached info for '${address}'`);
    console.info(`(no associated WIF was found`);
    return;
  }

  let totalBalance = Wallet.getBalance(wifInfo.utxos);
  if (totalBalance > 0) {
    if (!force) {
      let dashBalance = Wallet.toDash(totalBalance).toFixed(8);
      console.error();
      console.error(
        `'${address}' still has a balance of ${dashBalance}. Use --force to continue..`,
      );
      console.error();

      process.exit(1);
      return;
    }
  }

  await wallet.removeWif({ address: address, addr: address });
  if (!noWif) {
    console.info();
    console.info(`Removed WIF '${wifInfo.wif}'`);
    console.info("(you may wish to save that as a backup)");
    return;
  }

  console.info();
  console.info(`Removed '${address}' (and its associated WIF)`);
}

/** @type {Subcommand} */
async function exportWif(config, wallet, args) {
  let [addrPrefix, wifPath] = args;

  if (!addrPrefix?.length) {
    throw Error(`Usage: dashwallet export <addr> [./dir/ or ./file.wif]`);
  }

  let addrInfos = await wallet.findAddrs(addrPrefix);
  if (!addrInfos.length) {
    console.error();
    console.error(`'${addrPrefix}' did not matches any address in any wallets`);
    console.error();
    process.exit(1);
  }

  if (addrInfos.length > 1) {
    console.error();
    console.error(
      `'${addrPrefix}' matches the following addresses (pick one):`,
    );
    console.error();
    addrInfos.forEach(
      /** @param {Required<WalletAddress>} addrInfo */
      function (addrInfo) {
        let address = addrInfo.address || addrInfo.addr;
        console.error(`    ${address}`);
      },
    );
    console.error();
    process.exit(1);
  }

  let addrInfo = addrInfos[0];
  let address = addrInfo.address || addrInfo.addr;
  let wifInfo = await wallet.findWif(addrInfo);

  if (!wifPath) {
    wifPath = ".";
  }

  let showAddr = true;
  let fullPath;
  let stat = await Fs.stat(wifPath).catch(function (err) {
    if ("ENOENT" === err.code) {
      return null;
    }
    throw err;
  });
  if (!stat) {
    // assumed to be a file that doesn't exist
    fullPath = wifPath;
  } else if (stat?.isDirectory()) {
    showAddr = false;
    fullPath = Path.join(wifPath, `${address}.wif`);
    let pathish = fullPath.startsWith(".") || fullPath.startsWith("/");
    if (!pathish) {
      fullPath = `./${fullPath}`;
    }
  } else {
    // TODO --force
    throw new Error(`'${wifPath}' already exists`);
  }

  await Fs.writeFile(fullPath, wifInfo.wif, "ascii");

  console.info();
  let addr = "";
  if (showAddr) {
    addr = ` (${address})`;
  }
  console.info(`Wrote WIF to '${fullPath}'${addr}`);
}

/** @type {Subcommand} */
async function generateWif(config, wallet, args) {
  let Secp256k1 =
    //@ts-ignore
    /*Window.nobleSecp256k1 ||*/ require("@dashincubator/secp256k1");

  let privBytes = Secp256k1.utils.randomPrivateKey();
  await verifyPrivateKey(privBytes);

  //@ts-ignore - TODO what's up with the typing here?
  let wif = await DashKeys.privKeyToWif(privBytes);

  // TODO --no-import
  // TODO --offline (we don't need to check txs on what we just generated)
  let addrInfos = await wallet.import({ wifs: [wif] });
  let addrInfo = addrInfos[0];
  let address = addrInfo.address || addrInfo.addr;

  console.info();
  console.info(`Generated (and imported) the following private key (wif):`);
  console.info();
  console.info(`    ${address}`);
  console.info();
}

/**
 * @param {Uint8Array} privBytes
 * @throws {Error}
 */
async function verifyPrivateKey(privBytes) {
  // if it can generate a valid public key, it's a private key
  //@ts-ignore - TODO why isn't utils recognized?
  await DashKeys.utils.toPublicKey(privBytes);
}

// TODO move to dashtx-cli
//
// appraise <inputs> <outputs> how much will the transaction cost
//             (and how likely is it at each cost)
/** @type {Subcommand} */
async function appraise(config, wallet, args) {
  let n = Cli.removeArg(args);
  let m = Cli.removeArg(args) ?? n;

  let inputs = [];
  let outputs = [];
  inputs.length = n;
  outputs.length = m;

  let fees = await DashTx.appraise({ inputs, outputs });
  let chance = "25%";
  if (inputs.length > 1) {
    let oddsNum = Math.pow(4, inputs.length);
    if (oddsNum > Number.MAX_SAFE_INTEGER) {
      oddsNum = Infinity;
    }
    let numIntl = new Intl.NumberFormat();
    let odds = numIntl.format(oddsNum);
    chance = `1 in ${odds}`;
  }

  let min = toDustFixed(fees.min);
  let mid = toDustFixed(fees.mid);
  let max = toDustFixed(fees.max);

  console.info(`Min:    ${min} (${chance} acceptance)`);
  console.info(`Mid:    ${mid} (75% acceptance)`);
  console.info(`Max:    ${max} (100% acceptance)`);

  let range = fees.max - fees.min;
  let rangeDash = toDustFixed(range);
  console.info(``);
  console.info(`Range:  ${rangeDash}`);

  let theoretical = !inputs.length || !outputs.length;
  if (theoretical) {
    console.error();
    console.error(
      `WARNING: transactions with 0 inputs or 0 outputs are not valid`,
    );
    console.error();

    process.exit(1);
  }
}

const SATOSHIS = 100000000;
function toDustFixed(satoshis) {
  let dashNum = satoshis / SATOSHIS;
  let dash = dashNum.toFixed(8);
  dash = dash.slice(0, 6) + " " + dash.slice(6);
  return dash;
}

// denominate <coins> send these coins to person x, minus fees
/** @type {Subcommand} */
async function denominate(config, wallet, args) {
  let dryRun = Cli.removeFlag(args, ["--dry-run"]);
  let broadcast = Cli.removeFlag(args, ["--broadcast"]);
  if (dryRun) {
    broadcast = false;
  }
  // TODO XXXX
  //let broadcast = Cli.removeFlag(args, ["--broadcast"]);
  let inputStr = Cli.removeArg(args);
  let inputList = inputStr.split(",");
  inputList = inputList.filter(Boolean);

  let fauxTxos = await inputListToFauxTxos(wallet, inputList);
  let balance = Wallet.getBalance(fauxTxos);
  let balanceStr = toDustFixed(balance);

  // TODO XXX check determine if it's already denominated
  // - last 5 digits mod 200 with no leftover
  //   - 0.000x xxxx % 200 === 0
  // - last 5 digits are over 2 * 200
  //   - 0.000x xxxx > 400
  // - has exactly one significant digit of denominated value
  //   - xxxx.xxx0 0000

  // 0.0001 0000
  let dusty = 10000;

  // can give at least 3 txs to at least 2 coins
  let sixFees = 1200;

  if (balance <= dusty) {
    console.error(`can't redenominate ${balanceStr}`);
    process.exit(1);
  }
  console.info(`Balance: ${balanceStr}`);

  let denomAmounts = [
    1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01,
    0.005, 0.002, 0.001,
  ];

  // TODO if DASH is worth a lot, or if we go with stamp amounts
  if (false) {
    denomAmounts.push(0.0005);
    // TODO dedicated stamp amount?
    denomAmounts.push(0.0002);
    denomAmounts.push(0.0001);
  }

  let denoms = denomAmounts.map(function (v) {
    return v * SATOSHIS;
  });

  let denomStrs = {};
  for (let denom of denoms) {
    denomStrs[denom] = toDustFixed(denom);
  }

  let dust = balance - sixFees;
  let newCoins = {};
  let outputs = [];
  for (let denom of denoms) {
    let n = dust / denom;
    n = Math.floor(n);
    if (!n) {
      continue;
    }

    // less fee estimate per each output
    dust = dust % denom;
    let denomStr = denomStrs[denom];
    newCoins[denomStr] = n;
    for (let i = 0; i < n; i += 1) {
      outputs.push({
        satoshis: denom,
      });
    }
  }
  dust += sixFees;
  let cost = dust;

  let fees = await DashTx.appraise({ inputs: inputList, outputs: outputs });
  let feeStr = toDustFixed(fees.mid);

  if (dust < fees.mid) {
    throw new Error("dust < fee recalc not implemented");
  }

  dust -= fees.mid;

  let stampSats = 200;
  let numStamps = dust / stampSats;
  let dustDust = dust % 200;
  numStamps = Math.floor(numStamps);
  if (numStamps < outputs.length) {
    throw new Error("numStamps < numOutputs recalc not implemented");
  }

  let stampsExtra = numStamps % outputs.length;
  let stampsEach = numStamps / outputs.length;
  stampsEach = Math.floor(stampsEach);

  outputs.forEach(function (output) {
    output.satoshis += stampsEach * stampSats;
  });
  outputs
    .slice()
    .reverse()
    .some(function (output, i) {
      if (stampsExtra === 0) {
        return true;
      }

      output.satoshis += stampSats;
      stampsExtra -= 1;
    });

  console.info(outputs);
  console.info(
    `Fee:  ${feeStr}  (${inputList.length} inputs, ${outputs.length} outputs)`,
  );
  console.info(`Stamps: ${numStamps} x 0.0000 0200 (${stampsEach} per output)`);

  let dustStr = toDustFixed(dust);
  let dustDustStr = toDustFixed(dustDust);
  console.info(`Dust: ${dustDustStr} (${dustStr})`);
  console.info(``);

  let costStr = toDustFixed(cost);
  console.info(`Cost to Denominate: ${costStr}`);
  console.info(``);

  // TODO handle should link to hash of seed and account # of other wallet
  // TODO deposit into coinjoin account
  let addrsInfo = await wallet.getNextPayAddrs({
    handle: "main",
    count: outputs.length,
  });
  console.info(addrsInfo.addresses);

  let addresses = addrsInfo.addresses.slice(0);
  for (let output of outputs) {
    output.address = addresses.pop();
  }
  fauxTxos.sort(Wallet.sortInputs);
  outputs.sort(Wallet.sortOutputs);

  for (let output of outputs) {
    //@ts-ignore TODO bad export
    let pkh = await DashKeys.addrToPkh(output.address);
    //@ts-ignore TODO bad export
    let pkhHex = DashKeys.utils.bytesToHex(pkh);
    Object.assign(output, { pubKeyHash: pkhHex });
  }
  let txInfoRaw = {
    inputs: fauxTxos,
    outputs: outputs,
  };

  let dashTx = DashTx.create();
  let keys;
  try {
    keys = await wallet._utxosToPrivKeys(fauxTxos);
  } catch (e) {
    if (broadcast) {
      throw e;
    }
  }
  if (!keys) {
    return;
  }

  let txInfo = await dashTx.hashAndSignAll(txInfoRaw, keys);

  //let wutxos = await sendAndReport(txInfo, dryRun);
  await sendAndReport(txInfo, broadcast, dryRun);
}

async function sendAndReport(txInfo, broadcast, dryRun) {
  if (!broadcast) {
    console.info(
      "Transaction Hex: (inspect at https://live.blockcypher.com/dash/decodetx/)",
    );
    console.info(txInfo.transaction);
    console.info();

    if (!dryRun) {
      console.info();
      console.info(`NOT SENT`);
      console.info(`Use '--broadcast' to really send this transaction.`);
      console.info();
    }
  } else {
    // TODO sendTx
    let txResult = await config.dashsight.instantSend(txInfo.transaction);
    console.info("Sent!");
    console.info();
    console.info(`https://insight.dash.org/tx/${txResult.txid}`);
  }
  console.info();

  let wutxos = txInfo.inputs.map(
    /**
     * @param {CoreUtxo} utxo
     * @return {WalletUtxo} utxo
     */
    function (utxo) {
      let walletName = config.safe.cache.addresses[utxo.address].wallet;
      return Object.assign({ wallet: walletName }, utxo);
    },
  );

  return wutxos;
}

async function inputListToFauxTxos(wallet, inputList) {
  let dups = {};
  let fauxTxos = [];

  for (let input of inputList) {
    let num = parseFloat(input);
    if (!num) {
      await coinToUtxos(wallet, fauxTxos, input, dups);
      continue;
    }

    let satoshis = satoshisFromDecimal(input);
    fauxTxos.push({ satoshis });
  }

  return fauxTxos;
}

// pay <handle> <coins> send these coins to person x, minus fees
// pay <handle> <amount> [coins] send this amount to person x,
//     using ALL coins, and send back the change
/** @type {Subcommand} */
async function sendMoney(config, wallet, args) {
  let accountList = Cli.removeOption(args, ["--accounts"]);
  let changeAccount = Cli.removeOption(args, ["--change-account"]);
  let breakChange = Cli.removeFlag(args, ["--break-change"]);
  //let donate = Cli.removeFlag(args, ["--donate"]);
  //let forceDonation = Cli.removeOption(args, ["--force-donation"]) ?? "";
  let dryRun = Cli.removeFlag(args, ["--dry-run"]);
  let broadcast = Cli.removeFlag(args, ["--broadcast"]);
  if (dryRun) {
    broadcast = false;
  }
  let allowChange = Cli.removeFlag(args, ["--allow-change"]);
  let reuseAddr = Cli.removeFlag(args, ["--reuse-address"]);
  let coinList = Cli.removeOption(args, ["--coins"]);
  if (!changeAccount) {
    changeAccount = "main";
  }

  // TODO sort between addrs, wifs, and utxos
  let [handle, amountOrCoins] = args;
  let isComplete = handle && amountOrCoins;
  if (!isComplete) {
    throw Error(
      [
        `Usage: dashwallet send <handle-or-addr> <amount-or-coins>`,
        `Example: dashwallet send @johndoe 1.0`,
        `Example: dashwallet send @johndoe Xzzz:xx:0,Xyyy:ab:1`,
        `Example: dashwallet send @johndoe 1.0 --coins Xzzz:xx:0,Xyyy:ab:1`,
      ].join("\n"),
    );
  }

  // TODO: don't allow mix and match of XPub send and FingerPrintSend

  let satoshis;
  let isCoin = amountOrCoins.startsWith("X"); // TODO
  if (isCoin) {
    if (accountList?.length) {
      let err = new Error(
        `cannot specify '${amountOrCoins}' and --accounts '${accountList}'`,
      );
      //@ts-ignore
      err.type = "E_BAD_INPUT";
      throw err;
    }
    if (coinList?.length) {
      let err = new Error(
        `cannot specify '${amountOrCoins}' and --coins '${coinList}'`,
      );
      //@ts-ignore
      err.type = "E_BAD_INPUT";
      throw err;
    }
    coinList = amountOrCoins;
    satoshis = null;
  } else {
    satoshis = satoshisFromDecimal(amountOrCoins);
  }

  if (accountList?.length) {
    if (coinList?.length) {
      let err = new Error(
        `cannot specify --accounts '${accountList}' and --coins '${coinList}'`,
      );
      //@ts-ignore
      err.type = "E_BAD_INPUT";
      throw err;
    }
  }

  let d = wallet;
  let utxos = await coinListToUtxos(wallet, coinList);

  // START prototype stub for multi-payee transactions
  let payouts = [{ satoshis, handle }];
  let payees = {};
  let totalSats = 0;
  let totalDenoms = [];
  if (payouts.length === 1) {
    if (!payouts[0].satoshis) {
      let payout = wallet.useAllCoins({ utxos, breakChange });
      payouts[0].satoshis = 0;
      for (let satoshis of payout.output.denoms) {
        payouts[0].satoshis += satoshis;
      }
    }
  }
  for (let payout of payouts) {
    if (!payout.satoshis) {
      let err = new Error(
        "each payout MUST be specified when paying to multiple accounts",
      );
      err.code = "E_SEND_AMOUNT";
      throw err;
    }
    let output = Wallet._parseSendInfo(d, payout.satoshis);
    totalSats += output.satoshis;
    totalDenoms = totalDenoms.concat(output.denoms);

    payees[payout.handle] = { output };
  }
  let output = {
    satoshis: totalSats,
    denoms: totalDenoms,
  };
  // END prototype stub

  let selection;
  let fullTransfer = !satoshis;
  if (fullTransfer) {
    selection = wallet.useAllCoins({ utxos, breakChange });
  } else {
    if (utxos.length === 0) {
      utxos = await accountListToUtxos(wallet, accountList);
    }
    // TODO minStamps, maxStamps, maxStampConversion
    selection = wallet.useMatchingCoins({ output, utxos, breakChange });
  }

  let outputs = [];
  let allOutVals = selection.output.denoms.slice(0);
  let payeeHandles = Object.keys(payees);
  for (let payeeHandle of payeeHandles) {
    let payee = payees[payeeHandle];
    let outVals = payee.output.denoms.slice(0);
    let count = outVals.length;
    let isAddrLike = Wallet.isAddrLike(handle);
    if (isAddrLike) {
      reuseAddr = true;
    }
    if (reuseAddr) {
      // TODO single, exact output value
      count = 1;
    }

    let addrsInfo;
    try {
      addrsInfo = await wallet.getNextPayAddrs({
        handle: payeeHandle,
        count: count,
        allowReuse: reuseAddr,
        now: Date.now(),
        staletime: config.staletime,
      });
    } catch (e) {
      let acceptable = ["E_TOO_FEW_ADDRESSES", "E_NO_UNUSED_ADDR"];
      if (!acceptable.includes(e.code)) {
        throw e;
      }
      if (!reuseAddr) {
        e.message += `\nPass --reuse-address to send to a single, reused address anyway`;
        throw e;
      }
      if (!e.lastAddress) {
        throw e;
      }
      addrsInfo = { index: -1, addresses: [e.lastAddress] };
      throw e;
    }

    if (reuseAddr) {
      while (addrsInfo.addresses.length < outVals.length) {
        addrsInfo.addresses.push(handle);
      }
    }

    for (let denom of outVals) {
      let index = allOutVals.indexOf(denom);
      if (index === -1) {
        let err = new Error(
          `[Sanity Fail] missing output values (should be impossible)`,
        );
        throw err;
      }

      let outVal = allOutVals.splice(index, 1)[0];
      if (outVal !== denom) {
        throw new Error(
          "[Sanity Fail] wrong value was spliced (should be impossible)",
        );
      }

      let stampVal = wallet.__STAMP__ * selection.output.stampsPerCoin;
      let coreOutput = {
        address: addrsInfo.addresses.pop(),
        satoshis: denom + stampVal,
        faceValue: denom,
        stamps: selection.output.stampsPerCoin,
      };
      outputs.push(coreOutput);
    }

    if (addrsInfo.addresses.length) {
      throw new Error(
        "[Sanity Fail] some pay addresses left unused (should be impossible)",
      );
    }
  }

  // leftovers are change
  {
    if (!allowChange) {
      if (allOutVals.length) {
        let dashOuts = [];
        for (let val of allOutVals) {
          let dashVal = Wallet.toDash(val).toFixed(3);
          dashOuts.push(dashVal);
        }
        let dashOut = dashOuts.join(", ");
        let err = new Error(
          `pass --allow-change to send this transaction with ${allOutVals.length} change outputs: ${dashOut}`,
        );
        err.code = "E_CHANGE_OUTPUTS";
        //@ts-ignore
        err.denoms = allOutVals;
        throw err;
      }
    }

    let addrsInfo = await wallet.getNextChangeAddrs({
      handle: changeAccount,
      count: allOutVals.length,
      //now: now,
      //staletime: staletime,
    });
    for (let outVal of allOutVals) {
      let stampVal = wallet.__STAMP__ * selection.output.stampsPerCoin;
      let coreOutput = {
        address: addrsInfo.addresses.pop(),
        satoshis: outVal + stampVal,
        faceValue: outVal,
        stamps: selection.output.stampsPerCoin,
      };
      outputs.push(coreOutput);
    }
  }

  let dashTx = DashTx.create();
  let txInfoRaw = {
    inputs: selection.inputs,
    outputs: outputs,
  };
  txInfoRaw.inputs.sort(Wallet.sortInputs);
  txInfoRaw.outputs.sort(Wallet.sortOutputs);

  let fees = await DashTx.appraise(txInfoRaw);

  let totalSatsIn = 0;
  let totalFaceIn = 0;
  for (let input of txInfoRaw.inputs) {
    let addr = input.address.slice(0, 6);
    let dashVal = Wallet.toDash(input.faceValue).toFixed(3);
    let sats = input.satoshis.toString().padStart(10, " ");
    totalFaceIn += input.faceValue;
    totalSatsIn += input.satoshis;
    let dust = sats - input.faceValue;
    dust = dust % wallet.__STAMP__;
    console.info(`   ${addr}: ${dashVal}      | ${sats} (${dust})`);
  }
  let dashVal8 = Wallet.toDash(totalSatsIn).toFixed(8);
  let dashVal3 = Wallet.toDash(totalFaceIn).toFixed(3);
  let stampsInVal = totalSatsIn - totalFaceIn;
  let stampsIn = stampsInVal / wallet.__STAMP__;
  stampsIn = Math.floor(stampsIn);
  let stampsPerEach = stampsIn / txInfoRaw.inputs.length;
  stampsPerEach = Math.floor(stampsPerEach);
  let evenStamps = stampsPerEach * txInfoRaw.inputs.length;
  let oddStamps = stampsIn - evenStamps;
  let sats10 = totalSatsIn.toString().padStart(10, " ");

  console.info(
    ` Total In: ${dashVal8} | ${sats10} | ${dashVal3} + (${stampsIn} * ${wallet.__STAMP__}) (${stampsPerEach}/c + ${oddStamps})`,
  );
  console.info(` ${txInfoRaw.inputs.length} Coins`);
  console.info();

  let totalFaceOut = 0;
  let totalSatsOut = 0;
  for (let output of txInfoRaw.outputs) {
    totalFaceOut += output.faceValue;
    totalSatsOut += output.satoshis;
  }

  let dashSatsOut = Wallet.toDash(totalSatsOut).toFixed(8);
  let dashFaceOut = Wallet.toDash(totalFaceOut).toFixed(3);
  let stampsValOut = totalSatsOut - totalFaceOut;
  let stampsOut = stampsValOut / wallet.__STAMP__;

  let fee = totalSatsIn - totalSatsOut;
  let dustFee = fee - fees.max;
  let dustStamps = dustFee / wallet.__STAMP__;
  dustStamps = Math.floor(dustStamps);
  let dustStampsVal = dustStamps * wallet.__STAMP__;
  fee -= dustStampsVal;
  for (let output of outputs) {
    if (dustStamps === 0) {
      break;
    }
    stampsOut += 1;
    output.satoshis += wallet.__STAMP__;
    totalSatsOut += wallet.__STAMP__;
    output.stamps += 1;
    dustStamps -= 1;
  }
  txInfoRaw.outputs.sort(Wallet.sortOutputs);

  let satsOut10 = totalSatsOut.toString().padStart(10, " ");

  for (let output of txInfoRaw.outputs) {
    let addr = output.address.slice(0, 6);
    let dashVal = Wallet.toDash(output.faceValue).toFixed(3);
    let sats = output.satoshis.toString().padStart(10, " ");
    console.info(
      `   ${addr}: ${dashVal}      | ${sats} (${output.stamps} * ${wallet.__STAMP__})`,
    );
  }

  console.info(
    `Total Out: ${dashSatsOut} | ${satsOut10} | ${dashFaceOut} + (${stampsOut} * ${wallet.__STAMP__})`, //  (${stampsPerEach}/c + ${oddStamps})
  );
  console.info(`${txInfoRaw.outputs.length} Coins`);
  let dustyFee = fee - fees.max;
  console.info(
    `Fee:             ${fee} |   ${totalSatsIn} - ${totalSatsOut} = (${fees.max} + ${dustyFee})`,
  );

  let actualFee = totalSatsIn - totalSatsOut;
  if (fee !== actualFee) {
    throw new Error(
      `[Sanity Fail] ${fee} != ${actualFee} # ${totalSatsIn} - ${totalSatsOut}`,
    );
  }

  let keys = await wallet._utxosToPrivKeys(selection.inputs);
  let txInfo = await dashTx.hashAndSignAll(txInfoRaw, keys, {
    presorted: true,
  });

  console.info();
  if (!broadcast) {
    console.info(
      "Transaction Hex: (inspect at https://live.blockcypher.com/dash/decodetx/)",
    );
    console.info();
    console.info(txInfo.transaction);
    console.info();

    if (!dryRun) {
      console.info();
      console.info(`NOT SENT`);
      console.info(`Use '--broadcast' to really send this transaction.`);
      console.info();
    }
    return;
  }

  // TODO sendTx
  let txResult = await config.dashsight.instantSend(txInfo.transaction);
  console.info("Sent!");
  console.info();
  console.info(`https://insight.dash.org/tx/${txResult.txid}`);
  console.info();

  // TODO move to sendTx
  let now = Date.now();
  await wallet.captureTx({
    inputs: txInfo.inputs,
    outputs: txInfo.outputs,
    now: now,
  });

  await config.store.save(config.safe.cache);
}

function satoshisFromDecimal(amount) {
  let hasDecimal = amount?.split(".").length >= 2;
  let satoshis = Wallet.toDuff(parseFloat(amount));

  if (hasDecimal && satoshis) {
    return satoshis;
  }

  let err = new Error(
    `DASH amount must be given in decimal form, such as 1.0 or 0.00100000, not '${amount}'`,
  );
  //@ts-ignore
  err.type = "E_BAD_INPUT";
  throw err;
}

/**
 * @param {WalletInstance} wallet
 * @param {String?} accountList
 * @returns {Promise<Array<CoreUtxo>?>}
 */
async function accountListToUtxos(wallet, accountList) {
  let exclude = [];
  if (!accountList) {
    accountList = "";
  }

  /** @type {Array<CoreUtxo>} utxos */
  let utxos = [];

  let accounts = await wallet.accounts();

  // '' => []
  // 'a,b c,,  d' => ['a', 'b', 'c', 'd']
  let accountNames = accountList.split(/[\s,]+/).filter(Boolean);
  if (!accountNames.length) {
    accountNames = Object.keys(accounts);
    exclude = ["savings", "@savings"];
  }

  let missing = [];
  for (let accountName of accountNames) {
    let account = accounts[accountName];
    if (!account) {
      missing.push(accountName);
    }
  }
  if (missing.length) {
    let invalidAccountNames = missing.join(", ");
    let knownAccountNames = "    " + Object.keys(accounts).join("\n    ");
    let err = new Error(
      [
        `invalid account(s): ${invalidAccountNames} (maybe check for typos?)`,
        `valid accounts are:`,
        knownAccountNames,
      ].join("\n"),
    );
    err.code = "E_BAD_REQUEST";
    throw err;
  }

  for (let accountName of accountNames) {
    let isExcluded = exclude.includes(accountName);
    if (isExcluded) {
      continue;
    }

    let account = accounts[accountName];
    utxos = utxos.concat(account.utxos);
  }

  return utxos;
}

/**
 * @param {WalletInstance} wallet
 * @param {String?} coinList
 * @returns {Promise<Array<CoreUtxo>?>}
 */
async function coinListToUtxos(wallet, coinList) {
  if (null === coinList) {
    return [];
  }

  // '' => []
  // 'a,b c,,  d' => ['a', 'b', 'c', 'd']
  let coins = coinList.split(/[\s,]+/).filter(Boolean);

  /** @type {Array<CoreUtxo>} utxos */
  let utxos = [];
  /** @type {Object.<String, Boolean>} dups */
  let dups = {};

  for (let coin of coins) {
    await coinToUtxos(wallet, utxos, coin, dups);
  }

  return utxos;
}

/**
 * @param {WalletInstance} wallet
 * @param {Array<CoreUtxo>} utxos
 * @param {String} coin
 * @param {Object.<String, Boolean>} dups
 * @returns {Promise<Array<CoreUtxo>?>}
 */
async function coinToUtxos(wallet, utxos, coin, dups) {
  // 'Xaddr1'
  // 'Xaddr2:tx:0'
  let [addrPre, txPre, voutStr] = coin.split(":");
  let addrUtxos = await mustGetAddrUtxos(wallet, addrPre);

  if (!txPre) {
    addrUtxos.forEach(
      /** @param {CoreUtxo} utxo */
      function addUtxo(utxo) {
        let dupId = `${utxo.address}:${utxo.txId}:${utxo.outputIndex}`;
        if (dups[dupId]) {
          return;
        }

        dups[dupId] = true;

        utxos.push(utxo);
      },
    );
    return;
  }

  let utxo = addrUtxos.find(
    /** @param {CoreUtxo} utxo */
    function byMatchingCoin(utxo) {
      let dupId = `${utxo.address}:${utxo.txId}:${utxo.outputIndex}`;
      if (dups[dupId]) {
        return false;
      }

      if (!utxo.txId.startsWith(txPre)) {
        // TODO how to ensure no short 'txPre's?
        return false;
      }

      let vout = parseFloat(voutStr);
      if (vout !== utxo.outputIndex) {
        return false;
      }

      dups[dupId] = true;
      return true;
    },
  );
  if (!utxo) {
    throw new Error(`no coin matches '${coin}'`);
  }

  utxos.push(utxo);
  return utxos;
}

/**
 * @param {WalletInstance} wallet
 * @param {String} addrPrefix
 */
async function mustGetAddrUtxos(wallet, addrPrefix) {
  let addrInfos = await wallet.findAddrs(addrPrefix);
  if (!addrInfos.length) {
    let errMsg = `'${addrPrefix}' did not matches any address in any wallets`;
    let err = Error(errMsg);
    //@ts-ignore
    err.type = "E_BAD_INPUT";
    throw err;
  }

  if (addrInfos.length > 1) {
    let errLines = [
      `'${addrPrefix}' matches the following addresses (pick one):`,
    ];
    errLines.push("");
    addrInfos.forEach(
      /** @param {Required<WalletAddress>} addrInfo */
      function (addrInfo) {
        let address = addrInfo.address || addrInfo.addr;
        errLines.push(`    ${address}`);
      },
    );

    let err = new Error(errLines.join("\n"));
    //@ts-ignore
    err.type = "E_BAD_INPUT";
    throw err;
  }

  let addrInfo = addrInfos[0];
  let address = addrInfo.address || addrInfo.addr;

  let utxos = addrInfo.utxos.map(
    /** @param {MiniUtxo} utxo */
    function (utxo) {
      return Object.assign({ address }, utxo);
    },
  );

  return utxos;
}

/** @type {Subcommand} */
async function getBalances(config, wallet, args) {
  let balance = 0;

  console.info("syncing... (updating info over 5 minutes old)");
  let now = Date.now();
  await wallet.sync({ now: now, staletime: config.staletime });

  console.info();
  console.info("Wallets:");
  console.info();

  let balances = await wallet.balances();
  Object.entries(balances).forEach(function ([wallet, satoshis]) {
    balance += satoshis;
    let floatBalance = parseFloat((satoshis / Wallet.DUFFS).toFixed(8));
    console.info(`    ${wallet}: ${floatBalance}`);
  });

  console.info();
  let floatBalance = parseFloat((balance / Wallet.DUFFS).toFixed(8));
  console.info(`Total: ${floatBalance}`);
}

/**
 * @callback CoinSorter
 * @param {Pick<WalletUtxo,"address"|"satoshis"|"wallet">} a
 * @param {Pick<WalletUtxo,"address"|"satoshis"|"wallet">} b
 * @returns {Number}
 */

/** @type {Object.<String, CoinSorter>} */
//@ts-ignore
let coinSorters = {
  addr:
    /** @type {CoinSorter} */
    function byAddrAsc(a, b) {
      if (a.address > b.address) {
        return 1;
      }
      if (a.address < b.address) {
        return -1;
      }
      return 0;
    },
  satoshis:
    /** @type {CoinSorter} */
    function bySatoshisDesc(a, b) {
      return b.satoshis - a.satoshis;
    },
  // alias of satoshis
  amount:
    /** @type {CoinSorter} */
    function bySatoshisDesc(a, b) {
      return b.satoshis - a.satoshis;
    },
  wallet:
    /** @type {CoinSorter} */
    function byWalletAsc(a, b) {
      if (a.wallet > b.wallet) {
        return 1;
      }
      if (a.wallet < b.wallet) {
        return -1;
      }
      return 0;
    },
};

/** @type {Subcommand} */
async function listCoins(config, wallet, args) {
  let sortArg = Cli.removeOption(args, ["--sort"]) || "";
  let sortBys = sortArg.split(/[\s,]/).filter(Boolean);
  if (!sortBys.length) {
    sortBys = ["wallet", "amount", "satoshis", "addr"];
  }

  let safe = config.safe;

  let _utxos = await wallet.utxos();
  if (!_utxos.length) {
    let sadMsg = `Your wallet is empty. No coins. Sad day. 😢`;
    if (jsonOut) {
      console.error(sadMsg);
      console.info(JSON.stringify("[]", null, 2));
      return;
    }
    console.info();
    console.info(sadMsg);
    return;
  }

  let utxos = _utxos.map(
    /** @param {CoreUtxo} utxo */
    function (utxo) {
      return Object.assign(
        {
          wallet: safe.cache.addresses[utxo.address].wallet,
        },
        utxo,
      );
    },
  );
  utxos.sort(
    /** @type {CoinSorter} */
    function (a, b) {
      let result = 0;
      sortBys.some(function (sortBy) {
        if (!coinSorters[sortBy]) {
          throw new Error(`unrecognized sort '${sortBy}'`);
        }

        //@ts-ignore - TODO
        result = coinSorters[sortBy](sortatizeUtxo(a), sortatizeUtxo(b));
        return result;
      });
      return result;
    },
  );

  let maxLen = Wallet.toDash(utxos[0].satoshis).toFixed(8).length + 1;
  // TODO show both
  //let amountLabel = "Amount".padStart(maxLen, " ");
  let amountLabel = "Denom Stamp".padStart(maxLen + 1, " ");

  if (jsonOut) {
    console.info(JSON.stringify(utxos, null, 2));
    return;
  }
  console.info();
  console.info(`    ${amountLabel}  Coin (Addr:Tx:Out)    Wallet`);

  let totalSats = 0;
  let totalMDash = 0;
  let totalDirt = 0;
  let totalStamps = 0;
  let numCoins = utxos.length;

  /** @type {Object.<String, Boolean>} */
  let usedAddrs = {};
  utxos.forEach(
    /** @param {MiniUtxo} utxo */
    function (utxo) {
      totalSats += utxo.satoshis;

      let satsStr = utxo.satoshis.toString();

      // Get mDash and up
      // 9 876 543 21 (9.876) => 9 876
      // 109 876 543 21 (109.876) => 109 876
      let mDashStr = satsStr.slice(0, -5);
      if (!mDashStr) {
        mDashStr = "0";
      }
      let mDash = parseInt(mDashStr, 10);
      totalMDash += mDash;

      // Get float value without any rounding errors
      let faceValue = mDash / 1000;
      let faceValueStr = faceValue.toFixed(3);
      faceValue = parseFloat(faceValueStr);

      // Get less than mDash
      // 9 876 543 21 => 543 21
      // 109 876 543 21 => 543 21
      let dirtStr = satsStr.slice(-5);
      let dirt = parseInt(dirtStr, 10);

      let stamp = `${dirt}`.padStart(5, "0");
      let isStamp = 0 === dirt % 200;
      if (isStamp) {
        let numStamps = dirt / 200;
        totalStamps += numStamps;
        stamp = `s*${numStamps}`.padStart(5, " ");
      } else {
        totalDirt += dirt;
      }

      let denomLen = maxLen - 5;
      let denom = faceValueStr.padStart(denomLen, " ");
      let dashAmount = `${denom} ${stamp}`;

      let txId = utxo.txId.slice(0, 6);

      let addrId = utxo.address.slice(0, 9);
      let reused = " ";
      if (!usedAddrs[utxo.address]) {
        usedAddrs[utxo.address] = true;
      } else {
        reused = `*`;
      }

      let walletName = safe.cache.addresses[utxo.address].wallet;

      console.info(
        `    ${dashAmount}  ${addrId}:${txId}:${utxo.outputIndex} ${reused}  ${walletName}`,
      );
    },
  );

  let totalFaceValue = totalMDash / 1000;
  let totalFaceValueStr = totalFaceValue.toFixed(3).padStart(5, " ");
  let baseExtraStamps = totalStamps % numCoins;
  baseExtraStamps = Math.floor(baseExtraStamps);
  let baseStampsEach = totalStamps / numCoins;
  baseStampsEach = Math.floor(baseStampsEach);

  console.info("--------------------------------------------------");
  console.info(`     ${numCoins} coins`);
  console.info(
    `     ${totalFaceValueStr} s*${totalStamps} (s*${baseStampsEach}/c + s*${baseExtraStamps} + ${totalDirt}) [total]`,
  );

  let minStamps = wallet.__MIN_STAMPS__ + 1;
  let minStampValue = numCoins * wallet.__STAMP__ * minStamps;
  let maxFaceValue = totalSats - minStampValue;

  let faceValue = maxFaceValue / wallet.__MIN_DENOM__;
  faceValue = Math.floor(faceValue);

  let dirtValue = maxFaceValue % wallet.__MIN_DENOM__;
  dirtValue += minStampValue;

  let numStamps = dirtValue / wallet.__STAMP__;
  numStamps = Math.floor(numStamps);
  let extraDirt = dirtValue % wallet.__STAMP__;

  let stampsEach = numStamps / numCoins;
  stampsEach = Math.floor(stampsEach);
  let extraStamps = numStamps % numCoins;

  let faceDash = faceValue / 1000;
  let faceDashStr = faceDash.toFixed(3);
  console.info(
    `     ${faceDashStr} s*${numStamps} (s*${stampsEach}/c + s*${extraStamps} + ${extraDirt}) [total]`,
  );
}

/** @param {WalletUtxo} utxo */
function sortatizeUtxo(utxo) {
  return Object.assign({}, utxo, {
    wallet: utxo.wallet
      .toLowerCase()
      // make contacts sort lower
      .replace(/^@/, "|"),
  });
}

/**
 * @param {String} addr
 * @param {MiniUtxo} utxo
 * @returns {String} - `${addrId}:${txId}:${utxo.outputIndex}` (18 chars)
 */
function utxoToCoin(addr, utxo) {
  let addrId = addr.slice(0, 9);
  let txId = utxo.txId.slice(0, 6);

  return `${addrId}:${txId}:${utxo.outputIndex}`;
}

function toUrl(xpub, addr, denoms, amount, opts) {
  if (!addr) {
    addr = "";
  }
  if (!opts) {
    opts = {};
  }

  // TODO tdash, et al
  let coinScheme = "dash";
  let query = {};
  if (xpub) {
    query.xpub = xpub;
    if (!opts.size) {
      opts.size = "mini";
    }
  }
  if (denoms?.length) {
    query.denoms = denoms.join(",");
  }
  if (amount) {
    query.amount = amount;
  }
  let search = new URLSearchParams(query).toString();

  // impossible compatibility (should be allowed either way)
  //let slashes = "//";
  let slashes = "";
  let content = `${coinScheme}:${slashes}${addr}?${search}`;
  return content;
}

function toQrAscii(xpub, addr, denoms, amount, opts) {
  if (!opts) {
    opts = {};
  }

  let content = toUrl(xpub, addr, denoms, amount, opts);

  if ("svg" === opts?.format) {
    return Qr.svg(content);
  }

  return Qr.ascii(content, {
    format: "ascii",
    indent: opts.indent ?? 4,
    size: opts.size,
    invert: opts.invert,
  });
}

/** @type {Subcommand} */
async function stat(config, wallet, args) {
  let [addrPrefix] = args;
  if (!addrPrefix) {
    throw Error(`Usage: dashwallet stat <addr-like>`);
  }

  let addrInfos = await wallet.findAddrs(addrPrefix);
  if (!addrInfos.length) {
    let searchable = !offline && addrPrefix.length === ADDR_CHAR_LEN;
    if (!searchable) {
      console.error();
      console.error(`'${addrPrefix}' did not match any address in any wallets`);
      console.error();
      process.exit(1);
      return;
    }

    let utxos = await config.dashsight.getCoreUtxos(addrPrefix);
    if (jsonOut) {
      let json = JSON.stringify(utxos, null, 2);
      json = colorize(json);
      console.info(json);
      return;
    }
    addrInfos = [
      {
        wallet: "(not imported)",
        hdpath: "-",
        index: "-",
        address: addrPrefix,
        addr: addrPrefix,
        utxos: utxos,
      },
    ];
  }

  if (addrInfos.length > 1) {
    let errLines = [
      `'${addrPrefix}' matches the following addresses (pick one):`,
    ];
    errLines.push("");
    addrInfos.forEach(
      /** @param {Required<WalletAddress>} addrInfo */
      function (addrInfo) {
        let address = addrInfo.address || addrInfo.addr;
        errLines.push(`    ${address}`);
      },
    );

    let err = new Error(errLines.join("\n"));
    //@ts-ignore
    err.type = "E_BAD_INPUT";
    throw err;
  }

  if (!addrInfos[0].utxos) {
    let addrs = addrInfos.map(
      /** @param {Required<WalletAddress>} addrInfo */
      function (addrInfo) {
        let address = addrInfo.address || addrInfo.addr;
        return address;
      },
    );
    addrInfos = await wallet.stat({ addrs: addrs });
  }

  addrInfos.forEach(printAddrInfo);

  /** @param {WalletAddress} addrInfo */
  function printAddrInfo(addrInfo) {
    // TODO timestamp
    let address = addrInfo.address || addrInfo.addr;
    let totalBalance = Wallet.getBalance(addrInfo.utxos);
    let dashBalance = Wallet.toDash(totalBalance).toFixed(8);
    console.info(
      `${address} (${dashBalance}) - ${addrInfo.wallet}:${addrInfo.hdpath}/${addrInfo.index}`,
    );
    if (addrInfo.utxos.length > 1) {
      addrInfo.utxos.forEach(
        /** @param {MiniUtxo} utxo */
        function (utxo) {
          console.info(`    ${utxo.satoshis}`);
        },
      );
    }
  }
}

main()
  .then(async function (wallet) {
    if (!wallet) {
      process.exit(0);
    }

    // TODO 'q' to quit with process.stdin listener?
    let syncMsg = "syncing... (ctrl+c to quit)";
    if (jsonOut) {
      console.error();
      console.error(syncMsg);
    } else {
      console.info();
      console.info(syncMsg);
    }
    let now = Date.now();
    await wallet.sync({ now: now, staletime: config.staletime });
    console.info();

    process.exit(0);
  })
  .catch(function (err) {
    if ("E_BAD_INPUT" === err.type) {
      console.error("Error:");
      console.error();
      console.error(err.message);
      console.error();
      process.exit(1);
      return;
    }

    if (err.code) {
      console.error(`${err.code}:`);
      console.error();
      console.error(err.message);
      if ("E_BREAK_CHANGE" === err.code) {
        console.error(
          `select an additional coin, or pass --break-change to redenominate`,
        );
      }
      console.error();
      process.exit(1);
      return;
    }

    console.error("Fail:");
    console.error(err.stack || err);
    if (err.failedTx) {
      console.error(
        "Failed Transaciton: (inspect at https://live.blockcypher.com/dash/decodetx/)",
      );
      console.error(err.failedTx);
    }
    if (err.response) {
      let resp = err.response;
      if (resp.toJSON) {
        resp = resp.toJSON();
      }
      console.error(resp);
    }
    process.exit(1);
  });

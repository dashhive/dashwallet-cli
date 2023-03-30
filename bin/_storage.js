"use strict";

let Fs = require("node:fs/promises");

let Storage = module.exports; //jshint ignore:line

/**
 * @param {FsStoreConfig} storeConfig
 * @param {Config} config
 */
Storage.create = function (storeConfig, config) {
  /**
   * Fetches all the config and wallet data
   * @returns {Promise<Safe>}
   */
  async function init() {
    let cache = await _init(storeConfig.cachePath);
    let payWallets = await _init(storeConfig.payWalletsPath);
    let preferences = await _init(storeConfig.preferencesPath);
    let privateWallets = await _init(storeConfig.privateWalletsPath);

    return {
      cache,
      payWallets,
      preferences,
      privateWallets,
    };
  }

  /**
   * Fetches all data from the file
   * @param {String} path
   */
  async function _init(path) {
    await Fs.mkdir(storeConfig.dir, { recursive: true });

    let fh = await Fs.open(path, "a");
    await fh.close();

    let text = await Fs.readFile(path, "utf8");
    let data = JSON.parse(text || "{}");
    /*
    data._path = function () {
      return path;
    };
    */
    // TODO find a better way to do this
    Object.defineProperty(data, "_path", {
      enumerable: false,
      value: function () {
        return path;
      },
    });

    return data;
  }

  /**
   * @typedef {Object<String, PayWallet>} DPayWallets
   * @typedef {Object<String, PrivateWallet>} DPrivateWallets
   */

  /**
   * Safely save the safe
   * TODO - encrypt private wallets
   * @param {Cache|DPayWallets|DPrivateWallets|Preferences} data
   * @returns {Promise<void>}
   */
  async function save(data) {
    if ("function" !== typeof data?._path) {
      let t = typeof data;
      let keys = Object.keys(data || {});
      throw new Error(
        `[Sanity Fail] no '_path' on 'data' (${t}: ${keys}) (probably a developer error)`,
      );
    }
    let path = data._path();
    await safeReplace(path, JSON.stringify(data, null, 2), "utf8");
  }

  return {
    init,
    save,
  };
};

/**
 * Safely replacing a file by renaming the original as a .bak before replacement
 * @param {String} filepath
 * @param {String|Uint8Array|Buffer} contents
 * @param {BufferEncoding?} [enc]
 */
async function safeReplace(filepath, contents, enc = null) {
  await Fs.writeFile(`${filepath}.tmp`, contents, enc);
  await Fs.unlink(`${filepath}.bak`).catch(Object);
  await Fs.rename(`${filepath}`, `${filepath}.bak`);
  await Fs.rename(`${filepath}.tmp`, `${filepath}`);
}

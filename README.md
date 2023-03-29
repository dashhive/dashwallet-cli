# [dashwallet-cli](https://github.com/dashhive/dashwallet-cli)

> A more civilized DASH Wallet CLI for a less civilized age...

```sh
dashwallet send @johndoe 1.0
```

```txt
Sent Đ1.0 to @johndoe!
```

# Install

1. Install [`node`](https://webinstall.dev/node)

   ```sh
   # Mac, Linux
   curl -sS https://webi.sh/node | sh

   # Windows
   curl.exe https://webi.ms/node | powershell
   ```

2. Install `dashwallet-cli`
   ```sh
   npm install --location=global dashwallet-cli@0.5
   ```

# CLI

```txt
dashwallet v0.5.2 - A more civilized wallet for a less civilized age

USAGE:
    dashwallet <subcommand> [flags] [options] [--] [args]

SUBCOMMANDS:
    accounts                           show accounts (and extra wallets)
    export <addr> [./dir/ or x.wif]    write private keys to disk
    contact <handle> [xpub-or-addr]    add contact or show xpubs & addrs
    generate address                   gen and store one-off wif
    import <./path/to.wif>             save private keys
    coins [--sort wallet,amount,addr]  show all spendable coins
    send <handle|pay-addr> <DASH>      send to an address or contact
                    [--dry-run] [--coins Xxxxx:xx:0,...]
    remove <addr> [--no-wif]           remove stand-alone key
    stat <addr>                        show current coins & balance
    sync                               update address caches
    version                            show version and exit

OPTIONS:
    DASH_ENV, -c, --config-name ''     use ~/.config/dash{.suffix}/
    --config-dir ~/.config/dash/       change full config path
    --json                             output as JSON (if possible)
    --sync                             wait for sync first
```

## Examples

```sh
# dashwallet contact <handle> [xpub-or-addr]
dashwallet contact @johndoe 'xpubXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
dashwallet contact @kraken 'Xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
```

```txt
Send DASH to '<handle>' at this address:
Xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

Share this address with '<handle>':
xpubXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

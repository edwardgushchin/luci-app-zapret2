# luci-app-zapret2

Minimal LuCI panel for a **manually installed `zapret2`** on OpenWrt / GL.iNet routers.

Originally built and tested on:
- **GL.iNet Flint 2 (GL-MT6000)**
- **OpenWrt 25.12.2**
- manual `zapret2` install in **`/opt/zapret2`**
- init service at **`/etc/init.d/zapret2`**

## What it shows

Menu path:
- **Services → Zapret2**

The panel displays:
- service state;
- autorun state;
- running instance count;
- PIDs;
- `nfqws2` version;
- active `nfqws2` command line;
- current queue rules (`list_table` output);
- current `/opt/zapret2/config`.

It also provides basic control buttons:
- Enable / Disable autorun
- Start / Restart / Stop
- Refresh
- Copy current command / rules / config sections

## Localization

The panel is runtime-localized and currently supports:
- **English** — default/base language
- **Russian** — automatically selected when the current LuCI / browser locale starts with `ru`

There is no manual language switch in the panel itself.
The UI language is chosen automatically from the current LuCI page language (with browser locale as fallback).

## Important scope

This package is **not** a full-featured upstream GUI for `zapret2`.
It is a compact operational panel for setups where:
- `zapret2` is already installed manually;
- config lives in `/opt/zapret2/config`;
- LuCI only needs status + basic control + visibility into the active runtime.

## Requirements

The panel expects the following paths to exist on the router:
- `/etc/init.d/zapret2`
- `/opt/zapret2/config`
- `/opt/zapret2/nfq2/nfqws2`

## Repository layout

```text
.
├─ htdocs/
│  └─ luci-static/resources/view/zapret2/status.js
├─ root/
│  └─ usr/share/
│     ├─ luci/menu.d/luci-app-zapret2.json
│     └─ rpcd/acl.d/luci-app-zapret2.json
├─ Makefile
└─ README.md
```

## Buildroot packaging

This repository is structured like a standard LuCI package.
You can place it into an OpenWrt feed or package tree and build it with the rest of the image.

## Manual installation on a running router

If you only want to install the panel files on a router that already has `zapret2`, copy these files:
- `root/usr/share/luci/menu.d/luci-app-zapret2.json` → `/usr/share/luci/menu.d/`
- `root/usr/share/rpcd/acl.d/luci-app-zapret2.json` → `/usr/share/rpcd/acl.d/`
- `htdocs/luci-static/resources/view/zapret2/status.js` → `/www/luci-static/resources/view/zapret2/`

Then reload LuCI components:

```sh
rm -f /tmp/luci-indexcache /tmp/luci-modulecache/* 2>/dev/null || true
/etc/init.d/rpcd reload || /etc/init.d/rpcd restart
/etc/init.d/uhttpd reload || /etc/init.d/uhttpd restart
```

## Notes

- This panel is intentionally read-mostly, with only basic service control.
- It does not try to edit `zapret2` strategy internals yet.
- It assumes LuCI JS views and rpcd ACLs available on modern OpenWrt builds.

## License

MIT

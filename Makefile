#
# Minimal LuCI panel for manually installed zapret2
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-zapret2
PKG_VERSION:=0.1.0
PKG_RELEASE:=2
PKG_LICENSE:=MIT
PKG_MAINTAINER:=Eduard Gushchin

LUCI_TITLE:=Minimal LuCI panel for manually installed zapret2
LUCI_DEPENDS:=+rpcd
LUCI_PKGARCH:=all

define Package/$(PKG_NAME)/description
 Minimal LuCI panel for a manually installed zapret2 runtime.
 Expects /etc/init.d/zapret2 and /opt/zapret2/config to exist.
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	rm -f /tmp/luci-index*
	rm -rf /tmp/luci-modulecache/
	/etc/init.d/rpcd reload >/dev/null 2>&1 || true
	[ -f "/etc/init.d/uhttpd" ] && /etc/init.d/uhttpd reload >/dev/null 2>&1 || true
fi
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature

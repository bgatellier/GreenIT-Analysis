import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
    manifest: {
        name: 'GreenIT-Analysis',
        homepage_url: "https://github.com/cnumr/GreenIT-Analysis",
        icons: {
            48: "icons/logo-48.png"
        },
        permissions: [
            "activeTab","tabs","browsingData","scripting"
        ],
        host_permissions: [
            "*://*/*"
        ],
        action: {
            default_icon: "icons/logo-48.png",
            default_title: "GreenIT-Analysis",
            default_popup: "menu.html"
        },
        default_locale: "en"
    }
});

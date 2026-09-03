# Glenwood Sheriff's Department Community Portal

A fully static, animated Arma Reforger roleplay community portal built with vanilla HTML, CSS, and JavaScript for GitHub Pages.

## Included pages

- `index.html` — Discord-gated landing page, department information, roster, server status, and sheriff incident reporting
- `dashboard.html` — Discord-connected MDT login and local paperwork review desk
- `style.css` — responsive tactical design and animation system
- `script.js` — Discord OAuth, webhook delivery, local caching, and administrative review actions

## Discord configuration

Open `script.js` and replace the clearly marked values at the top:

1. `DISCORD_CLIENT_ID` — configured for the Glenwood Sheriffs Department application
2. `DISCORD_REDIRECT_URI`
3. `EMPLOYMENT_WEBHOOK_URL`
4. `INCIDENT_WEBHOOK_URL`
5. `ADMIN_DISCORD_USER_IDS` — configured for Grizzly's Discord account

In the Discord Developer Portal, add this exact OAuth2 redirect:

```text
https://shadowrp-cad.github.io/glenwood-sheriffs-paperwork-portal/dashboard.html
```

The staff dashboard can only be entered through Discord OAuth. Add Grizzly's Discord user ID to the admin allowlist before publishing credentials.

## Optional server status

Set `SERVER_STATUS_ENDPOINT` to an HTTPS endpoint that permits browser requests and returns:

```json
{ "online": true, "players": 42, "maxPlayers": 64 }
```

## Important GitHub Pages limitations

- Anything placed in `script.js`, including webhook URLs, is publicly readable. Use a serverless proxy for production webhook delivery.
- `localStorage` belongs to one browser on one device. Public submissions made on other devices will reach Discord when configured, but they will not appear in Grizzly's local MDT archive.
- Client-side OAuth can identify a Discord user, but it cannot provide strong server-enforced authorization on its own.

For shared cross-device records and secure roles, connect the interface to a backend database and server-side Discord OAuth flow.

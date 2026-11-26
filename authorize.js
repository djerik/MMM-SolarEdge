#!/usr/bin/env node
/*
 * One-time OAuth setup for MMM-SolarEdge (SolarEdge Monitoring API v2, "Site Access").
 *
 *   node authorize.js <clientId> <clientSecret>
 *
 * Opens nothing by itself: it prints the SolarEdge Connect link, you approve access in a
 * browser and paste the address you were redirected to. The tokens end up in tokens.json,
 * which node_helper.js keeps refreshed from then on.
 */
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const TOKEN_FILE = path.join(__dirname, "tokens.json");
const TOKEN_URL = "https://monitoringapi.solaredge.com/v2/oauth2/token";

function ask(question) {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer.trim()); }));
}

async function main() {
	const [clientId, clientSecret] = process.argv.slice(2);
	if (!clientId || !clientSecret) {
		console.error("Usage: node authorize.js <clientId> <clientSecret>");
		process.exit(1);
	}

	console.log("\n1. Open this link in a browser and sign in as the owner of the site:\n");
	console.log("   https://connect.solaredge.com/authorize?client_id=" + encodeURIComponent(clientId) + "\n");
	console.log("2. Approve access. The browser is then sent to your redirect URI. A connection");
	console.log("   error on that page is fine, the address bar is all that is needed.\n");

	const answer = await ask("3. Paste the full address from the address bar (or just the code): ");
	let code = answer;
	let siteId;
	let redirectUri;
	try {
		const url = new URL(answer);
		code = url.searchParams.get("code");
		siteId = url.searchParams.get("site_id");
		redirectUri = url.origin + url.pathname;
	} catch (error) { /* not a URL, treat the input as the code */ }

	if (!code) throw new Error("No authorization code found in what you pasted.");
	if (!siteId) siteId = await ask("   Site ID: ");
	if (!siteId) throw new Error("A site ID is required.");

	const request = { grant_type: "authorization_code", code: code, client_id: clientId, client_secret: clientSecret };
	if (redirectUri) request.redirect_uri = redirectUri;

	const response = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(request),
	});
	const body = await response.json().catch(() => ({}));
	if (!response.ok || !body.access_token || !body.refresh_token) {
		throw new Error("Token exchange failed: " + response.status + " " + (body.error_description || body.error || body.message || ""));
	}

	let all = {};
	try { all = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8")); } catch (error) { /* first run */ }
	all[String(siteId)] = {
		access_token: body.access_token,
		refresh_token: body.refresh_token,
		expires_at: Date.now() + (Number(body.expires_in) || 7200) * 1000,
	};
	fs.writeFileSync(TOKEN_FILE, JSON.stringify(all, null, 2), { mode: 0o600 });

	console.log("\nDone. Tokens for site " + siteId + " saved to " + TOKEN_FILE);
	console.log("Use siteId: \"" + siteId + "\" in config.js and restart MagicMirror.");
}

main().catch(error => {
	console.error("\n" + error.message);
	process.exit(1);
});

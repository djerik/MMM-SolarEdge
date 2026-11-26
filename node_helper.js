var NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");

// SolarEdge Monitoring API v2 (v1 was shut down on 2026-11-03).
// Docs: https://api-docs.solaredge.com/docs/developer-platform/mxj41549n0nxk-migrating-from-v1-to-v2

const TOKEN_FILE = path.join(__dirname, "tokens.json");
// Every successful call costs one credit and the free tier only has 2,000 per month,
// so never poll faster than the API's own 15 minute resolution.
const MIN_INTERVAL = 15 * 60 * 1000;
// Lifetime energy and the totals of previous months barely change during a day.
const SLOW_INTERVAL = 12 * 60 * 60 * 1000;

function pad(n) {
	return String(n).padStart(2, "0");
}

// Local date as YYYY-MM-DD
function dateKey(d) {
	return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

// Local time as ISO 8601 with UTC offset. v2 rejects datetimes without a time zone.
function isoLocal(d) {
	const offset = -d.getTimezoneOffset();
	const sign = offset >= 0 ? "+" : "-";
	const abs = Math.abs(offset);
	return dateKey(d) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds())
		+ sign + pad(Math.floor(abs / 60)) + ":" + pad(abs % 60);
}

function toWh(value, unit) {
	const factor = { WH: 1, KWH: 1e3, MWH: 1e6, GWH: 1e9 }[unit || "WH"] || 1;
	return value * factor;
}

// Sums the buckets whose (site local) timestamp matches the filter
function sumValues(response, filter) {
	return ((response && response.values) || [])
		.filter(v => v && v.value != null && filter(String(v.timestamp)))
		.reduce((sum, v) => sum + toWh(v.value, response.unit), 0);
}

module.exports = NodeHelper.create({
	start: function () {
		console.log("Starting node helper: " + this.name);
		this.sites = {};
		this.refreshing = {};
	},

	socketNotificationReceived: function (notification, payload) {
		var self = this;

		if (notification === "GET_SOLAR") {
			const config = payload.config;
			const siteId = String(config.siteId);

			this.getData(config)
				.then(data => self.sendSocketNotification("SOLAR_DATA", data))
				.catch(error => {
					console.error(self.name + ": " + error.message);
					self.sendSocketNotification("SOLAR_ERROR", { siteId: siteId, message: error.message });
				});
		}
	},

	// Returns cached data when it is fresh enough, so several browser clients
	// (or a page reload) do not spend extra API credits.
	getData: function (config) {
		const siteId = String(config.siteId);
		const state = this.sites[siteId] = this.sites[siteId] || {};
		const interval = Math.max(Number(config.refInterval) || 0, MIN_INTERVAL);

		if (state.inflight) return state.inflight;
		if (state.data && Date.now() - state.fetchedAt < interval - 30 * 1000) {
			return Promise.resolve(state.data);
		}

		state.inflight = this.fetchAll(config, state, false).finally(() => { state.inflight = null; });
		return state.inflight;
	},

	fetchAll: async function (config, state, isRetry) {
		const siteId = String(config.siteId);
		const useOAuth = Boolean(config.clientId);
		const headers = useOAuth
			? { "Authorization": "Bearer " + await this.getAccessToken(config, isRetry) }
			: { "X-API-Key": config.apiKey };

		const now = new Date();
		const startYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
		const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const startYear = new Date(now.getFullYear(), 0, 1);
		const todayKey = dateKey(now);
		const yesterdayKey = dateKey(startYesterday);
		const monthKey = todayKey.substring(0, 7);
		// On the 1st of the month yesterday belongs to the previous month
		const dailyFrom = startYesterday < startMonth ? startYesterday : startMonth;

		try {
			const [power, daily] = await Promise.all([
				this.api(config, headers, "/power", {
					from: isoLocal(new Date(now.getTime() - 60 * 60 * 1000)), to: isoLocal(now), resolution: "QUARTER_HOUR", unit: "W",
				}),
				this.api(config, headers, "/energy", {
					from: isoLocal(dailyFrom), to: isoLocal(now), resolution: "DAY", unit: "WH",
				}),
			]);

			// The slow moving values are fetched rarely to save credits
			if (!state.slowAt || Date.now() - state.slowAt > SLOW_INTERVAL || state.slowMonthKey !== monthKey) {
				try {
					const [lifetime, monthly] = await Promise.all([
						this.api(config, headers, "/lifetime-energy"),
						now.getMonth() === 0 ? null : this.api(config, headers, "/energy", {
							from: isoLocal(startYear), to: isoLocal(now), resolution: "MONTH", unit: "WH",
						}),
					]);
					state.lifetime = lifetime && lifetime.energy != null ? toWh(lifetime.energy, lifetime.unit) : null;
					state.previousMonths = sumValues(monthly, ts => ts.substring(0, 7) < monthKey);
					state.slowAt = Date.now();
					state.slowMonthKey = monthKey;
				} catch (error) {
					if (error.status === 401) throw error;
					console.error(this.name + ": could not fetch lifetime/year data: " + error.message);
					if (state.slowMonthKey !== monthKey) state.previousMonths = null;
				}
			}

			// Latest 15 minute bucket that has a value is the best "current power" v2 offers
			const samples = ((power && power.values) || []).filter(v => v && v.value != null);
			const month = sumValues(daily, ts => ts.substring(0, 7) === monthKey);

			state.data = {
				siteId: siteId,
				currentPower: samples.length ? samples[samples.length - 1].value : 0,
				today: sumValues(daily, ts => ts.substring(0, 10) === todayKey),
				yesterday: sumValues(daily, ts => ts.substring(0, 10) === yesterdayKey),
				month: month,
				year: state.previousMonths == null ? null : state.previousMonths + month,
				lifetime: state.lifetime == null ? null : state.lifetime,
			};
			state.fetchedAt = Date.now();
			return state.data;
		} catch (error) {
			if (error.status === 401) {
				// The access token may have been revoked or expired early: refresh once and retry
				if (useOAuth && !isRetry) return this.fetchAll(config, state, true);
				throw new Error(useOAuth
					? "SolarEdge rejected the OAuth token (401). Run 'node authorize.js' in the module folder again."
					: "SolarEdge rejected the API key (401). Old v1 keys no longer work: create a new one at developer.solaredge.com.");
			}
			throw error;
		}
	},

	api: async function (config, headers, endpoint, params) {
		const base = (config.baseUrl || "https://monitoringapi.solaredge.com/v2").replace(/\/+$/, "");
		const query = params ? "?" + new URLSearchParams(params).toString() : "";
		const response = await fetch(base + "/sites/" + encodeURIComponent(config.siteId) + endpoint + query, { headers: headers });

		if (!response.ok) {
			let detail = "";
			try {
				const body = await response.json();
				detail = body.detail || body.message || body.error_description || body.title || "";
			} catch (e) { /* no JSON body */ }
			const error = new Error("SolarEdge API " + endpoint + " failed: " + response.status + (detail ? " " + detail : ""));
			error.status = response.status;
			throw error;
		}
		return response.json();
	},

	loadTokens: function () {
		try {
			return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
		} catch (error) {
			return {};
		}
	},

	// Access tokens last 2 hours. Every refresh also returns a new refresh token and
	// invalidates the old one, so the newest pair must always be written to disk.
	getAccessToken: function (config, forceRefresh) {
		const siteId = String(config.siteId);
		const token = this.loadTokens()[siteId];

		if (!token || !token.refresh_token) {
			return Promise.reject(new Error("No OAuth tokens for site " + siteId + ". Run 'node authorize.js' in the module folder."));
		}
		if (!forceRefresh && token.access_token && Date.now() < token.expires_at - 5 * 60 * 1000) {
			return Promise.resolve(token.access_token);
		}
		if (!this.refreshing[siteId]) {
			this.refreshing[siteId] = this.refreshToken(config, token.refresh_token)
				.finally(() => { delete this.refreshing[siteId]; });
		}
		return this.refreshing[siteId];
	},

	refreshToken: async function (config, refreshToken) {
		const base = (config.baseUrl || "https://monitoringapi.solaredge.com/v2").replace(/\/+$/, "");
		const response = await fetch(base + "/oauth2/token", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				grant_type: "refresh_token",
				refresh_token: refreshToken,
				client_id: config.clientId,
				client_secret: config.clientSecret,
			}),
		});
		const body = await response.json().catch(() => ({}));

		if (!response.ok || !body.access_token) {
			throw new Error("Could not refresh the SolarEdge token: " + response.status + " "
				+ (body.error_description || body.error || body.message || "")
				+ ". Run 'node authorize.js' in the module folder again.");
		}

		const all = this.loadTokens();
		all[String(config.siteId)] = {
			access_token: body.access_token,
			refresh_token: body.refresh_token || refreshToken,
			expires_at: Date.now() + (Number(body.expires_in) || 7200) * 1000,
		};
		const tmp = TOKEN_FILE + ".tmp";
		fs.writeFileSync(tmp, JSON.stringify(all, null, 2), { mode: 0o600 });
		fs.renameSync(tmp, TOKEN_FILE);
		return body.access_token;
	},
});

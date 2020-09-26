
var request = require('request');
var NodeHelper = require("node_helper");

module.exports = NodeHelper.create({

	start: function() {
		console.log("Starting node helper: " + this.name);

	},

	socketNotificationReceived: function(notification, payload) {
		var self = this;
		console.log("Notification: " + notification + " Payload: " + payload);

		if(notification === "GET_SOLAR") {
			let yesterday = (function(d){ d.setDate(d.getDate()-1); return d})(new Date);
			const yesterday_date = yesterday.toISOString().substring(0, 10);
			
			var solarEdgeUrl = payload.config.url + payload.config.siteId + "/overview?api_key=" + payload.config.apiKey;
			const solarEdgeYesterdayUrl = payload.config.url + payload.config.siteId + "/energy?timeUnit=DAY&endDate=" + yesterday_date + "&startDate=" + yesterday_date + "&api_key=" + payload.config.apiKey;
			request(solarEdgeUrl, function (error, response, body) {
				if (!error && response.statusCode == 200) {
					var jsonData = JSON.parse(body);
					request(solarEdgeYesterdayUrl, function (error, response, body)
					{
						if (!error && response.statusCode == 200)
						{
							let yesterData = JSON.parse(body);
							jsonData.yesterday = yesterData.energy.values[0].value;
						}

						self.sendSocketNotification("SOLAR_DATA", jsonData);
					});
				}
			});
		}
	},
});

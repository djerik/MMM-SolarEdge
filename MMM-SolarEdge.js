/*
* Magic Mirror module for displaying SolarEdge data
* By djerik, forked from https://github.com/bertieuk/MMM-SolarEdge, forked from Thomas Krywitsky https://github.com/tkrywit/MMM-Solar
* MIT Licensed
*/

Module.register("MMM-SolarEdge",{
    // Default module config.
    defaults: {
        baseUrl: "https://monitoringapi.solaredge.com/v2",
        clientId: "", //Site Access (OAuth) app from developer.solaredge.com, enter in config.js not here
        clientSecret: "",
        apiKey: "", //Only for installer accounts with a v2 Fleet Access key
        siteId: "12345", //Sample site
        refInterval: 1000 * 60 * 60, //1 hour. Each refresh costs 2 API credits, the free tier has 2,000 per month
        basicHeader: false,
    },

    start: function() {
        // Logging appears in Chrome developer tools console
        Log.info("Starting module: " + this.name);

        this.titles = ["Current Power:", "Today:", "Yesterday:", "This Month:", "This Year:", "Lifetime Energy:"];
        this.suffixes = ["Watts", "kWh", "kWh", "kWh", "MWh"];
        this.results = ["Loading", "Loading", "Loading", "Loading", "Loading"];
        this.loaded = false;
        this.getSolarData();

        if (this.config.basicHeader) {
            this.data.header = 'SolarEdge PV';
        }

        var self = this;
        //Schedule updates
        setInterval(function() {
            self.getSolarData();
            self.updateDom();
        }, this.config.refInterval);
    },



    //Import additional CSS Styles
    getStyles: function() {
    return ['solar.css']
    },

    //Contact node helper for solar data
    getSolarData: function() {
        Log.info("SolarApp: getting data");

        this.sendSocketNotification("GET_SOLAR", {
            config: this.config
          });
    },

    //Handle node helper response
    socketNotificationReceived: function(notification, payload) {
    if (String(payload.siteId) !== String(this.config.siteId)) {
            return;
        }
    if (notification === "SOLAR_ERROR") {
            Log.error("SolarApp: " + payload.message);
            this.error = payload.message;
            this.updateDom();
        }
    if (notification === "SOLAR_DATA") {
            //Energy values are in Wh, null means the value could not be fetched
            var kWh = function(wh) { return wh == null ? "-" : (wh / 1000).toFixed(2) + " kWh"; };
	    var currentPower = payload.currentPower;
	    if (currentPower > 1000) {
               this.results[0] = (currentPower / 1000).toFixed(2) + " kW";
            } else {
               this.results[0] = Math.round(currentPower) + " Watts";
            }
            this.results[1] = kWh(payload.today);
	    this.results[2] = kWh(payload.yesterday);
            this.results[3] = kWh(payload.month);
            this.results[4] = kWh(payload.year);
            this.results[5] = payload.lifetime == null ? "-" : (payload.lifetime / 1000000).toFixed(2) + " MWh";
            this.error = null;
            this.loaded = true;
            this.updateDom(1000);
        }
    },

    // Override dom generator.
    getDom: function() {

        var wrapper = document.createElement("div");
	if ((this.config.apiKey === "" && this.config.clientId === "") || this.config.siteId === "") {
	    wrapper.innerHTML = "Missing configuration.";
	    return wrapper;
	}

        //Display loading while waiting for API response
        if (!this.loaded) {
      	    wrapper.innerHTML = this.error ? this.error : "Loading...";
            wrapper.className = "small dimmed";
            return wrapper;
      	}

        var tb = document.createElement("table");

        if (!this.config.basicHeader) {
            var imgDiv = document.createElement("div");
            var img = document.createElement("img");
            img.src = "/modules/MMM-SolarEdge/solar_white.png";

            var sTitle = document.createElement("p");
            sTitle.innerHTML = "SolarEdge PV";
            sTitle.className += " thin normal";
            imgDiv.appendChild(img);
    	      imgDiv.appendChild(sTitle);

            var divider = document.createElement("hr");
            divider.className += " dimmed";
            wrapper.appendChild(imgDiv);
            wrapper.appendChild(divider);
        }

      	for (var i = 0; i < this.results.length; i++) {
        		var row = document.createElement("tr");

        		var titleTr = document.createElement("td");
        		var dataTr = document.createElement("td");

        		titleTr.innerHTML = this.titles[i];
				dataTr.innerHTML = this.results[i];
        		titleTr.className += " medium regular bright";
        		dataTr.className += " medium light normal align-right";

        		row.appendChild(titleTr);
        		row.appendChild(dataTr);

        		tb.appendChild(row);
      	}
        wrapper.appendChild(tb);
        return wrapper;
    }
});

/*
* Magic Mirror module for displaying SolarEdge data
* By djerik, forked from https://github.com/bertieuk/MMM-SolarEdge, forked from Thomas Krywitsky https://github.com/tkrywit/MMM-Solar
* MIT Licensed
*/

Module.register("MMM-SolarEdge",{
    // Default module config.
    defaults: {
        url: "https://monitoringapi.solaredge.com/site/",
        apiKey: "", //Enter API key in config.js not here
        siteId: "12345", //Sample site
        refInterval: 1000 * 60 * 5, //5 minutes
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
    if (notification === "SOLAR_DATA") {
	    var currentPower = payload.overview.currentPower.power;
	    if (currentPower > 1000) {
               this.results[0] = (currentPower / 1000).toFixed(2) + " kW";
            } else {
               this.results[0] = currentPower + " Watts";
            }
            this.results[1] = (payload.overview.lastDayData.energy / 1000).toFixed(2) + " kWh";
	    this.results[2] = (payload.overview.yesterday.energy / 1000).toFixed(2) + " kWh";
            this.results[3] = (payload.overview.lastMonthData.energy / 1000).toFixed(2) + " kWh";
            this.results[4] = (payload.overview.lastYearData.energy / 1000).toFixed(2) + " kWh";
            this.results[5] = (payload.overview.lifeTimeData.energy / 1000000).toFixed(2) + " MWh";
            this.loaded = true;
            this.updateDom(1000);
        }
    },

    // Override dom generator.
    getDom: function() {

        var wrapper = document.createElement("div");
	if (this.config.apiKey === "" || this.config.siteId === "") {
	    wrapper.innerHTML = "Missing configuration.";
	    return wrapper;
	}

        //Display loading while waiting for API response
        if (!this.loaded) {
      	    wrapper.innerHTML = "Loading...";
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
//        		dataTr.innerHTML = this.results[i] + " " + this.suffixes[i];
            dataTr.innerHTML = this.results[i];
        		titleTr.className += " medium regular bright";
        		dataTr.classname += " medium light normal";

        		row.appendChild(titleTr);
        		row.appendChild(dataTr);

        		tb.appendChild(row);
      	}
        wrapper.appendChild(tb);
        return wrapper;
    }
});

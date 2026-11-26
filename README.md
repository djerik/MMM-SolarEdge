# MMM-SolarEdge
A Solar Module for MagicMirror2 designed to integrate with a SolarEdge System

## Dependencies
  * A [MagicMirror<sup>2</sup>](https://github.com/MichMich/MagicMirror) installation

## Installation
  1. Clone repo into MagicMirror/modules directory
  2. Create a SolarEdge developer application and authorize it (instructions below).
  3. Create an entry in 'config/config.js' with your Client ID, Client Secret, SiteID, and any config options.

 **Example:**
```
 {
    module: 'MMM-SolarEdge',
	position: 'bottom_left',
	config: {
		clientId: "################", //From your own SolarEdge developer application
		clientSecret: "################",
		siteId: "12345", //SolarEdge site ID
	}
 },
```
**Note:** Only enter your Client ID and Client Secret in the `config.js` file. They are yours alone, _do not_ post or use them elsewhere.

## Sample
![alt text](https://github.com/bertieuk/MMM-SolarEdge/blob/master/SolarEdge.png "Example")

## Optional Config
| **Option** | **Description** |
| --- | --- |
| `basicHeader` | Set to `true` to substitute the 'Solar PV' text and graphic for the default MagicMirror header |
| `refInterval` | Milliseconds between refreshes. Default is 1 hour, minimum is 15 minutes. See "API credits" below before lowering it |
| `apiKey` | Installer accounts only: a v2 Fleet Access API key, used instead of `clientId` and `clientSecret` |

## Access to the SolarEdge API
SolarEdge shut down the old Monitoring API (v1) on November 3, 2026. The API keys that were
entered as `apiKey` no longer work, and site owners now have to use OAuth instead.

  1. Sign in at https://developer.solaredge.com with the login you use for the mySolarEdge app
     or https://monitoring.solaredge.com. You must be the owner of the site. Fill in the developer profile.
  2. Click **Create Application**, choose **Monitoring API** and **Site Access**. Set the Redirect URI to
     `http://localhost:8080/oauth/callback` and select the `SITE_DATA` scope.
  3. Copy the Client ID and the Client Secret. The secret is only shown once.
  4. In the module folder run `node authorize.js <clientId> <clientSecret>`. Open the link it prints,
     approve access, and paste the address the browser is sent to back into the terminal. The browser
     showing a connection error at that point is expected.
  5. Put `clientId`, `clientSecret` and the `siteId` the script prints in `config.js` and restart MagicMirror.

The script saves the tokens in `tokens.json` in the module folder, and the module keeps them refreshed.
If the mirror is off for more than 14 days the tokens expire and step 4 has to be repeated.

Installers with a company account can instead create a **Fleet Access** application and set its key as `apiKey`.

## API credits
The free tier of the new API allows 2,000 calls per month. Each refresh uses 2 calls, plus 4 calls a day
for the yearly and lifetime totals, so the default interval of 1 hour uses about 1,560 calls a month.
Refreshing every 30 minutes or faster needs a paid tier.

## Notes
  * Current power is the latest 15 minute average, the new API no longer has an instantaneous value.
  * Days and months are split using the time zone of the mirror, which should match the time zone of the site.
